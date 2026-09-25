/**
 * Motor de cobranças próprias (plano + adicionais em uma única cobrança).
 * Server-only.
 */
import { createPixQrCode, createBilling, checkPixQrCode, getBilling, isPaidStatus } from "./abacatepay.server";

export type CartItemInput = { tipo: "plan" | "addon" | "plugin"; id?: string | null; slug?: string | null; quantidade?: number };

export type ResolvedItem = {
  tipo: "plan" | "addon" | "plugin";
  ref_id: string | null;
  ref_slug: string | null;
  nome: string;
  quantidade: number;
  preco_unit_cents: number;
  total_cents: number;
};

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export function cicloAtualRef(d = new Date()): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Monta os itens da cobrança a partir do plano atual da empresa + adicionais escolhidos. */
export async function resolveCart(companyId: string, items: CartItemInput[], incluirPlano: boolean) {
  const supabase = await admin();
  const resolved: ResolvedItem[] = [];

  if (incluirPlano) {
    const { data: sub } = await supabase
      .from("subscription")
      .select("plan_id, valor_customizado_cents, cortesia")
      .eq("company_id", companyId)
      .maybeSingle();
    let planSlug: string | null = null;
    let planNome = "Plano";
    let preco = 0;
    let planId: string | null = null;
    if (sub?.plan_id) {
      const { data: plan } = await supabase
        .from("plan").select("id, slug, nome, preco_cents").eq("id", sub.plan_id).maybeSingle();
      if (plan) { planId = plan.id; planSlug = plan.slug; planNome = plan.nome; preco = Number(plan.preco_cents ?? 0); }
    } else {
      const { data: company } = await supabase
        .from("company").select("selected_plan_slug").eq("id", companyId).maybeSingle();
      const slug = (company as any)?.selected_plan_slug || "starter";
      const { data: plan } = await supabase
        .from("plan").select("id, slug, nome, preco_cents").eq("slug", slug).maybeSingle();
      if (plan) { planId = plan.id; planSlug = plan.slug; planNome = plan.nome; preco = Number(plan.preco_cents ?? 0); }
    }
    if (sub?.valor_customizado_cents) preco = Number(sub.valor_customizado_cents);
    if (!sub?.cortesia && preco > 0) {
      resolved.push({
        tipo: "plan", ref_id: planId, ref_slug: planSlug, nome: planNome,
        quantidade: 1, preco_unit_cents: preco, total_cents: preco,
      });
    }
  }

  for (const item of items) {
    const qtd = Math.max(1, Number(item.quantidade ?? 1));
    if (item.tipo === "addon") {
      const q = supabase.from("addon_product").select("id, slug, nome, preco_cents, ativo");
      const { data: row } = item.id ? await q.eq("id", item.id).maybeSingle() : await q.eq("slug", item.slug!).maybeSingle();
      if (!row || !row.ativo) throw new Error("Adicional indisponível");
      const preco = Number(row.preco_cents ?? 0);
      resolved.push({
        tipo: "addon", ref_id: row.id, ref_slug: row.slug, nome: row.nome,
        quantidade: qtd, preco_unit_cents: preco, total_cents: preco * qtd,
      });
    } else if (item.tipo === "plugin") {
      const q = supabase.from("plugin").select("id, slug, nome, preco_mensal, gratuito");
      const { data: row } = item.id ? await q.eq("id", item.id).maybeSingle() : await q.eq("slug", item.slug!).maybeSingle();
      if (!row || row.gratuito) throw new Error("Plugin indisponível para cobrança");
      const preco = Math.round(Number(row.preco_mensal ?? 0) * 100);
      resolved.push({
        tipo: "plugin", ref_id: row.id, ref_slug: row.slug, nome: row.nome,
        quantidade: qtd, preco_unit_cents: preco, total_cents: preco * qtd,
      });
    }
  }

  const total = resolved.reduce((s, i) => s + i.total_cents, 0);
  return { items: resolved, total_cents: total };
}

