import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveCompanyIdCached } from "./company-cache";

export type CartItem = { tipo: "addon" | "plugin"; id: string; quantidade: number };

async function assertCompanyAdmin(supabase: any, companyId: string) {
  const { data: isSuper } = await supabase.rpc("is_super_admin");
  if (isSuper) return;
  const { data, error } = await supabase.rpc("has_company_role", {
    _company_id: companyId,
    _roles: ["owner", "admin"],
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Acesso negado");
}

async function assertSuperAdmin(supabase: any) {
  const { data, error } = await supabase.rpc("is_super_admin");
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Acesso negado");
}

/** Resumo do plano + adicionais ativos + últimas cobranças. */
export const getMyBillingSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const companyId = await resolveCompanyIdCached(context.supabase, context.userId);
    await assertCompanyAdmin(context.supabase, companyId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: sub }, { data: company }, { data: addons }, { data: catalogo }, { data: charges }] =
      await Promise.all([
        supabaseAdmin
          .from("subscription")
          .select("status, plan_id, provider, current_period_end, proxima_cobranca, metodo_pagamento, valor_customizado_cents, cortesia")
          .eq("company_id", companyId).maybeSingle(),
        supabaseAdmin
          .from("company")
          .select("nome, status_cobranca, trial_ate, selected_plan_slug, creditos_saldo, creditos_resetam_em")
          .eq("id", companyId).maybeSingle(),
        supabaseAdmin
          .from("company_addon")
          .select("id, quantidade, status, current_period_end, addon_product(id, slug, nome, preco_cents)")
          .eq("company_id", companyId).eq("status", "active"),
        supabaseAdmin
          .from("addon_product").select("id, slug, nome, descricao, tipo, preco_cents, intervalo")
          .eq("ativo", true).order("ordem", { ascending: true }),
        supabaseAdmin
          .from("billing_charge")
          .select("id, status, metodo, total_cents, descricao, vencimento, paid_at, created_at, pix_copia_cola, pix_qrcode, payment_url")
          .eq("company_id", companyId).order("created_at", { ascending: false }).limit(12),
      ]);

    const { data: cfgGateway } = await (supabaseAdmin as any)
      .from("app_config").select("gateway_padrao, gateway_portal_url").limit(1).maybeSingle();

    const PLAN_COLS = "id, slug, nome, preco_cents, creditos_mensais, creditos_trial, limite_mensagens, checkout_url";
    let plano: any = null;
    if (sub?.plan_id) {
      const { data } = await supabaseAdmin.from("plan").select(PLAN_COLS).eq("id", sub.plan_id).maybeSingle();
      plano = data;
    } else if ((company as any)?.selected_plan_slug) {
      const { data } = await supabaseAdmin.from("plan").select(PLAN_COLS)
        .eq("slug", (company as any).selected_plan_slug).maybeSingle();
      plano = data;
    }
    const planoValor = sub?.valor_customizado_cents || plano?.preco_cents || 0;

    // Créditos de IA do ciclo atual (consumo x total disponível)
    const resetEm = (company as any)?.creditos_resetam_em ? new Date((company as any).creditos_resetam_em) : null;
    const inicioCiclo = resetEm
      ? new Date(resetEm.getTime() - 30 * 24 * 60 * 60 * 1000)
      : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const { data: led } = await supabaseAdmin
      .from("credit_ledger")
      .select("delta")
      .eq("company_id", companyId)
      .lt("delta", 0)
      .gte("created_at", inicioCiclo.toISOString())
      .limit(5000);
    const usadosIA = (led ?? []).reduce((acc: number, r: any) => acc + Math.abs(Number(r.delta ?? 0)), 0);
    const isTrial = sub?.status === "trialing" || (company as any)?.status_cobranca === "trial";
    const planoCreditos = isTrial
      ? Number(plano?.creditos_trial ?? 0)
      : Number(plano?.creditos_mensais ?? plano?.limite_mensagens ?? 0);
    const saldoIA = Number((company as any)?.creditos_saldo ?? 0);

    return {
      companyId,
      company,
      gateway: (cfgGateway?.gateway_padrao as string) ?? "kiwify",
      gatewayPortalUrl: (cfgGateway?.gateway_portal_url as string) ?? null,
      subscription: sub,
      plano,
      planoValorCents: sub?.cortesia ? 0 : planoValor,
      addons: addons ?? [],
      catalogo: catalogo ?? [],
      charges: charges ?? [],
      creditosIA: {
        usados: usadosIA,
        saldo: saldoIA,
        total: Math.max(planoCreditos, usadosIA + saldoIA),
        resetam_em: (company as any)?.creditos_resetam_em ?? null,
      },
    };
  });

