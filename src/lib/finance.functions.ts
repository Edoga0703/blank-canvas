import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertSuper(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "super_admin")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Acesso negado");
}

const PAID = new Set(["purchase_approved", "subscription_renewed"]);
const NEGATIVE = new Set(["refunded", "chargeback"]);

const STATUS_MAP: Record<string, string> = {
  purchase_approved: "pago",
  subscription_renewed: "pago",
  refunded: "reembolsado",
  chargeback: "chargeback",
  payment_failed: "falhou",
  subscription_canceled: "cancelado",
};

/** Tolerância (dias) após o vencimento antes de a assinatura sair do MRR. */
const GRACE_DAYS = 5;

/**
 * Tipo normalizado do evento. O payload gravado já é o evento normalizado
 * (contém eventType/amountCents); só caímos no mapeamento por nome quando não há.
 */
function typeOf(row: any): string {
  const fromPayload = row?.payload?.eventType;
  if (typeof fromPayload === "string" && fromPayload) return fromPayload;
  const raw = String(row?.event_type ?? "").toLowerCase();
  if (!raw) return "unknown";
  if (raw.includes("renew") || raw.includes("renov")) return "subscription_renewed";
  if (raw.includes("refund") || raw.includes("estorn")) return "refunded";
  if (raw.includes("chargeback")) return "chargeback";
  if (raw.includes("cancel")) return "subscription_canceled";
  if (raw.includes("reject") || raw.includes("fail") || raw.includes("late") || raw.includes("overdue"))
    return "payment_failed";
  if (raw.includes("approved") || raw.includes("paid") || raw.includes("aprovad") || raw.includes("complet"))
    return "purchase_approved";
  if (raw.includes("pix_created") || raw.includes("pending") || raw.includes("waiting")) return "aguardando";
  return "unknown";
}

function amountOf(row: any): number | null {
  const p = row?.payload;
  if (p && typeof p.amountCents === "number") return p.amountCents;
  if (p && typeof p.amount_cents === "number") return p.amount_cents;
  return null;
}

function isBillable(s: any, now = Date.now()): boolean {
  if (s.status !== "active" || s.cortesia) return false;
  const valor = s.valor_customizado_cents ?? s.plan?.preco_cents ?? 0;
  if (valor <= 0) return false;
  if (!s.current_period_end) return false;
  const end = new Date(s.current_period_end).getTime();
  return end >= now - GRACE_DAYS * 86_400_000;
}

function valorOf(s: any): number {
  return s.valor_customizado_cents ?? s.plan?.preco_cents ?? 0;
}

