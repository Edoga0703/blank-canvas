import { normalizePhone } from "@/lib/br-phone";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { emptyTracking } from "@/lib/tracking-utils";

const bodySchema = z.object({
  company_token: z.string().min(10),
  numero: z.union([z.string(), z.number()]).optional().nullable(),
  telefone: z.union([z.string(), z.number()]).optional().nullable(),
  phone: z.union([z.string(), z.number()]).optional().nullable(),
  phone_number: z.union([z.string(), z.number()]).optional().nullable(),
  whatsapp: z.union([z.string(), z.number()]).optional().nullable(),
  nome: z.string().max(120).optional().nullable(),
  utm_source: z.string().max(200).optional().nullable(),
  utm_medium: z.string().max(200).optional().nullable(),
  utm_campaign: z.string().max(200).optional().nullable(),
  utm_term: z.string().max(200).optional().nullable(),
  utm_content: z.string().max(200).optional().nullable(),
  gclid: z.string().max(200).optional().nullable(),
  fbclid: z.string().max(200).optional().nullable(),
  referrer: z.string().max(500).optional().nullable(),
  first_page: z.string().max(500).optional().nullable(),
  mensagem: z.string().max(500).optional().nullable(),
}).passthrough();

function cors(res: Response) {
  res.headers.set("Access-Control-Allow-Origin", "*");
  res.headers.set("Access-Control-Allow-Headers", "content-type");
  res.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  return res;
}