/** Prévia do total sem criar cobrança. */
export const previewCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { items: CartItem[]; incluirPlano?: boolean }) => ({
    items: (d.items ?? []).slice(0, 30).map((i) => ({
      tipo: i.tipo === "plugin" ? ("plugin" as const) : ("addon" as const),
      id: String(i.id),
      quantidade: Math.min(50, Math.max(1, Number(i.quantidade ?? 1))),
    })),
    incluirPlano: !!d.incluirPlano,
  }))
  .handler(async ({ context, data }) => {
    const companyId = await resolveCompanyIdCached(context.supabase, context.userId);
    await assertCompanyAdmin(context.supabase, companyId);
    const { resolveCart } = await import("@/lib/billing/charges.server");
    return resolveCart(companyId, data.items, data.incluirPlano);
  });

/** Cria a cobrança única (PIX ou cartão). */
export const createCheckoutCharge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { items: CartItem[]; incluirPlano?: boolean; metodo?: "pix" | "card" }) => ({
    items: (d.items ?? []).slice(0, 30).map((i) => ({
      tipo: i.tipo === "plugin" ? ("plugin" as const) : ("addon" as const),
      id: String(i.id),
      quantidade: Math.min(50, Math.max(1, Number(i.quantidade ?? 1))),
    })),
    incluirPlano: !!d.incluirPlano,
    metodo: d.metodo === "card" ? ("card" as const) : ("pix" as const),
  }))
  .handler(async ({ context, data }) => {
    const companyId = await resolveCompanyIdCached(context.supabase, context.userId);
    await assertCompanyAdmin(context.supabase, companyId);
    const { createCharge } = await import("@/lib/billing/charges.server");
    return createCharge({
      companyId,
      items: data.items,
      incluirPlano: data.incluirPlano,
      metodo: data.metodo,
      origem: "checkout",
    });
  });

/** Consulta o status da cobrança no gateway (usado enquanto o QR está na tela). */
export const checkChargeStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => ({ id: String(d.id) }))
  .handler(async ({ context, data }) => {
    const companyId = await resolveCompanyIdCached(context.supabase, context.userId);
    await assertCompanyAdmin(context.supabase, companyId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: charge } = await supabaseAdmin
      .from("billing_charge").select("id, company_id").eq("id", data.id).maybeSingle();
    if (!charge || charge.company_id !== companyId) throw new Error("Cobrança não encontrada");
    const { syncChargeStatus } = await import("@/lib/billing/charges.server");
    return syncChargeStatus(data.id);
  });

/** Cancela uma cobrança pendente do próprio cliente. */
export const cancelMyCharge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => ({ id: String(d.id) }))
  .handler(async ({ context, data }) => {
    const companyId = await resolveCompanyIdCached(context.supabase, context.userId);
    await assertCompanyAdmin(context.supabase, companyId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: charge } = await supabaseAdmin
      .from("billing_charge").select("id, company_id, status").eq("id", data.id).maybeSingle();
    if (!charge || charge.company_id !== companyId) throw new Error("Cobrança não encontrada");
    if (charge.status === "paid") throw new Error("Cobrança já paga");
    await supabaseAdmin.from("billing_charge")
      .update({ status: "canceled", canceled_at: new Date().toISOString() }).eq("id", data.id);
    return { ok: true };
  });