async function customerFor(companyId: string) {
  const supabase = await admin();
  const { data: company } = await supabase
    .from("company").select("nome, telefone, email_corporativo, cnpj_cpf").eq("id", companyId).maybeSingle();
  const { data: billing } = await supabase
    .from("company_billing")
    .select("nome_responsavel, email_cobranca, telefone, cnpj_cpf")
    .eq("company_id", companyId).maybeSingle();
  let email = billing?.email_cobranca || (company as any)?.email_corporativo || null;
  if (!email) {
    const { data: owner } = await supabase
      .from("company_user").select("user_id").eq("company_id", companyId).eq("role", "owner")
      .eq("ativo", true).limit(1).maybeSingle();
    if (owner?.user_id) {
      const { data: prof } = await supabase.from("profiles").select("email").eq("user_id", owner.user_id).maybeSingle();
      email = prof?.email ?? null;
    }
  }
  return {
    name: billing?.nome_responsavel || (company as any)?.nome || "Cliente",
    email,
    cellphone: (billing?.telefone || (company as any)?.telefone || "").replace(/\D/g, "") || null,
    taxId: (billing?.cnpj_cpf || (company as any)?.cnpj_cpf || "").replace(/\D/g, "") || null,
  };
}

/** Cria a cobrança única no Abacate Pay e grava em billing_charge/_item. */
export async function createCharge(params: {
  companyId: string;
  items: CartItemInput[];
  incluirPlano: boolean;
  metodo: "pix" | "card";
  cicloRef?: string | null;
  origem?: string;
  baseUrl?: string;
}) {
  const supabase = await admin();
  const { items, total_cents } = await resolveCart(params.companyId, params.items, params.incluirPlano);
  if (!items.length || total_cents <= 0) throw new Error("Nada para cobrar");

  const descricao = items.map((i) => (i.quantidade > 1 ? `${i.quantidade}x ${i.nome}` : i.nome)).join(" + ");
  const vencimento = new Date(Date.now() + 3 * 86400000).toISOString();

  const { data: charge, error } = await supabase
    .from("billing_charge")
    .insert({
      company_id: params.companyId,
      provider: "abacatepay",
      metodo: params.metodo,
      status: "pending",
      total_cents,
      ciclo_ref: params.cicloRef ?? null,
      descricao,
      vencimento,
      origem: params.origem ?? "checkout",
    })
    .select("id")
    .single();
  if (error || !charge) throw new Error(error?.message || "Falha ao criar cobrança");

  await supabase.from("billing_charge_item").insert(
    items.map((i) => ({ charge_id: charge.id, ...i })),
  );

  const customer = await customerFor(params.companyId);
  const base = params.baseUrl || "https://metrixcrm.com.br";

  try {
    if (params.metodo === "pix") {
      const pix = await createPixQrCode({
        amountCents: total_cents,
        description: descricao,
        customer,
        metadata: { externalId: charge.id },
      });
      await supabase.from("billing_charge").update({
        external_id: pix.id,
        pix_qrcode: pix.brCodeBase64,
        pix_copia_cola: pix.brCode,
      }).eq("id", charge.id);
    } else {
      const billing = await createBilling({
        products: items.map((i) => ({
          externalId: `${i.tipo}:${i.ref_slug ?? i.ref_id ?? "item"}`,
          name: i.nome,
          quantity: i.quantidade,
          price: i.preco_unit_cents,
        })),
        returnUrl: `${base}/app/meu-plano`,
        completionUrl: `${base}/app/meu-plano?pago=1`,
        customer,
        methods: ["PIX", "CARD"],
        externalId: charge.id,
      });
      await supabase.from("billing_charge").update({
        external_id: billing.id,
        payment_url: billing.url,
      }).eq("id", charge.id);
    }
  } catch (e: any) {
    await supabase.from("billing_charge")
      .update({ status: "failed", erro: String(e?.message || e) })
      .eq("id", charge.id);
    throw new Error(`Abacate Pay: ${e?.message || e}`);
  }

  const { data: full } = await supabase
    .from("billing_charge").select("*").eq("id", charge.id).maybeSingle();
  return full;
}