/** KPIs financeiros: MRR de plano + add-ons, faturamento realizado, reembolsos, inadimplência. */
export const financeOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuper(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const since = new Date();
    since.setMonth(since.getMonth() - 5, 1);
    since.setHours(0, 0, 0, 0);

    const [{ data: subs }, { data: addons }, { data: events }, { data: companies }] = await Promise.all([
      supabaseAdmin
        .from("subscription")
        .select(
          "id, company_id, status, cortesia, valor_customizado_cents, provider, current_period_end, plan:plan(id, nome, preco_cents)",
        ),
      supabaseAdmin
        .from("company_addon")
        .select("id, status, quantidade, provider, addon_product(id, nome, preco_cents)"),
      supabaseAdmin
        .from("billing_event_log")
        .select("id, provider, event_type, payload, created_at")
        .gte("created_at", since.toISOString())
        .order("created_at", { ascending: false })
        .limit(2000),
      supabaseAdmin.from("company").select("id, nome"),
    ]);

    const now = Date.now();
    const nomes = new Map((companies ?? []).map((c: any) => [c.id, c.nome]));
    const activeSubs = (subs ?? []).filter((s: any) => isBillable(s, now));
    const vencidas = (subs ?? []).filter(
      (s: any) => s.status === "active" && !s.cortesia && valorOf(s) > 0 && !isBillable(s, now),
    );

    const planoMrr = activeSubs.reduce((sum: number, s: any) => sum + valorOf(s), 0);
    const activeAddons = (addons ?? []).filter(
      (a: any) => a.status === "active" && a.provider !== "cortesia_master",
    );
    const addonMrr = activeAddons.reduce(
      (sum: number, a: any) => sum + (a.addon_product?.preco_cents ?? 0) * (a.quantidade ?? 1),
      0,
    );

    // Receita por plano
    const planMap = new Map<string, { nome: string; mrr: number; clientes: number }>();
    for (const s of activeSubs) {
      const p: any = (s as any).plan;
      const key = p?.id ?? "sem-plano";
      const prev = planMap.get(key) ?? { nome: p?.nome ?? "Sem plano", mrr: 0, clientes: 0 };
      prev.mrr += valorOf(s);
      prev.clientes += 1;
      planMap.set(key, prev);
    }

    // Receita por add-on
    const addonMap = new Map<string, { nome: string; mrr: number; clientes: number }>();
    for (const a of activeAddons) {
      const p: any = (a as any).addon_product;
      const key = p?.id ?? "sem-addon";
      const prev = addonMap.get(key) ?? { nome: p?.nome ?? "Add-on", mrr: 0, clientes: 0 };
      prev.mrr += (p?.preco_cents ?? 0) * ((a as any).quantidade ?? 1);
      prev.clientes += 1;
      addonMap.set(key, prev);
    }

    // Faturamento realizado por mês (últimos 6)
    const d0 = new Date();
    const buckets: { mes: string; recebido: number; reembolsos: number }[] = [];
    const idx = new Map<string, number>();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(d0.getFullYear(), d0.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      idx.set(key, buckets.length);
      buckets.push({
        mes: d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", ""),
        recebido: 0,
        reembolsos: 0,
      });
    }
    let recebidoMes = 0;
    let reembolsoMes = 0;
    let semValor = 0;
    let naoReconhecidos = 0;
    const monthKey = `${d0.getFullYear()}-${d0.getMonth()}`;
    const prevD = new Date(d0.getFullYear(), d0.getMonth() - 1, 1);
    const prevKey = `${prevD.getFullYear()}-${prevD.getMonth()}`;
    let recebidoMesAnterior = 0;

    for (const e of events ?? []) {
      const d = new Date((e as any).created_at);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      const i = idx.get(key);
      const amount = amountOf(e) ?? 0;
      const type = typeOf(e);
      if (type === "unknown") naoReconhecidos++;
      if (PAID.has(type)) {
        if (!amount) semValor++;
        if (i != null) buckets[i].recebido += amount;
        if (key === monthKey) recebidoMes += amount;
        if (key === prevKey) recebidoMesAnterior += amount;
      } else if (NEGATIVE.has(type)) {
        if (i != null) buckets[i].reembolsos += amount;
        if (key === monthKey) reembolsoMes += amount;
      }
    }

    // Próximos vencimentos (30 dias)
    const limite = now + 30 * 86_400_000;
    const proximosVencimentos = activeSubs
      .filter((s: any) => new Date(s.current_period_end).getTime() <= limite)
      .map((s: any) => ({
        company_id: s.company_id,
        nome: nomes.get(s.company_id) ?? "—",
        valor_cents: valorOf(s),
        vence_em: s.current_period_end,
        dias: Math.ceil((new Date(s.current_period_end).getTime() - now) / 86_400_000),
      }))
      .sort((a, b) => a.dias - b.dias)
      .slice(0, 12);

    return {
      planoMrr,
      addonMrr,
      mrr: planoMrr + addonMrr,
      arpu: activeSubs.length ? Math.round((planoMrr + addonMrr) / activeSubs.length) : 0,
      clientesPagantes: activeSubs.length,
      recebidoMes,
      recebidoMesAnterior,
      reembolsoMes,
      inadimplentes: (subs ?? []).filter((s: any) => s.status === "past_due" || s.status === "unpaid").length,
      vencidas: vencidas.map((s: any) => ({
        company_id: s.company_id,
        nome: nomes.get(s.company_id) ?? "—",
        valor_cents: valorOf(s),
        venceu_em: s.current_period_end,
        provider: s.provider,
      })),
      proximosVencimentos,
      conciliacao: { semValor, naoReconhecidos },
      receitaPorPlano: Array.from(planMap.values()).sort((a, b) => b.mrr - a.mrr),
      receitaPorAddon: Array.from(addonMap.values()).sort((a, b) => b.mrr - a.mrr),
      serie: buckets,
    };
  });

