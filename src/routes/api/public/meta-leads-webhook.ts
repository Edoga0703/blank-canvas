import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Webhook para Meta Lead Ads (Formulários do Facebook/Instagram).
 * 
 * 1. GET: Validação do webhook pela Meta (hub.verify_token).
 * 2. POST: Recebe o ID do lead, busca os dados na Graph API e salva no CRM.
 */
export const Route = createFileRoute("/api/public/meta-leads-webhook")({
  server: {
    handlers: {
      // Verificação do webhook na Meta
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const mode = url.searchParams.get("hub.mode");
        const token = url.searchParams.get("hub.verify_token");
        const challenge = url.searchParams.get("hub.challenge") ?? "";
        
        // O token deve ser configurado no painel da Meta e no CRM (ou ser um padrão seguro)
        const expected = process.env["META_WEBHOOK_VERIFY_TOKEN"] || "metrix_crm_leads_verify";

        if (mode === "subscribe" && token === expected) {
          return new Response(challenge, {
            status: 200,
            headers: { "Content-Type": "text/plain" },
          });
        }
        return new Response("Forbidden", { status: 403 });
      },

      POST: async ({ request }) => {
        const rawBody = await request.text();
        const signature = request.headers.get("x-hub-signature-256") || "";
        const appSecret = process.env["META_APP_SECRET"];

        // 1. Validar assinatura (se o secret estiver configurado)
        const allowUnsigned = process.env["META_ALLOW_UNSIGNED_WEBHOOKS"] === "true";
        if (!appSecret) {
          if (!allowUnsigned) {
            return new Response("Webhook secret not configured", { status: 503 });
          }
        } else {
          if (!signature.startsWith("sha256=")) {
            return new Response("Invalid signature", { status: 401 });
          }
          const hex = signature.slice("sha256=".length).trim();
          if (!/^[a-f0-9]{64}$/i.test(hex)) {
            return new Response("Invalid signature", { status: 401 });
          }
          const receivedBuf = Buffer.from(hex, "hex");
          const expectedBuf = createHmac("sha256", appSecret).update(rawBody).digest();
          if (receivedBuf.length !== expectedBuf.length || !timingSafeEqual(receivedBuf, expectedBuf)) {
            return new Response("Invalid signature", { status: 401 });
          }
        }

        let payload: any;
        try {
          payload = JSON.parse(rawBody);
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }

        // 2. Processar entradas
        const entries = payload.entry || [];
        for (const entry of entries) {
          const changes = entry.changes || [];
          for (const change of changes) {
            if (change.field !== "leadgen") continue;

            const leadId = change.value?.leadgen_id;
            const pageId = change.value?.page_id;
            const formId = change.value?.form_id;

            if (!leadId || !pageId) continue;

            // Inicia processamento em background
            void processLead(leadId, pageId, formId);
          }
        }

        return new Response("EVENT_RECEIVED", { status: 200 });
      }
    }
  }
});

/**
 * Busca dados do lead na Graph API e insere no CRM.
 */