/** Marca a cobrança como paga e libera plano/adicionais/plugins dela. */
export async function settleCharge(chargeId: string, opts?: { manual?: boolean }) {
  const supabase = await admin();
  const { data: charge } = await supabase.from("billing_charge").select("*").eq("id", chargeId).maybeSingle();
  if (!charge) throw new Error("Cobrança não encontrada");
  if (charge.status === "paid") return { ok: true, already: true };

  const { data: items } = await supabase
    .from("billing_charge_item").select("*").eq("charge_id", chargeId);

  const agora = new Date();
  const periodEnd = new Date(agora.getTime() + 30 * 86400000).toISOString();

  for (const item of items ?? []) {
    if (item.tipo === "plan") {
      await supabase.from("subscription").upsert({
        company_id: charge.company_id,
        plan_id: item.ref_id,
        provider: "abacatepay",
        status: "active",
        current_period_start: agora.toISOString(),
        current_period_end: periodEnd,
        proxima_cobranca: periodEnd,
        metodo_pagamento: charge.metodo,
        updated_at: agora.toISOString(),
      }, { onConflict: "company_id" });
      await supabase.from("company").update({ status_cobranca: "ativo" }).eq("id", charge.company_id);
      if (item.ref_slug) {
        const { data: novoSaldo, error: creditError } = await supabase.rpc("topup_plan_credits", {
          _company_id: charge.company_id,
          _plan_slug: item.ref_slug,
        });
        // A cobrança precisa ser concluída mesmo se o plano não tiver créditos.
        if (creditError || novoSaldo == null) {
          console.warn("[billing] créditos não renovados", {
            companyId: charge.company_id,
            slug: item.ref_slug,
            motivo: creditError?.message ?? "plano sem créditos configurados",
          });
        }
      }
    } else if (item.tipo === "addon" && item.ref_id) {
      const { data: existing } = await supabase
        .from("company_addon").select("id")
        .eq("company_id", charge.company_id).eq("addon_product_id", item.ref_id).maybeSingle();
      const payload: any = {
        company_id: charge.company_id,
        addon_product_id: item.ref_id,
        quantidade: item.quantidade,
        provider: "abacatepay",
        status: "active",
        current_period_end: periodEnd,
        canceled_at: null,
        updated_at: agora.toISOString(),
      };
      if (existing?.id) await supabase.from("company_addon").update(payload).eq("id", existing.id);
      else await supabase.from("company_addon").insert(payload);
    } else if (item.tipo === "plugin" && item.ref_id) {
      const { data: existing } = await supabase
        .from("company_plugin").select("id")
        .eq("company_id", charge.company_id).eq("plugin_id", item.ref_id).maybeSingle();
      const payload: any = {
        company_id: charge.company_id,
        plugin_id: item.ref_id,
        assinatura_status: "ativa",
        current_period_end: periodEnd,
        updated_at: agora.toISOString(),
      };
      if (existing?.id) await supabase.from("company_plugin").update(payload).eq("id", existing.id);
      else await supabase.from("company_plugin").insert(payload);
    }
  }

  await supabase.from("billing_charge").update({
    status: "paid",
    paid_at: agora.toISOString(),
    erro: opts?.manual ? "baixa manual" : null,
  }).eq("id", chargeId);

  return { ok: true };
}

/** Consulta status no gateway e concilia. */
export async function syncChargeStatus(chargeId: string) {
  const supabase = await admin();
  const { data: charge } = await supabase
    .from("billing_charge").select("id, status, metodo, external_id").eq("id", chargeId).maybeSingle();
  if (!charge) throw new Error("Cobrança não encontrada");
  if (charge.status === "paid") return { status: "paid" as const };
  if (!charge.external_id) return { status: charge.status as string };

  let remoto: string | null = null;
  if (charge.metodo === "pix") remoto = (await checkPixQrCode(charge.external_id)).status;
  else remoto = (await getBilling(charge.external_id))?.status ?? null;

  if (isPaidStatus(remoto)) {
    await settleCharge(chargeId);
    return { status: "paid" as const };
  }
  return { status: charge.status as string, remoto };
}