// ---------- Master ----------

export const listChargesMaster = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { status?: string | null; busca?: string | null }) => ({
    status: d.status ?? null,
    busca: (d.busca ?? "").trim() || null,
  }))
  .handler(async ({ context, data }) => {
    await assertSuperAdmin(context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin
      .from("billing_charge")
      .select("id, company_id, status, metodo, total_cents, descricao, ciclo_ref, origem, vencimento, paid_at, created_at, erro, company(nome)")
      .order("created_at", { ascending: false })
      .limit(200);
    if (data.status) q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const filtradas = data.busca
      ? (rows ?? []).filter((r: any) =>
          (r.company?.nome ?? "").toLowerCase().includes(data.busca!.toLowerCase()))
      : rows ?? [];
    return filtradas;
  });

export const markChargePaidMaster = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => ({ id: String(d.id) }))
  .handler(async ({ context, data }) => {
    await assertSuperAdmin(context.supabase);
    const { settleCharge } = await import("@/lib/billing/charges.server");
    return settleCharge(data.id, { manual: true });
  });

export const syncChargeMaster = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => ({ id: String(d.id) }))
  .handler(async ({ context, data }) => {
    await assertSuperAdmin(context.supabase);
    const { syncChargeStatus } = await import("@/lib/billing/charges.server");
    return syncChargeStatus(data.id);
  });

/** Gera manualmente a cobrança de renovação de uma empresa. */
export const generateRenewalMaster = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { companyId: string; metodo?: "pix" | "card" }) => ({
    companyId: String(d.companyId),
    metodo: d.metodo === "card" ? ("card" as const) : ("pix" as const),
  }))
  .handler(async ({ context, data }) => {
    await assertSuperAdmin(context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { createCharge, cicloAtualRef } = await import("@/lib/billing/charges.server");
    const { data: addons } = await supabaseAdmin
      .from("company_addon").select("addon_product_id, quantidade")
      .eq("company_id", data.companyId).eq("status", "active");
    return createCharge({
      companyId: data.companyId,
      items: (addons ?? []).map((a: any) => ({ tipo: "addon" as const, id: a.addon_product_id, quantidade: a.quantidade })),
      incluirPlano: true,
      metodo: data.metodo,
      cicloRef: cicloAtualRef(),
      origem: "manual",
    });
  });

/** Dados do recibo de uma cobrança paga da própria empresa. */
export const getChargeReceipt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => ({ id: String(d.id) }))
  .handler(async ({ context, data }) => {
    const companyId = await resolveCompanyIdCached(context.supabase, context.userId);
    await assertCompanyAdmin(context.supabase, companyId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: charge } = await (supabaseAdmin as any)
      .from("billing_charge").select("*").eq("id", data.id).maybeSingle();
    if (!charge || charge.company_id !== companyId) throw new Error("Cobrança não encontrada");
    if (charge.status !== "paid") throw new Error("Recibo disponível apenas para cobranças pagas");

    const [{ data: itens }, { data: cfg }, { data: comp }, { data: billing }, { data: sub }] = await Promise.all([
      (supabaseAdmin as any).from("billing_charge_item").select("nome, quantidade, total_cents").eq("charge_id", charge.id),
      (supabaseAdmin as any).from("app_config").select("emissor").limit(1).maybeSingle(),
      (supabaseAdmin as any).from("company").select("nome, cnpj_cpf, email_corporativo").eq("id", companyId).maybeSingle(),
      (supabaseAdmin as any).from("company_billing").select("nome_responsavel, email_cobranca, cnpj_cpf").eq("company_id", companyId).maybeSingle(),
      (supabaseAdmin as any).from("subscription").select("current_period_end, plan:plan_id(nome)").eq("company_id", companyId).maybeSingle(),
    ]);

    return {
      invoice: {
        id: charge.id,
        provider: charge.provider ?? "abacatepay",
        event_type: charge.origem ?? null,
        event_label: "Pagamento confirmado",
        amount_cents: charge.total_cents,
        status: "pago" as const,
        metodo: charge.metodo === "card" ? "Cartão de crédito" : "PIX",
        periodo_fim: (sub as any)?.current_period_end ?? null,
        buyer_email: billing?.email_cobranca ?? comp?.email_corporativo ?? null,
        external_id: charge.external_id ?? null,
        created_at: charge.paid_at ?? charge.created_at,
      },
      emissor: {
        razao_social: "", cnpj: "", endereco: "", email: "", telefone: "", observacao: "",
        ...((cfg?.emissor ?? {}) as any),
      },
      pagador: {
        nome: billing?.nome_responsavel ?? comp?.nome ?? null,
        email: billing?.email_cobranca ?? comp?.email_corporativo ?? null,
        documento: billing?.cnpj_cpf ?? comp?.cnpj_cpf ?? null,
      },
      plano: (sub as any)?.plan?.nome ?? null,
      itens: (itens ?? []) as Array<{ nome: string; quantidade: number; total_cents: number }>,
    };
  });