async function processLead(leadId: string, pageId: string, formId?: string) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { resolveMetaLeadPageCredentials } = await import("@/lib/meta-leads.server");

    const creds = await resolveMetaLeadPageCredentials(supabaseAdmin, pageId);
    if (!creds?.accessToken || !creds.companyId) {
      console.error(`[meta-leads-webhook] Nenhum token encontrado para a página ${pageId}`);
      return;
    }

    const token = creds.accessToken;
    const companyId = creds.companyId;

    // 2. Buscar dados do lead na Graph API
    const graphUrl = `https://graph.facebook.com/v23.0/${leadId}?access_token=${token}`;
    const response = await fetch(graphUrl);
    const leadData = await response.json();

    if (leadData.error) {
      console.error("[meta-leads-webhook] Erro ao buscar lead na Meta:", leadData.error.message);
      return;
    }

    // 3. Normalizar campos (mapeamento padrão da Meta)
    const fieldData = leadData.field_data || [];
    let nome = "";
    let numero = "";
    let email = "";
    
    for (const field of fieldData) {
      const name = String(field.name).toLowerCase();
      const val = field.values?.[0] || "";
      
      if (name.includes("full_name") || name.includes("nome")) nome = val;
      else if (name.includes("phone") || name.includes("telefone") || name.includes("whatsapp")) numero = val;
      else if (name.includes("email")) email = val;
    }

    const cleanNumero = String(numero).replace(/\D/g, "");
    if (!cleanNumero) {
      console.warn("[meta-leads-webhook] Lead sem número de telefone válido:", leadId);
      return;
    }

    // 4. Inserir no CRM (reaproveitando lógica de crm_cards)
    // Buscamos a primeira etapa do funil comercial da empresa
    const { data: stages } = await (supabaseAdmin as any)
      .from("crm_stage")
      .select("id, pipeline_id, nome, distribution_queue_id, distribution_user_id, crm_pipeline!inner(tipo, distribution_queue_id)")
      .eq("company_id", companyId)
      .eq("crm_pipeline.tipo", "comercial")
      .order("ordem", { ascending: true })
      .limit(1);
    
    const firstStage = stages?.[0];


    const payload: any = {
      company_id: companyId,
      numero: cleanNumero,
      nome: nome || `Lead Meta ${leadId.slice(-4)}`,
      email: email || null,
      ultima_mensagem: `Lead capturado via Meta Ads (Form: ${formId || 'N/A'})`,
      ultima_em: new Date().toISOString(),
      canal_entrada: "ads_meta",
      primeiro_contato_em: new Date().toISOString(),
      origem: "meta_lead_ads",
      meta_lead_id: leadId,
      meta_form_id: formId
    };

    if (firstStage) {
      payload.pipeline_id = firstStage.pipeline_id;
      payload.stage_id = firstStage.id;
      payload.status = firstStage.nome;
    }

    // Upsert no CRM
    const { data: existing } = await (supabaseAdmin as any)
      .from("crm_cards")
      .select("id")
      .eq("company_id", companyId)
      .eq("numero", cleanNumero)
      .maybeSingle();

    let cardId: string;
    if (existing) {
      await (supabaseAdmin as any)
        .from("crm_cards")
        .update({
          ultima_mensagem: payload.ultima_mensagem,
          ultima_em: payload.ultima_em,
          meta_lead_id: leadId
        })
        .eq("id", existing.id);
      cardId = existing.id;
    } else {
      const { data: inserted, error } = await (supabaseAdmin as any)
        .from("crm_cards")
        .insert(payload)
        .select("id")
        .maybeSingle();
      
      if (error) {
        console.error("[meta-leads-webhook] Erro ao inserir card:", error.message);
        return;
      }
      cardId = inserted.id;
    }

    // 5. Atribuição de Dono (Fila de Distribuição)
    if (!existing) {
      try {
        const { pickLeadOwner } = await import("@/lib/crm-engine.server");
        const ownerId = await pickLeadOwner(supabaseAdmin, companyId, firstStage?.id);
        if (ownerId) {
          await (supabaseAdmin as any)
            .from("crm_cards")
            .update({ owner_id: ownerId })
            .eq("id", cardId);
        }
      } catch (e) {
        console.warn("[meta-leads-webhook] Erro ao atribuir dono:", e);
      }
    }

    // Registrar evento

    await (supabaseAdmin as any).from("lead_evento").insert({
      company_id: companyId,
      card_id: cardId,
      tipo: "captura",
      descricao: `Lead capturado automaticamente via Meta Lead Ads`
    });

    // Disparar automação de régua se existir
    try {
      const { processKanbanReguaForNumero } = await import("@/lib/kanban-engine.server");
      await processKanbanReguaForNumero(supabaseAdmin, companyId, cleanNumero);
    } catch (e) {
      console.warn("[meta-leads-webhook] Erro ao disparar régua:", e);
    }

    void import("@/lib/crm-lead-analyzer.server")
      .then(({ checkAndAnalyzeLeadCooldown }) => checkAndAnalyzeLeadCooldown(companyId, cleanNumero))
      .catch(() => null);

  } catch (err) {
    console.error("[meta-leads-webhook] Erro fatal no processamento do lead:", err);
  }
}