/** Rotina diária: gera a cobrança do próximo ciclo e avisa o cliente. */
export async function runBillingRenewals(opts?: { diasAntes?: number; baseUrl?: string }) {
  const supabase = await admin();
  const diasAntes = opts?.diasAntes ?? 3;
  const limite = new Date(Date.now() + diasAntes * 86400000).toISOString();

  const { data: subs } = await supabase
    .from("subscription")
    .select("company_id, current_period_end, metodo_pagamento, status, cortesia")
    .in("status", ["active", "past_due"])
    .lte("current_period_end", limite)
    .limit(500);

  const resultado: any[] = [];
  for (const sub of subs ?? []) {
    if (sub.cortesia) continue;
    const fim = sub.current_period_end ? new Date(sub.current_period_end) : new Date();
    const ciclo = cicloAtualRef(fim);
    const { data: existente } = await supabase
      .from("billing_charge").select("id, status")
      .eq("company_id", sub.company_id).eq("ciclo_ref", ciclo).maybeSingle();
    if (existente) { resultado.push({ company: sub.company_id, skip: "ja_gerada" }); continue; }

    // Adicionais ativos entram automaticamente na renovação.
    const { data: addons } = await supabase
      .from("company_addon").select("addon_product_id, quantidade")
      .eq("company_id", sub.company_id).eq("status", "active");

    try {
      const charge = await createCharge({
        companyId: sub.company_id,
        items: (addons ?? []).map((a: any) => ({ tipo: "addon", id: a.addon_product_id, quantidade: a.quantidade })),
        incluirPlano: true,
        metodo: (sub.metodo_pagamento === "card" ? "card" : "pix"),
        cicloRef: ciclo,
        origem: "renovacao",
        baseUrl: opts?.baseUrl,
      });
      await notifyCharge(sub.company_id, charge);
      resultado.push({ company: sub.company_id, charge: charge?.id });
    } catch (e: any) {
      resultado.push({ company: sub.company_id, erro: String(e?.message || e) });
    }
  }
  return { processadas: resultado.length, resultado };
}

/** Avisa o cliente pelo WhatsApp interno (best-effort). */
async function notifyCharge(companyId: string, charge: any) {
  try {
    const supabase = await admin();
    const valor = (Number(charge?.total_cents ?? 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    const texto = charge?.metodo === "pix"
      ? `Sua mensalidade Metrix CRM de ${valor} está disponível para pagamento via PIX. Acesse Meu plano no sistema para pagar.`
      : `Sua mensalidade Metrix CRM de ${valor} foi gerada. Acesse Meu plano no sistema para concluir o pagamento.`;
    await supabase.rpc("push_notificacao", {
      _company_id: companyId,
      _tipo: "cobranca",
      _titulo: "Cobrança disponível",
      _descricao: texto,
      _link: "/app/meu-plano",
      _ref_id: charge?.id ?? null,
    });
  } catch { /* não bloqueia a geração da cobrança */ }
}

/**
 * Concilia um webhook do Abacate Pay com uma cobrança criada pelo nosso checkout.
 * Retorna o id da cobrança quando tratada; null quando não é nossa.
 */
export async function resolveInternalCharge(body: any, evt: any): Promise<string | null> {
  const supabase = await admin();
  const deep = (obj: any, ...paths: string[]) => {
    for (const p of paths) {
      const v = p.split(".").reduce<any>((acc, k) => (acc == null ? acc : acc[k]), obj);
      if (v) return v as string;
    }
    return null;
  };
  const internalId = deep(
    body,
    "data.billing.metadata.externalId",
    "data.pixQrCode.metadata.externalId",
    "data.metadata.externalId",
    "metadata.externalId",
  );
  const externalId = evt?.externalSubscriptionId ?? deep(body, "data.billing.id", "data.pixQrCode.id", "data.id");

  let charge: any = null;
  if (internalId) {
    const { data } = await supabase.from("billing_charge").select("id, status").eq("id", internalId).maybeSingle();
    charge = data;
  }
  if (!charge && externalId) {
    const { data } = await supabase
      .from("billing_charge").select("id, status")
      .eq("provider", "abacatepay").eq("external_id", externalId).maybeSingle();
    charge = data;
  }
  if (!charge) return null;

  const tipo = evt?.eventType as string;
  if (tipo === "purchase_approved" || tipo === "subscription_renewed") {
    if (charge.status !== "paid") await settleCharge(charge.id);
  } else if (tipo === "payment_failed") {
    if (charge.status !== "paid") {
      await supabase.from("billing_charge").update({ status: "failed", erro: "pagamento recusado" }).eq("id", charge.id);
    }
  } else if (tipo === "subscription_canceled" || tipo === "refunded" || tipo === "chargeback") {
    await supabase.from("billing_charge")
      .update({ status: tipo === "refunded" ? "refunded" : "canceled", canceled_at: new Date().toISOString() })
      .eq("id", charge.id);
  }
  return charge.id;
}