/** Um registro por cliente pagante: valor, vencimento, total já pago e último pagamento. */
export const listPayingCustomers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuper(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: subs, error }, { data: events }, { data: charges }] = await Promise.all([
      supabaseAdmin
        .from("subscription")
        .select(
          "id, company_id, status, cortesia, provider, buyer_email, valor_customizado_cents, current_period_end, created_at, plan:plan(id, nome, preco_cents)",
        )
        .eq("status", "active"),
      supabaseAdmin
        .from("billing_event_log")
        .select("matched_company_id, buyer_email, event_type, payload, created_at")
        .order("created_at", { ascending: false })
        .limit(3000),
      supabaseAdmin
        .from("billing_charge")
        .select("company_id, total_cents, status, paid_at")
        .eq("status", "paid"),
    ]);
    if (error) throw new Error(error.message);

    const ids = (subs ?? []).map((s: any) => s.company_id).filter(Boolean);
    let comps = new Map<string, any>();
    if (ids.length) {
      const { data: c } = await supabaseAdmin
        .from("company")
        .select("id, nome, email_corporativo, telefone, status_cobranca")
        .in("id", ids);
      comps = new Map((c ?? []).map((x: any) => [x.id, x]));
    }

    // Histórico de pagamentos por empresa (por id e por e-mail, para eventos não vinculados)
    const pagosPorEmpresa = new Map<string, { total: number; ultimo: string | null; qtd: number }>();
    const pagosPorEmail = new Map<string, { total: number; ultimo: string | null; qtd: number }>();
    for (const e of events ?? []) {
      if (!PAID.has(typeOf(e))) continue;
      const amount = amountOf(e) ?? 0;
      const cid = (e as any).matched_company_id;
      const mail = ((e as any).buyer_email ?? "").toLowerCase();
      const at = (e as any).created_at;
      if (cid) {
        const prev = pagosPorEmpresa.get(cid) ?? { total: 0, ultimo: null, qtd: 0 };
        prev.total += amount;
        prev.qtd += 1;
        if (!prev.ultimo || at > prev.ultimo) prev.ultimo = at;
        pagosPorEmpresa.set(cid, prev);
      } else if (mail) {
        const prev = pagosPorEmail.get(mail) ?? { total: 0, ultimo: null, qtd: 0 };
        prev.total += amount;
        prev.qtd += 1;
        if (!prev.ultimo || at > prev.ultimo) prev.ultimo = at;
        pagosPorEmail.set(mail, prev);
      }
    }
    for (const ch of charges ?? []) {
      const cid = (ch as any).company_id;
      if (!cid) continue;
      const prev = pagosPorEmpresa.get(cid) ?? { total: 0, ultimo: null, qtd: 0 };
      prev.total += (ch as any).total_cents ?? 0;
      prev.qtd += 1;
      const at = (ch as any).paid_at;
      if (at && (!prev.ultimo || at > prev.ultimo)) prev.ultimo = at;
      pagosPorEmpresa.set(cid, prev);
    }

    const now = Date.now();
    return (subs ?? [])
      .filter((s: any) => !s.cortesia && valorOf(s) > 0)
      .map((s: any) => {
        const comp = comps.get(s.company_id);
        const email = (comp?.email_corporativo ?? s.buyer_email ?? "").toLowerCase();
        const hist =
          pagosPorEmpresa.get(s.company_id) ??
          (email ? pagosPorEmail.get(email) : null) ?? { total: 0, ultimo: null, qtd: 0 };
        const end = s.current_period_end ? new Date(s.current_period_end).getTime() : null;
        const dias = end == null ? null : Math.ceil((end - now) / 86_400_000);
        const ativo = isBillable(s, now);
        return {
          id: s.id,
          company_id: s.company_id,
          nome: comp?.nome ?? "—",
          email: comp?.email_corporativo ?? s.buyer_email ?? null,
          telefone: comp?.telefone ?? null,
          plano: s.plan?.nome ?? "—",
          valor_cents: valorOf(s),
          provider: s.provider ?? "manual",
          proximo_vencimento: s.current_period_end,
          dias_para_vencer: dias,
          situacao: ativo ? (dias != null && dias <= 7 ? "vence_breve" : "em_dia") : "vencido",
          total_pago_cents: hist.total,
          pagamentos: hist.qtd,
          ultimo_pagamento: hist.ultimo,
          cliente_desde: s.created_at,
        };
      })
      .sort((a, b) => {
        const rank = (x: string) => (x === "vencido" ? 0 : x === "vence_breve" ? 1 : 2);
        return rank(a.situacao) - rank(b.situacao) || (a.dias_para_vencer ?? 0) - (b.dias_para_vencer ?? 0);
      });
  });