/**
 * Gera um novo link de pagamento do ciclo atual (cartão recusado, troca de
 * cartão, cobrança reenviada). Respeita o gateway padrão configurado no Master.
 */
export const requestPaymentLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { motivo?: string | null }) => ({ motivo: (d?.motivo ?? "").toString().slice(0, 120) || null }))
  .handler(async ({ context, data }) => {
    const companyId = await resolveCompanyIdCached(context.supabase, context.userId);
    await assertCompanyAdmin(context.supabase, companyId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: cfg }, { data: company }, { data: sub }] = await Promise.all([
      (supabaseAdmin as any).from("app_config").select("gateway_padrao, gateway_portal_url").limit(1).maybeSingle(),
      (supabaseAdmin as any).from("company").select("nome, email_corporativo, selected_plan_slug").eq("id", companyId).maybeSingle(),
      (supabaseAdmin as any).from("subscription").select("plan_id").eq("company_id", companyId).maybeSingle(),
    ]);

    const gateway = (cfg?.gateway_padrao as string) ?? "kiwify";

    if (gateway !== "kiwify") {
      const { createCharge } = await import("@/lib/billing/charges.server");
      const charge: any = await createCharge({
        companyId, items: [], incluirPlano: true, metodo: "pix", origem: "checkout",
      });
      return { gateway, url: charge?.payment_url ?? null, charge };
    }

    let plano: any = null;
    if (sub?.plan_id) {
      const { data } = await (supabaseAdmin as any).from("plan").select("checkout_url").eq("id", sub.plan_id).maybeSingle();
      plano = data;
    }
    if (!plano?.checkout_url && company?.selected_plan_slug) {
      const { data } = await (supabaseAdmin as any).from("plan").select("checkout_url").eq("slug", company.selected_plan_slug).maybeSingle();
      plano = data;
    }
    if (!plano?.checkout_url) {
      const { data } = await (supabaseAdmin as any)
        .from("plan").select("checkout_url").eq("ativo", true).not("checkout_url", "is", null)
        .order("ordem", { ascending: true }).limit(1).maybeSingle();
      plano = data;
    }
    if (!plano?.checkout_url) throw new Error("Nenhum link de pagamento configurado. Fale com o suporte.");

    let url = String(plano.checkout_url);
    try {
      const u = new URL(url);
      if (company?.email_corporativo) u.searchParams.set("email", company.email_corporativo);
      u.searchParams.set("ref", companyId);
      url = u.toString();
    } catch {}

    try {
      await (supabaseAdmin as any).from("audit_log").insert({
        company_id: companyId,
        user_id: context.userId,
        acao: "payment_link_requested",
        recurso: "billing",
        detalhes: { gateway, motivo: data.motivo },
      });
    } catch {}

    return { gateway, url, portalUrl: (cfg?.gateway_portal_url as string) ?? null };
  });
