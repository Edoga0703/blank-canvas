import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveCompanyIdCached } from "./company-cache";
import { normalize, type BillingEventType } from "./billing/normalize";

export type InvoiceRow = {
  id: string;
  provider: string;
  event_type: string | null;
  event_label: string;
  amount_cents: number | null;
  status: "pago" | "reembolsado" | "chargeback" | "falhou" | "cancelado" | "outro";
  metodo: string | null;
  periodo_fim: string | null;
  buyer_email: string | null;
  external_id: string | null;
  created_at: string;
};

export type EmissorInfo = {
  razao_social: string;
  cnpj: string;
  endereco: string;
  email: string;
  telefone: string;
  observacao: string;
};

export type ReceiptData = {
  invoice: InvoiceRow;
  emissor: EmissorInfo;
  pagador: { nome: string | null; email: string | null; documento: string | null };
  plano: string | null;
};

const EMISSOR_VAZIO: EmissorInfo = {
  razao_social: "",
  cnpj: "",
  endereco: "",
  email: "",
  telefone: "",
  observacao: "",
};

const STATUS_POR_TIPO: Record<BillingEventType, InvoiceRow["status"]> = {
  purchase_approved: "pago",
  subscription_renewed: "pago",
  refunded: "reembolsado",
  chargeback: "chargeback",
  payment_failed: "falhou",
  subscription_canceled: "cancelado",
  unknown: "outro",
};

const LABEL_POR_TIPO: Record<BillingEventType, string> = {
  purchase_approved: "Compra aprovada",
  subscription_renewed: "Renovação da assinatura",
  refunded: "Reembolso",
  chargeback: "Chargeback",
  payment_failed: "Pagamento recusado",
  subscription_canceled: "Assinatura cancelada",
  unknown: "Evento de cobrança",
};

function extrairMetodo(payload: any): string | null {
  const raw =
    payload?.paymentMethod ??
    payload?.payment_method ??
    payload?.Commissions?.charge_amount_method ??
    payload?.data?.payment_method ??
    payload?.payment_type_enum_key ??
    payload?.payment_method_name ??
    null;
  if (!raw || typeof raw !== "string") return null;
  const n = raw.toLowerCase();
  if (n.includes("pix")) return "PIX";
  if (n.includes("boleto") || n.includes("billet")) return "Boleto";
  if (n.includes("credit") || n.includes("cart") || n.includes("card")) return "Cartão de crédito";
  if (n.includes("debit")) return "Cartão de débito";
  return raw;
}

/** Valor em centavos com fallbacks quando o normalizador não encontra o campo. */
function extrairValor(provider: string, payload: any, jaNormalizado: number | null): number | null {
  if (typeof jaNormalizado === "number" && jaNormalizado > 0) return jaNormalizado;
  const candidatos = [
    payload?.Commissions?.charge_amount,
    payload?.Commissions?.product_base_price,
    payload?.total_amount,
    payload?.charge_amount,
    payload?.data?.amount_cents,
    payload?.amount_cents,
  ];
  for (const c of candidatos) {
    if (typeof c === "number" && c > 0) return Math.round(c);
  }
  const emReais = [payload?.data?.amount, payload?.amount, payload?.sale_amount, payload?.value];
  for (const c of emReais) {
    const n = typeof c === "string" ? Number(c.replace(",", ".")) : c;
    if (typeof n === "number" && Number.isFinite(n) && n > 0) return Math.round(n * 100);
  }
  return null;
}

function mapRow(r: any): InvoiceRow {
  let tipo: BillingEventType = "unknown";
  let amount: number | null = null;
  let periodo: string | null = null;
  const p = r.payload ?? {};
  // Alguns registros já foram gravados no formato normalizado
  const jaNormalizado = typeof p?.eventType === "string" && ("amountCents" in p || "rawEventName" in p);
  if (jaNormalizado) {
    tipo = p.eventType as BillingEventType;
    amount = typeof p.amountCents === "number" ? p.amountCents : null;
    periodo = p.periodEnd ?? null;
  } else {
    try {
      const evt = normalize(r.provider, p);
      tipo = evt.eventType;
      amount = evt.amountCents;
      periodo = evt.periodEnd;
    } catch {
      /* provedor desconhecido — segue com fallbacks */
    }
  }
  if (!LABEL_POR_TIPO[tipo]) tipo = "unknown";
  if (tipo === "unknown" && r.event_type) {
    const n = String(r.event_type).toLowerCase();
    if (n.includes("renew")) tipo = "subscription_renewed";
    else if (n.includes("refund")) tipo = "refunded";
    else if (n.includes("chargeback")) tipo = "chargeback";
    else if (n.includes("cancel")) tipo = "subscription_canceled";
    else if (n.includes("fail") || n.includes("reject") || n.includes("overdue")) tipo = "payment_failed";
    else if (n.includes("approved") || n.includes("paid")) tipo = "purchase_approved";
  }
  return {
    id: r.id,
    provider: r.provider,
    event_type: r.event_type,
    event_label: LABEL_POR_TIPO[tipo],
    amount_cents: extrairValor(r.provider, r.payload, amount),
    status: STATUS_POR_TIPO[tipo],
    metodo: extrairMetodo(r.payload),
    periodo_fim: periodo,
    buyer_email: r.buyer_email,
    external_id: r.external_id,
    created_at: r.created_at,
  };
}

