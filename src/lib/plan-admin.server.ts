import { normalizePlanFeatures } from "./plan-features";

export async function listPlansMasterServer() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await (supabaseAdmin as any)
    .from("plan")
    .select("*")
    .order("ordem", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((p: any) => ({
    ...p,
    features: normalizePlanFeatures(p.features, p.slug),
  }));
}

export async function listPublicPlansServer() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await (supabaseAdmin as any)
    .from("plan")
    .select(
      "id, slug, nome, descricao, preco_cents, preco_usd_cents, preco_anual_brl_cents, preco_anual_usd_cents, desconto_anual_pct, moeda, intervalo, trial_days, limite_instancias, limite_conexoes_oficiais, limite_usuarios, creditos_mensais, creditos_trial, features, checkout_url, destaque, ordem",
    )
    .eq("ativo", true)
    .neq("slug", "cortesia")
    .order("ordem", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((p: any) => ({
    ...p,
    features: normalizePlanFeatures(p.features, p.slug),
  }));
}

export async function savePlanMasterServer(input: {
  id?: string | null;
  slug: string;
  nome: string;
  descricao?: string | null;
  preco_cents: number;
  preco_usd_cents: number;
  preco_anual_brl_cents: number;
  preco_anual_usd_cents: number;
  desconto_anual_pct: number;
  moeda: string;
  intervalo: "month" | "year";
  trial_days: number;
  limite_instancias: number;
  limite_conexoes_oficiais: number;
  limite_usuarios: number;
  creditos_mensais: number;
  creditos_trial: number;
  features: Record<string, boolean>;
  checkout_url?: string | null;
  paddle_product_id?: string | null;
  paddle_price_id?: string | null;
  destaque: boolean;
  ativo: boolean;
  ordem: number;
}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const slug = input.slug.toLowerCase().trim();
  const payload = {
    slug,
    nome: input.nome.trim(),
    descricao: input.descricao?.trim() || null,
    preco_cents: Math.max(0, Math.round(input.preco_cents)),
    preco_usd_cents: Math.max(0, Math.round(input.preco_usd_cents)),
    preco_anual_brl_cents: Math.max(0, Math.round(input.preco_anual_brl_cents)),
    preco_anual_usd_cents: Math.max(0, Math.round(input.preco_anual_usd_cents)),
    desconto_anual_pct: Math.max(0, Math.min(90, Math.round(input.desconto_anual_pct))),
    moeda: (input.moeda || "BRL").toUpperCase().trim(),
    intervalo: input.intervalo === "year" ? "year" : "month",
    trial_days: Math.max(0, Math.round(input.trial_days)),
    limite_mensagens: 2147483647,
    limite_contatos: 2147483647,
    limite_instancias: Math.max(0, Math.round(input.limite_instancias)),
    limite_conexoes_oficiais: Math.max(0, Math.round(input.limite_conexoes_oficiais)),
    limite_usuarios: Math.max(1, Math.round(input.limite_usuarios)),
    creditos_mensais: Math.max(0, Math.round(input.creditos_mensais)),
    creditos_trial: Math.max(0, Math.round(input.creditos_trial)),
    features: normalizePlanFeatures(input.features, slug),
    checkout_url: input.checkout_url?.trim() || null,
    paddle_product_id: input.paddle_product_id?.trim() || null,
    paddle_price_id: input.paddle_price_id?.trim() || null,
    destaque: Boolean(input.destaque),
    ativo: Boolean(input.ativo),
    ordem: Math.round(input.ordem ?? 0),
    updated_at: new Date().toISOString(),
  };

  if (input.id) {
    const { data, error } = await (supabaseAdmin as any)
      .from("plan")
      .update(payload)
      .eq("id", input.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  const { data, error } = await (supabaseAdmin as any)
    .from("plan")
    .insert(payload)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function togglePlanActiveMasterServer(id: string, ativo: boolean) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await (supabaseAdmin as any)
    .from("plan")
    .update({ ativo, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
  return { ok: true };
}

export async function deletePlanMasterServer(id: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { count, error: cntErr } = await (supabaseAdmin as any)
    .from("subscription")
    .select("id", { count: "exact", head: true })
    .eq("plan_id", id)
    .in("status", ["active", "trialing", "past_due"]);
  if (cntErr) throw new Error(cntErr.message);

  if ((count ?? 0) > 0) {
    throw new Error(
      `Este plano possui ${count} assinatura(s) vinculada(s). Desative o plano em vez de excluí-lo.`,
    );
  }

  const { error } = await (supabaseAdmin as any).from("plan").delete().eq("id", id);
  if (error) throw new Error(error.message);
  return { ok: true };
}
