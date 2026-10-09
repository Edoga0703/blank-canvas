import { normalize, type NormalizedBillingEvent } from "@/lib/billing/normalize";

async function getAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function findCompanyByEmail(supabase: any, email: string): Promise<string | null> {
  const { data: prof } = await supabase
    .from("profiles")
    .select("user_id")
    .ilike("email", email)
    .maybeSingle();
  if (prof?.user_id) {
    const { data: cu } = await supabase
      .from("company_user")
      .select("company_id")
      .eq("user_id", prof.user_id)
      .eq("ativo", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (cu?.company_id) return cu.company_id;
  }
  // Fallback: usuário sem perfil gravado — resolve direto pela conta de acesso.
  const { data: viaAuth } = await supabase.rpc("find_company_by_email", { _email: email });
  return (viaAuth as string | null) ?? null;
}


async function findPlanByRef(supabase: any, ref: string | null): Promise<string | null> {
  if (!ref) return null;
  const { data: bySlug } = await supabase.from("plan").select("id").eq("slug", ref).maybeSingle();
  if (bySlug?.id) return bySlug.id;
  const { data: byCheckout } = await supabase
    .from("plan")
    .select("id")
    .ilike("checkout_url", `%${ref}%`)
    .maybeSingle();
  return byCheckout?.id ?? null;
}

async function findPluginByRef(
  supabase: any,
  ref: string | null,
): Promise<{ id: string; slug: string; preco_mensal: number } | null> {
  if (!ref) return null;
  const { data: byExt } = await supabase
    .from("plugin")
    .select("id, slug, preco_mensal")
    .eq("external_product_id", ref)
    .maybeSingle();
  if (byExt?.id) return byExt;
  const { data: bySlug } = await supabase
    .from("plugin")
    .select("id, slug, preco_mensal")
    .eq("slug", ref)
    .eq("gratuito", false)
    .maybeSingle();
  if (bySlug?.id) return bySlug;
  const { data: byCheckout } = await supabase
    .from("plugin")
    .select("id, slug, preco_mensal")
    .ilike("checkout_url", `%${ref}%`)
    .maybeSingle();
  return byCheckout ?? null;
}

/** Pagamento aprovado libera o plugin (fica pronto para instalar). */
async function applyPluginEvent(
  supabase: any,
  evt: NormalizedBillingEvent,
  plugin: { id: string; slug: string; preco_mensal: number },
  companyId: string,
): Promise<"ativa" | "cancelada" | "ignored"> {
  let status: "ativa" | "cancelada" | null = null;
  switch (evt.eventType) {
    case "purchase_approved":
    case "subscription_renewed":
      status = "ativa"; break;
    case "subscription_canceled":
    case "refunded":
    case "chargeback":
    case "payment_failed":
      status = "cancelada"; break;
    default:
      return "ignored";
  }

  const payload: any = {
    company_id: companyId,
    plugin_id: plugin.id,
    assinatura_status: status,
    preco_cents: Math.round(Number(plugin.preco_mensal ?? 0) * 100),
    updated_at: new Date().toISOString(),
  };
  if (evt.periodEnd) payload.current_period_end = evt.periodEnd;

  const { data: existente } = await supabase
    .from("company_plugin")
    .select("id, instalado")
    .eq("company_id", companyId)
    .eq("plugin_id", plugin.id)
    .maybeSingle();

  if (status === "cancelada") {
    payload.canceled_at = new Date().toISOString();
    payload.instalado = false;
    payload.ativo = false;
  } else {
    payload.canceled_at = null;
    // se ainda não instalou, fica liberado para instalar na Loja de Plugins
    if (!existente?.instalado) {
      payload.instalado = false;
      payload.ativo = false;
    }
  }

  await supabase.from("company_plugin").upsert(payload, { onConflict: "company_id,plugin_id" });

  return status;
}

async function findAddonByRef(

  supabase: any,
  provider: string,
  ref: string | null,
): Promise<{ id: string; slug: string } | null> {
  if (!ref) return null;
  const { data: byExt } = await supabase
    .from("addon_product")
    .select("id, slug")
    .eq("provider", provider)
    .eq("external_product_id", ref)
    .maybeSingle();
  if (byExt?.id) return byExt;
  const { data: bySlug } = await supabase
    .from("addon_product").select("id, slug").eq("slug", ref).maybeSingle();
  return bySlug ?? null;
}

async function applyAddonEvent(
  supabase: any,
  evt: NormalizedBillingEvent,
  addon: { id: string; slug: string },
  companyId: string,
): Promise<"active" | "canceled" | "past_due" | "ignored"> {
  let status: "active" | "canceled" | "past_due" | null = null;
  switch (evt.eventType) {
    case "purchase_approved":
    case "subscription_renewed":
      status = "active"; break;
    case "subscription_canceled":
    case "refunded":
    case "chargeback":
      status = "canceled"; break;
    case "payment_failed":
      status = "past_due"; break;
    default:
      return "ignored";
  }

  const payload: any = {
    company_id: companyId,
    addon_product_id: addon.id,
    quantidade: 1,
    provider: evt.provider,
    external_subscription_id: evt.externalSubscriptionId,
    buyer_email: evt.buyerEmail,
    status,
    updated_at: new Date().toISOString(),
  };
  if (evt.periodEnd) payload.current_period_end = evt.periodEnd;
  if (status === "canceled") payload.canceled_at = new Date().toISOString();

  // Se veio external_subscription_id, dá pra fazer upsert por ele; senão, atualiza registro existente por (company + addon).
  if (evt.externalSubscriptionId) {
    await supabase
      .from("company_addon")
      .upsert(payload, { onConflict: "provider,external_subscription_id" });
  } else {
    const { data: existing } = await supabase
      .from("company_addon")
      .select("id")
      .eq("company_id", companyId)
      .eq("addon_product_id", addon.id)
      .maybeSingle();
    if (existing?.id) {
      await supabase.from("company_addon").update(payload).eq("id", existing.id);
    } else {
      await supabase.from("company_addon").insert(payload);
    }
  }
  return status;
}

/** Aplica um evento de billing normalizado. Registra em billing_event_log e atualiza subscription/company/addon. */
export async function applyBillingEvent(evt: NormalizedBillingEvent, opts?: { skipLog?: boolean }) {
  const supabase = await getAdmin();

  const logRow: any = {
    provider: evt.provider,
    event_type: evt.rawEventName || evt.eventType,
    external_id: evt.externalSubscriptionId,
    buyer_email: evt.buyerEmail,
    payload: evt as any,
  };

  const insertLog = async (extra: any) => {
    if (opts?.skipLog) return;
    await supabase.from("billing_event_log").insert({ ...logRow, ...extra });
  };

  if (!evt.buyerEmail) {
    await insertLog({ error: "sem email do comprador" });
    return { ok: false, reason: "sem_email" as const };
  }

  const companyId = await findCompanyByEmail(supabase, evt.buyerEmail);
  if (!companyId) {
    await insertLog({ error: "empresa não encontrada para o email" });
    return { ok: false, reason: "empresa_nao_encontrada" as const };
  }

  // 0) PLUGIN pago da loja (libera instalação após pagamento confirmado).
  const plugin = await findPluginByRef(supabase, evt.productRef);
  if (plugin) {
    const status = await applyPluginEvent(supabase, evt, plugin, companyId);
    await insertLog({
      matched_company_id: companyId,
      processed: true,
      error: status === "ignored" ? "plugin: evento ignorado" : null,
    });
    return { ok: true, kind: "plugin" as const, pluginSlug: plugin.slug, status };
  }

  // 1) Tenta casar como ADD-ON primeiro (produtos extras).
  const addon = await findAddonByRef(supabase, evt.provider, evt.productRef);

  if (addon) {
    const result = await applyAddonEvent(supabase, evt, addon, companyId);
    await insertLog({
      matched_company_id: companyId,
      processed: true,
      error: result === "ignored" ? "addon: evento ignorado" : null,
    });
    return { ok: true, kind: "addon" as const, addonSlug: addon.slug, status: result };
  }

  // 2) Caso contrário, trata como PLANO base (fluxo original).
  const planId = await findPlanByRef(supabase, evt.productRef);
  let subStatus: string | null = null;
  let companyStatus: string | null = null;

  switch (evt.eventType) {
    case "purchase_approved":
    case "subscription_renewed":
      subStatus = "active"; companyStatus = "ativo"; break;
    case "subscription_canceled":
    case "refunded":
    case "chargeback":
      subStatus = "canceled"; companyStatus = "suspenso"; break;
    case "payment_failed":
      subStatus = "past_due"; companyStatus = "pendente"; break;
    default:
      await insertLog({ matched_company_id: companyId, processed: true, error: "evento ignorado" });
      return { ok: true, ignored: true as const };
  }

  // Proteção contra eventos atrasados/duplicados de uma assinatura ANTIGA:
  // gateways (ex.: Kiwify) reenviam "order_rejected"/"payment_failed" da assinatura
  // que falhou mesmo depois de o cliente trocar o cartão e gerar uma nova assinatura.
  if (subStatus === "past_due" || subStatus === "canceled") {
    // O estado atual pode já ter sido sobrescrito por uma tentativa antiga. Por isso,
    // usa também o último pagamento aprovado do histórico como fonte de verdade.
    const { data: historico } = await supabase
      .from("billing_event_log")
      .select("created_at, external_id, payload")
      .eq("matched_company_id", companyId)
      .eq("processed", true)
      .order("created_at", { ascending: false })
      .limit(100);
    const ultimoPagamento = (historico ?? []).find((row: any) => {
      const tipo = row?.payload?.eventType;
      return tipo === "purchase_approved" || tipo === "subscription_renewed";
    });
    const pagamentoPayload = (ultimoPagamento?.payload ?? {}) as Record<string, any>;
    const pagamentoSubscriptionId =
      ultimoPagamento?.external_id ?? pagamentoPayload.externalSubscriptionId ?? null;
    const pagamentoPeriodEnd = pagamentoPayload.periodEnd ?? null;
    const pagamentoMaisNovo =
      !!pagamentoPeriodEnd &&
      (!evt.periodEnd || new Date(pagamentoPeriodEnd).getTime() > new Date(evt.periodEnd).getTime());
    const pagamentoDeOutraAssinatura =
      !!pagamentoSubscriptionId &&
      !!evt.externalSubscriptionId &&
      pagamentoSubscriptionId !== evt.externalSubscriptionId;

    if (pagamentoDeOutraAssinatura && pagamentoMaisNovo) {
      await insertLog({
        matched_company_id: companyId,
        processed: true,
        error: "evento antigo ignorado (pagamento mais recente encontrado no histórico)",
      });
      return { ok: true, ignored: true as const, reason: "evento_antigo" as const };
    }

    const { data: atual } = await supabase
      .from("subscription")
      .select("status, external_subscription_id, current_period_end")
      .eq("company_id", companyId)
      .maybeSingle();
    if (atual?.status === "active") {
      const outraAssinatura =
        !!evt.externalSubscriptionId &&
        !!atual.external_subscription_id &&
        evt.externalSubscriptionId !== atual.external_subscription_id;
      const eventoAntigo =
        !!evt.periodEnd &&
        !!atual.current_period_end &&
        new Date(evt.periodEnd).getTime() < new Date(atual.current_period_end as string).getTime();
      if (outraAssinatura || eventoAntigo) {
        await insertLog({
          matched_company_id: companyId,
          processed: true,
          error: "evento antigo ignorado (assinatura ativa mais recente)",
        });
        return { ok: true, ignored: true as const, reason: "evento_antigo" as const };
      }
    }
  }

  const subPayload: any = {

    company_id: companyId,
    provider: evt.provider,
    external_subscription_id: evt.externalSubscriptionId,
    external_customer_id: evt.externalCustomerId,
    buyer_email: evt.buyerEmail,
    status: subStatus,
    updated_at: new Date().toISOString(),
  };
  if (planId) subPayload.plan_id = planId;
  if (evt.periodEnd) subPayload.current_period_end = evt.periodEnd;
  if (subStatus === "canceled") subPayload.canceled_at = new Date().toISOString();

  await supabase.from("subscription").upsert(subPayload, { onConflict: "company_id" });
  if (companyStatus) {
    await supabase.from("company").update({ status_cobranca: companyStatus }).eq("id", companyId);
  }
  // Sem produto casado, usa o plano já vinculado à assinatura (evita ficar sem créditos).
  const planIdParaCreditos =
    planId ??
    (
      await supabase.from("subscription").select("plan_id").eq("company_id", companyId).maybeSingle()
    ).data?.plan_id ??
    null;
  if (subStatus === "active" && planIdParaCreditos) {

    const { data: planRow } = await supabase.from("plan").select("slug").eq("id", planIdParaCreditos).maybeSingle();
    if (planRow?.slug) {
      const { data: novoSaldo, error: creditError } = await supabase.rpc("topup_plan_credits", {
        _company_id: companyId,
        _plan_slug: planRow.slug,
      });
      // Webhook não pode falhar por causa de créditos: o pagamento é registrado.
      if (creditError || novoSaldo == null) {
        console.warn("[billing] créditos não renovados", {
          companyId,
          slug: planRow.slug,
          motivo: creditError?.message ?? "plano sem créditos configurados",
        });
      }
    }
  }

  await insertLog({ matched_company_id: companyId, processed: true });
  return { ok: true, kind: "plan" as const, companyId };
}

export { normalize };