/** Faturas (eventos financeiros) de todos os clientes, com filtros. */
export const listMasterInvoices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { status?: string; q?: string; limit?: number }) => ({
    status: typeof d?.status === "string" ? d.status : "todos",
    q: typeof d?.q === "string" ? d.q.trim().slice(0, 120) : "",
    limit: Math.max(20, Math.min(500, Math.floor(d?.limit ?? 200))),
  }))
  .handler(async ({ context, data }) => {
    await assertSuper(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let q = supabaseAdmin
      .from("billing_event_log")
      .select("id, provider, event_type, buyer_email, external_id, matched_company_id, payload, created_at")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.q) q = q.ilike("buyer_email", `%${data.q}%`);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const companyIds = Array.from(
      new Set((rows ?? []).map((r: any) => r.matched_company_id).filter(Boolean)),
    ) as string[];
    let names = new Map<string, string>();
    if (companyIds.length) {
      const { data: comps } = await supabaseAdmin.from("company").select("id, nome").in("id", companyIds);
      names = new Map((comps ?? []).map((c: any) => [c.id, c.nome]));
    }

    const mapped = (rows ?? []).map((r: any) => {
      const t = typeOf(r);
      return {
        id: r.id,
        provider: r.provider,
        status: STATUS_MAP[t] ?? (t === "aguardando" ? "aguardando" : "outro"),
        evento: r.event_type,
        amount_cents: amountOf(r),
        buyer_email: r.buyer_email,
        external_id: r.external_id,
        company_id: r.matched_company_id,
        company_nome: r.matched_company_id ? names.get(r.matched_company_id) ?? null : null,
        created_at: r.created_at,
      };
    });
    return data.status === "todos" ? mapped : mapped.filter((m) => m.status === data.status);
  });

/** Assinaturas em atraso / suspensas / com ciclo vencido, com dias de atraso. */
export const listDelinquent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuper(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: subs, error } = await supabaseAdmin
      .from("subscription")
      .select(
        "id, company_id, status, cortesia, provider, buyer_email, current_period_end, plan:plan(nome, preco_cents), valor_customizado_cents",
      )
      .in("status", ["past_due", "unpaid", "active"]);
    if (error) throw new Error(error.message);

    const now = Date.now();
    const alvo = (subs ?? []).filter((s: any) => {
      if (s.cortesia || valorOf(s) <= 0) return false;
      if (s.status === "past_due" || s.status === "unpaid") return true;
      return s.status === "active" && !isBillable(s, now);
    });

    const ids = alvo.map((s: any) => s.company_id).filter(Boolean);
    let comps = new Map<string, any>();
    if (ids.length) {
      const { data: c } = await supabaseAdmin
        .from("company")
        .select("id, nome, email_corporativo, telefone, status_cobranca")
        .in("id", ids);
      comps = new Map((c ?? []).map((x: any) => [x.id, x]));
    }
    return alvo
      .map((s: any) => {
        const end = s.current_period_end ? new Date(s.current_period_end).getTime() : null;
        return {
          id: s.id,
          company_id: s.company_id,
          company_nome: comps.get(s.company_id)?.nome ?? "—",
          email: comps.get(s.company_id)?.email_corporativo ?? s.buyer_email ?? null,
          telefone: comps.get(s.company_id)?.telefone ?? null,
          status: s.status,
          provider: s.provider ?? "manual",
          status_cobranca: comps.get(s.company_id)?.status_cobranca ?? null,
          valor_cents: valorOf(s),
          plano: s.plan?.nome ?? "—",
          dias_atraso: end ? Math.max(0, Math.floor((now - end) / 86400000)) : null,
        };
      })
      .sort((a, b) => (b.dias_atraso ?? 0) - (a.dias_atraso ?? 0));
  });

