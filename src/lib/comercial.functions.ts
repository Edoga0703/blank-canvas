import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveCompanyIdCached } from "./company-cache";
import { z } from "zod";

export const registerSale = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    contato_nome: z.string().min(1, "Nome do contato é obrigatório"),
    contato_numero: z.string().min(8, "Número do contato inválido"),
    descricao: z.string().optional(),
    valor_cents: z.number().positive("O valor deve ser positivo"),
    vendido_em: z.string(),
    owner_id: z.string().uuid("ID do vendedor inválido").optional(),
    canal: z.string().optional(),
    metodo_pagamento: z.string().optional(),
    custo_lead_cents: z.number().optional(),
    item_tipo: z.enum(["produto", "servico"]).optional(),
    item_id: z.string().uuid().optional(),
    item_nome: z.string().optional(),
  }).parse(d))
  .handler(async ({ context, data }) => {
    const companyId = await resolveCompanyIdCached(context.supabase, context.userId);
    const ownerId = data.owner_id || context.userId;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 1. Ensure contact exists as a CRM card
    const cleanNum = data.contato_numero.replace(/\D/g, "");
    
    const { data: existing } = await context.supabase
      .from("crm_cards")
      .select("id, stage_id, pipeline_id")
      .eq("company_id", companyId)
      .eq("numero", cleanNum)
      .order("updated_at", { ascending: false }).limit(1).maybeSingle();

    let cardId = existing?.id;
    let stageId = existing?.stage_id;
    let pipelineId = existing?.pipeline_id;

    if (!existing) {
      // Create contact if doesn't exist
      const { data: firstStage } = await supabaseAdmin
        .from("crm_stage")
        .select("id, nome, pipeline_id")
        .eq("company_id", companyId)
        .order("ordem", { ascending: true })
        .limit(1)
        .maybeSingle();

      const { data: newCard, error: cardError } = await supabaseAdmin
        .from("crm_cards")
        .insert({
          company_id: companyId,
          user_id: ownerId,
          numero: cleanNum,
          nome: data.contato_nome,
          status: firstStage?.nome ?? "Contatos",
          stage_id: firstStage?.id ?? null,
          pipeline_id: firstStage?.pipeline_id ?? null,
          ultima_em: new Date().toISOString(),
          canal_chat: data.canal || "manual"
        })
        .select("id, stage_id, pipeline_id")
        .single();

      if (cardError) throw new Error("Erro ao criar contato: " + cardError.message);
      cardId = newCard.id;
      stageId = newCard.stage_id;
      pipelineId = newCard.pipeline_id;
    }

    // 2. Register sale
    const { data: novaVenda, error: saleError } = await context.supabase
      .from("crm_venda")
      .insert({
        company_id: companyId,
        card_id: cardId,
        owner_id: ownerId,
        contato_numero: cleanNum,
        contato_nome: data.contato_nome,
        descricao: data.descricao || null,
        valor_cents: data.valor_cents,
        vendido_em: data.vendido_em,
        stage_id: stageId,
        pipeline_id: pipelineId,
        canal: data.canal || "manual",
        metodo_pagamento: data.metodo_pagamento || "Pix",
        custo_lead_cents: data.custo_lead_cents || 0,
        created_by: context.userId,
        item_tipo: data.item_tipo,
        item_id: data.item_id,
        item_nome: data.item_nome,
      })
      .select("id")
      .single();

    if (saleError) throw new Error("Erro ao registrar venda: " + saleError.message);

    // 2b. Espelha o pedido na Olist quando o plugin estiver ativo (best-effort)
    try {
      const { capacidadeAtiva } = await import("@/lib/plugin-gate.server");
      if (await capacidadeAtiva(context.supabase, companyId, "olist")) {
        const { getOlistConfig, criarPedidoOlist } = await import("@/lib/olist.server");
        const cfg = await getOlistConfig(context.supabase, companyId);
        if (cfg?.autoPedido && novaVenda?.id) {
          const r = await criarPedidoOlist(cfg.token, {
            contato_nome: data.contato_nome,
            contato_numero: cleanNum,
            descricao: data.descricao ?? null,
            valor_cents: data.valor_cents,
            item_nome: data.item_nome ?? null,
          });
          await context.supabase
            .from("crm_venda")
            .update({ olist_pedido_id: r.id || r.numero, olist_situacao: "aberto" } as any)
            .eq("id", novaVenda.id);
        }
      }
    } catch (e) {
      console.error("[olist] falha ao criar pedido da venda:", e);
    }

    // 2c. Espelha a venda nas integrações por chave conectadas (best-effort)
    try {
      const { enviarVendaIntegracoes } = await import("@/lib/integracoes/runtime.server");
      await enviarVendaIntegracoes(companyId, {
        contato_nome: data.contato_nome ?? null,
        contato_numero: cleanNum,
        descricao: data.descricao ?? null,
        item_nome: data.item_nome ?? null,
        valor_cents: data.valor_cents,
      });
    } catch (e) {
      console.error("[integracoes] falha ao enviar venda:", e);
    }

    // 2d. Dispara evento Purchase en Meta Conversions API (CAPI) si está activo
    if (cardId) {
      try {
        const { getMetaCapiConfig, sendMetaConversionForLead } = await import("@/lib/meta-capi.server");
        const capiCfg = await getMetaCapiConfig(companyId);
        if (capiCfg.ativo && capiCfg.auto_send_on_sale) {
          void sendMetaConversionForLead({
            companyId,
            cardId,
            eventName: "Purchase",
            value: Number((data.valor_cents / 100).toFixed(2)),
            dedupKey: `sale_${novaVenda?.id || cardId}_${Date.now()}`,
          }).catch((e) => console.warn("[meta-capi.sale] Error:", e?.message));
        }
      } catch (e) {
        console.warn("[meta-capi.sale] Best-effort error:", e);
      }
    }

    // Marca o contato como cliente após a venda
    if (cardId) {
      await context.supabase
        .from("crm_cards")
        .update({ tipo_contato: "cliente" })
        .eq("id", cardId)
        .eq("company_id", companyId);
    }

    return { ok: true };
  });