export const Route = createFileRoute("/api/public/lead-capture")({
  server: {
    handlers: {
      OPTIONS: async () => cors(new Response(null, { status: 204 })),
      POST: async ({ request }) => {
        try {
          const json = await request.json();
          const body = bodySchema.parse(json);
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          const { data: tok } = await (supabaseAdmin as any)
            .from("api_token")
            .select("company_id, revogado")
            .eq("token", body.company_token)
            .maybeSingle();
          if (!tok || tok.revogado) return cors(new Response("invalid token", { status: 401 }));

          const raw = String(
            body.numero ?? body.telefone ?? body.phone ?? body.phone_number ?? body.whatsapp ?? ""
          );
          let numero = normalizePhone(raw);
          if (!numero || numero.length < 9) {
            return cors(
              new Response(
                `numero inválido (recebido: "${raw.slice(0, 40)}"). Envie o campo "numero" com formato internacional (ex: E.164).`,
                { status: 400 }
              )
            );
          }

          const { data: pipe } = await (supabaseAdmin as any)
            .from("crm_pipeline")
            .select("id")
            .eq("company_id", tok.company_id)
            .eq("tipo", "comercial")
            .order("ordem", { ascending: true })
            .limit(1)
            .maybeSingle();

          let firstStage: any = null;
          if (pipe?.id) {
            const { data: stages } = await (supabaseAdmin as any)
              .from("crm_stage")
              .select("id, pipeline_id, nome, ordem, distribution_queue_id, distribution_user_id")
              .eq("company_id", tok.company_id)
              .eq("pipeline_id", pipe.id)
              .order("ordem", { ascending: true });
            firstStage = stages?.[0] ?? null;
          }

          const tracking = { ...emptyTracking(), ...body };
          void tracking;
          // Lead que chega por esta rota veio sempre de um formulário/integração de
          // captura. As UTMs do anúncio ficam guardadas nos campos de rastreio,
          // mas o canal de entrada é "Formulário" (antes virava "Link com UTM").
          const canal = "formulario";

          const payload: any = {
            company_id: tok.company_id,
            numero,
            nome: body.nome || null,
            ultima_mensagem: body.mensagem?.slice(0, 240) || "Lead capturado via formulário",
            ultima_em: new Date().toISOString(),
            utm_source: body.utm_source ?? null,
            utm_medium: body.utm_medium ?? null,
            utm_campaign: body.utm_campaign ?? null,
            utm_term: body.utm_term ?? null,
            utm_content: body.utm_content ?? null,
            gclid: body.gclid ?? null,
            fbclid: body.fbclid ?? null,
            referrer: body.referrer ?? null,
            first_page: body.first_page ?? null,
            canal_entrada: canal,
            primeiro_contato_em: new Date().toISOString(),
            origem: body.utm_source || "formulario",
          };
          if (firstStage) {
            payload.pipeline_id = firstStage.pipeline_id;
            payload.stage_id = firstStage.id;
            payload.status = firstStage.nome;
          }

          const camposConhecidos = new Set([
            "company_token", "numero", "telefone", "phone", "phone_number", "whatsapp", "nome",
            "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
            "gclid", "fbclid", "referrer", "first_page", "mensagem",
          ]);
          const extrasRecebidos = Object.entries((json ?? {}) as Record<string, any>)
            .filter(([k, v]) => !camposConhecidos.has(k) && v != null && typeof v !== "object" && String(v).trim())
            .map(([k, v]) => ({ label: k, valor: String(v), campo_id: k, origem: "Integração" }));

          async function salvarExtras(cardId: string) {
            if (!extrasRecebidos.length) return;
            try {
              const { mergeCamposExtras } = await import("@/lib/lead-intake.server");
              await mergeCamposExtras(supabaseAdmin, cardId, extrasRecebidos);
            } catch (e: any) {
              console.warn("[lead-capture.extras]", e?.message);
            }
          }

          const { data: existing } = await (supabaseAdmin as any)
            .from("crm_cards")
            .select("id")
            .eq("company_id", tok.company_id)
            .eq("numero", numero)
            .maybeSingle();

          if (existing) {
            // não sobrescreve rastreio já existente
            await (supabaseAdmin as any).from("crm_cards")
              .update({ ultima_mensagem: payload.ultima_mensagem, ultima_em: payload.ultima_em })
              .eq("id", existing.id);
            await salvarExtras(existing.id);
            return cors(Response.json({ ok: true, card_id: existing.id, created: false }));
          }

          const { pickLeadOwner } = await import("@/lib/crm-engine.server");
          const ownerId = await pickLeadOwner(supabaseAdmin, tok.company_id, firstStage?.id);
          if (ownerId) payload.owner_id = ownerId;

          // user_id é obrigatório: usa o dono do lead ou o primeiro usuário ativo da empresa
          let effectiveUserId: string | null = ownerId ?? null;
          if (!effectiveUserId) {
            const { data: adminUser } = await (supabaseAdmin as any)
              .from("company_user")
              .select("user_id")
              .eq("company_id", tok.company_id)
              .eq("ativo", true)
              .limit(1)
              .maybeSingle();
            effectiveUserId = adminUser?.user_id ?? null;
          }
          if (!effectiveUserId) return cors(new Response("empresa sem usuário ativo", { status: 500 }));
          payload.user_id = effectiveUserId;

          const { data: inserted, error } = await (supabaseAdmin as any)
            .from("crm_cards")
            .insert(payload)
            .select("id")
            .maybeSingle();
          if (error) return cors(new Response(error.message, { status: 500 }));

          await salvarExtras(inserted.id);

          await (supabaseAdmin as any).from("lead_evento").insert({
            company_id: tok.company_id, card_id: inserted.id, tipo: "captura", descricao: `Lead via ${canal}`,
          });

          try {
            const { processKanbanReguaForNumero } = await import("@/lib/kanban-engine.server");
            await processKanbanReguaForNumero(supabaseAdmin, tok.company_id, numero);
          } catch (e: any) {
            console.warn("[lead-capture.regua]", e?.message);
          }

          void import("@/lib/crm-lead-analyzer.server")
            .then(({ checkAndAnalyzeLeadCooldown }) => checkAndAnalyzeLeadCooldown(tok.company_id, numero))
            .catch(() => null);

          return cors(Response.json({ ok: true, card_id: inserted.id, created: true }));
        } catch (e: any) {
          return cors(new Response(e?.message ?? "erro", { status: 400 }));
        }
      },
    },
  },
});