/** Suspende o acesso de uma empresa inadimplente. */
export const suspendCompanyBilling = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { companyId: string; suspender: boolean }) => ({
    companyId: String(d.companyId),
    suspender: !!d.suspender,
  }))
  .handler(async ({ context, data }) => {
    await assertSuper(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("company")
      .update({ status_cobranca: data.suspender ? "suspenso" : "ativo" })
      .eq("id", data.companyId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ------------------------ Faturamento e projeção ------------------------ */

/**
 * Histórico completo de faturamento (líquido de reembolsos), tendência de
 * crescimento e projeção dos próximos 12 meses em três cenários.
 */
export const revenueProjection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuper(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: events }, { data: subs }, { data: settings }] = await Promise.all([
      supabaseAdmin
        .from("billing_event_log")
        .select("id, event_type, payload, created_at")
        .order("created_at", { ascending: true })
        .limit(10000),
      supabaseAdmin
        .from("subscription")
        .select("status, cortesia, valor_customizado_cents, current_period_end, plan:plan(preco_cents)"),
      (supabaseAdmin as any).from("master_settings").select("value").eq("key", "revenue_goal").maybeSingle(),
    ]);

    const now = new Date();
    const nowMs = now.getTime();

    // Série histórica mensal (12 meses) + acumulado desde o início
    const mk = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const hist: { mes: string; label: string; recebido: number; reembolsos: number; liquido: number }[] = [];
    const idx = new Map<string, number>();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      idx.set(mk(d), hist.length);
      hist.push({
        mes: mk(d),
        label: d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", ""),
        recebido: 0,
        reembolsos: 0,
        liquido: 0,
      });
    }

    let totalRecebido = 0;
    let totalReembolsos = 0;
    let primeiroPagamento: string | null = null;

    for (const e of events ?? []) {
      const type = typeOf(e);
      const amount = amountOf(e) ?? 0;
      const d = new Date((e as any).created_at);
      const i = idx.get(mk(d));
      if (PAID.has(type)) {
        totalRecebido += amount;
        if (!primeiroPagamento) primeiroPagamento = (e as any).created_at;
        if (i != null) hist[i].recebido += amount;
      } else if (NEGATIVE.has(type)) {
        totalReembolsos += amount;
        if (i != null) hist[i].reembolsos += amount;
      }
    }
    for (const h of hist) h.liquido = h.recebido - h.reembolsos;

    // MRR contratado hoje (mesma regra do resto do módulo)
    const billable = (subs ?? []).filter((s: any) => isBillable(s, nowMs));
    const mrr = billable.reduce((sum: number, s: any) => sum + valorOf(s), 0);

    // Crescimento médio mensal, medido nos meses fechados com receita
    const fechados = hist.slice(0, 11).filter((h) => h.liquido > 0);
    let crescimento = 0;
    if (fechados.length >= 2) {
      const taxas: number[] = [];
      for (let i = 1; i < fechados.length; i++) {
        const prev = fechados[i - 1].liquido;
        if (prev > 0) taxas.push((fechados[i].liquido - prev) / prev);
      }
      if (taxas.length) crescimento = taxas.reduce((a, b) => a + b, 0) / taxas.length;
    }
    // Limita a tendência para não gerar projeções irreais
    crescimento = Math.max(-0.2, Math.min(0.3, crescimento));

    const cenarios = {
      conservador: 0,
      base: crescimento,
      otimista: Math.max(crescimento * 1.6, crescimento + 0.05),
    };

    const projecao: { mes: string; label: string; conservador: number; base: number; otimista: number }[] = [];
    let cons = mrr;
    let base = mrr;
    let oti = mrr;
    for (let i = 1; i <= 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      cons = cons * (1 + cenarios.conservador);
      base = base * (1 + cenarios.base);
      oti = oti * (1 + cenarios.otimista);
      projecao.push({
        mes: mk(d),
        label: d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", ""),
        conservador: Math.round(cons),
        base: Math.round(base),
        otimista: Math.round(oti),
      });
    }

    const soma = (k: "conservador" | "base" | "otimista", n: number) =>
      projecao.slice(0, n).reduce((a, p) => a + p[k], 0);

    // Quanto ainda entra neste ano civil (projeção base) + já faturado no ano
    const anoAtual = now.getFullYear();
    const faturadoAno = hist
      .filter((h) => Number(h.mes.slice(0, 4)) === anoAtual)
      .reduce((a, h) => a + h.liquido, 0);
    const mesesRestantes = 11 - now.getMonth();
    const projetadoAno = faturadoAno + soma("base", mesesRestantes);

    const meta = Number((settings as any)?.value?.meta_anual_cents ?? 0) || 0;

    return {
      totalRecebido,
      totalReembolsos,
      totalLiquido: totalRecebido - totalReembolsos,
      primeiroPagamento,
      mesesAtivos: hist.filter((h) => h.liquido > 0).length,
      mediaMensal12m: Math.round(hist.reduce((a, h) => a + h.liquido, 0) / 12),
      mrr,
      clientesPagantes: billable.length,
      crescimento,
      cenarios,
      historico: hist,
      projecao,
      resumo: {
        prox3: { conservador: soma("conservador", 3), base: soma("base", 3), otimista: soma("otimista", 3) },
        prox6: { conservador: soma("conservador", 6), base: soma("base", 6), otimista: soma("otimista", 6) },
        prox12: { conservador: soma("conservador", 12), base: soma("base", 12), otimista: soma("otimista", 12) },
      },
      ano: { ano: anoAtual, faturado: faturadoAno, projetado: projetadoAno, meta },
    };
  });

/** Define a meta de faturamento do ano (em centavos). */
export const saveRevenueGoal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { metaAnualCents: number }) => ({ metaAnualCents: Math.max(0, Math.round(Number(d.metaAnualCents) || 0)) }))
  .handler(async ({ context, data }) => {
    await assertSuper(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any).from("master_settings").upsert({
      key: "revenue_goal",
      value: { meta_anual_cents: data.metaAnualCents },
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