export const getGoals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    yearMonth: z.string(),
  }).parse(d))
  .handler(async ({ context, data }) => {
    const companyId = await resolveCompanyIdCached(context.supabase, context.userId);
    const { data: goals, error } = await context.supabase
      .from("crm_goals" as any)
      .select("*")
      .eq("company_id", companyId)
      .eq("year_month", data.yearMonth);

    if (error) throw error;
    return (goals || []) as any[];
  });

export const saveGoal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    userId: z.string().uuid().nullable(), // null = general goal
    yearMonth: z.string(),
    valueCents: z.number().nonnegative(),
  }).parse(d))
  .handler(async ({ context, data }) => {
    const companyId = await resolveCompanyIdCached(context.supabase, context.userId);
    
    // Check if user is admin/owner
    const { data: membership } = await context.supabase
      .from("company_user")
      .select("role")
      .eq("company_id", companyId)
      .eq("user_id", context.userId)
      .single();
    
    const isAdmin = membership?.role === "admin" || membership?.role === "owner";
    
    // If setting someone else's goal or general goal, must be admin
    if (!isAdmin && (data.userId === null || data.userId !== context.userId)) {
      throw new Error("Apenas administradores podem definir metas gerais ou para outros usuários.");
    }

    const { error } = await context.supabase
      .from("crm_goals" as any)
      .upsert({
        company_id: companyId,
        user_id: data.userId,
        year_month: data.yearMonth,
        value_cents: data.valueCents,
      }, { onConflict: "company_id, user_id, year_month" });

    if (error) throw error;
    return { ok: true };
  });

export const getCompanyMembers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const companyId = await resolveCompanyIdCached(context.supabase, context.userId);
    if (!companyId) return [] as Array<{ user_id: string; role: string | null; nome: string | null; email: string | null; avatar_url: string | null }>;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: cu } = await supabaseAdmin
      .from("company_user")
      .select("user_id, role, ativo")
      .eq("company_id", companyId)
      .eq("ativo", true);

    const ids = (cu ?? []).map((r: any) => r.user_id);
    if (!ids.length) return [];

    const { data: profs } = await supabaseAdmin
      .from("profiles")
      .select("user_id, nome, email, avatar_url")
      .in("user_id", ids);

    const pmap = new Map((profs ?? []).map((p: any) => [p.user_id, p]));
    return (cu ?? []).map((r: any) => {
      const p: any = pmap.get(r.user_id) ?? {};
      return {
        user_id: r.user_id,
        role: r.role ?? null,
        nome: p.nome ?? (p.email ? String(p.email).split("@")[0] : null),
        email: p.email ?? null,
        avatar_url: p.avatar_url ?? null,
      };
    });
  });

export const updateSale = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    id: z.string().uuid(),
    contato_nome: z.string().min(1).optional(),
    descricao: z.string().nullable().optional(),
    valor_cents: z.number().positive().optional(),
    vendido_em: z.string().optional(),
    owner_id: z.string().uuid().nullable().optional(),
    metodo_pagamento: z.string().nullable().optional(),
    canal: z.string().nullable().optional(),
    item_tipo: z.enum(["produto", "servico"]).nullable().optional(),
    item_id: z.string().uuid().nullable().optional(),
    item_nome: z.string().nullable().optional(),
  }).parse(d))
  .handler(async ({ context, data }) => {
    const companyId = await resolveCompanyIdCached(context.supabase, context.userId);
    const { id, ...patch } = data;
    const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) as any;
    const { error } = await context.supabase
      .from("crm_venda")
      .update(clean)
      .eq("id", id)
      .eq("company_id", companyId);
    if (error) throw new Error("Erro ao atualizar venda: " + error.message);
    return { ok: true };
  });

export const deleteSale = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const companyId = await resolveCompanyIdCached(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("crm_venda")
      .delete()
      .eq("id", data.id)
      .eq("company_id", companyId);
    if (error) throw new Error("Erro ao excluir venda: " + error.message);
    return { ok: true };
  });