export const listMyInvoices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<InvoiceRow[]> => {
    const companyId = await resolveCompanyIdCached(context.supabase, context.userId).catch(() => null);
    if (!companyId) return [];

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data, error }, { data: charges }] = await Promise.all([
      supabaseAdmin
        .from("billing_event_log")
        .select("id, provider, event_type, buyer_email, external_id, payload, created_at")
        .eq("matched_company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(200),
      supabaseAdmin
        .from("billing_charge")
        .select("id, status, metodo, total_cents, descricao, paid_at, created_at, external_id")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(200),
    ]);
    if (error) throw new Error(error.message);

    const STATUS_CHARGE: Record<string, InvoiceRow["status"]> = {
      paid: "pago",
      refunded: "reembolsado",
      failed: "falhou",
      canceled: "cancelado",
      pending: "outro",
    };

    const internas: InvoiceRow[] = (charges ?? []).map((c: any) => ({
      id: c.id,
      provider: "abacatepay",
      event_type: c.status,
      event_label: c.descricao || (c.status === "paid" ? "Pagamento confirmado" : "Cobrança gerada"),
      amount_cents: c.total_cents ?? null,
      status: STATUS_CHARGE[c.status] ?? "outro",
      metodo: c.metodo === "card" ? "Cartão de crédito" : "PIX",
      periodo_fim: null,
      buyer_email: null,
      external_id: c.external_id ?? null,
      created_at: c.paid_at ?? c.created_at,
    }));

    const todas = [...(data ?? []).map(mapRow), ...internas].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );

    // Histórico mostra apenas pagamentos que deram certo (e estornos deles).
    // Provedores como a Kiwify enviam 2 eventos para o mesmo pagamento
    // (compra aprovada + renovação): contamos uma vez só.
    const vistos = new Set<string>();
    return todas.filter((r) => {
      if (r.status !== "pago" && r.status !== "reembolsado") return false;
      const dia = new Date(r.created_at).toISOString().slice(0, 10);
      const chave = `${r.provider}|${r.external_id ?? r.id}|${dia}|${r.amount_cents ?? 0}|${r.status}`;
      if (vistos.has(chave)) return false;
      vistos.add(chave);
      return true;
    });
  });

/** Dados completos para emissão do recibo de uma fatura da própria empresa. */
export const getReceiptData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { invoiceId: string }) => z.object({ invoiceId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<ReceiptData> => {
    const companyId = await resolveCompanyIdCached(context.supabase, context.userId).catch(() => null);
    if (!companyId) throw new Error("Empresa não encontrada.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await (supabaseAdmin as any)
      .from("billing_event_log")
      .select("id, provider, event_type, buyer_email, external_id, payload, created_at, matched_company_id")
      .eq("id", data.invoiceId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row || row.matched_company_id !== companyId) throw new Error("Fatura não encontrada.");

    const [{ data: cfg }, { data: comp }, { data: sub }] = await Promise.all([
      (supabaseAdmin as any).from("app_config").select("emissor").limit(1).maybeSingle(),
      (supabaseAdmin as any).from("company").select("nome, cnpj_cpf, email_corporativo").eq("id", companyId).maybeSingle(),
      (supabaseAdmin as any)
        .from("subscription")
        .select("plan:plan_id(nome)")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    return {
      invoice: mapRow(row),
      emissor: { ...EMISSOR_VAZIO, ...(cfg?.emissor ?? {}) },
      pagador: {
        nome: comp?.nome ?? null,
        email: row.buyer_email ?? comp?.email_corporativo ?? null,
        documento: comp?.cnpj_cpf ?? null,
      },
      plano: (sub as any)?.plan?.nome ?? null,
    };
  });

/* ===== Configuração do emissor (painel master) ===== */

export const getEmissor = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<EmissorInfo> => {
    const { data: isAdmin } = await context.supabase.rpc("is_super_admin");
    if (!isAdmin) throw new Error("Acesso restrito.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await (supabaseAdmin as any).from("app_config").select("emissor").limit(1).maybeSingle();
    return { ...EMISSOR_VAZIO, ...(data?.emissor ?? {}) };
  });

export const setEmissor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: EmissorInfo) =>
    z
      .object({
        razao_social: z.string().max(160),
        cnpj: z.string().max(30),
        endereco: z.string().max(240),
        email: z.string().max(160),
        telefone: z.string().max(40),
        observacao: z.string().max(400),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { data: isAdmin } = await context.supabase.rpc("is_super_admin");
    if (!isAdmin) throw new Error("Acesso restrito.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existing } = await (supabaseAdmin as any).from("app_config").select("id").limit(1).maybeSingle();
    if (existing) {
      const { error } = await (supabaseAdmin as any).from("app_config").update({ emissor: data }).eq("id", existing.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await (supabaseAdmin as any).from("app_config").insert({ emissor: data });
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });
