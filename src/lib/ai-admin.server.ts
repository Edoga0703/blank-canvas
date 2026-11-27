export type MasterAiUsageRange = "24h" | "7d" | "30d" | "mes";

function maskPoolKey(raw?: string | null): string {
  const val = String(raw || "").trim();
  if (!val) return "";
  if (val.length <= 8) return `••••${val.slice(-2)}`;
  const prefixLen = Math.min(7, Math.max(3, val.length - 4));
  return `${val.slice(0, prefixLen)}••••${val.slice(-4)}`;
}

export async function listAiPoolKeysServer() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const nowIso = new Date().toISOString();
  const threeHoursAgoIso = new Date(Date.now() - 3 * 3600 * 1000).toISOString();

  const [keysRes, leasesRes, recentUsageRes] = await Promise.all([
    (supabaseAdmin as any)
      .from("ai_provider_keys")
      .select("id, provider, alias, api_key, max_concurrency, active, priority, cooldown_until, last_used_at, last_error, total_requests, rate_limit_hits, created_at, updated_at")
      .order("provider", { ascending: true })
      .order("priority", { ascending: true })
      .order("created_at", { ascending: true }),
    (supabaseAdmin as any)
      .from("ai_key_leases")
      .select("key_id")
      .gt("expires_at", nowIso),
    (supabaseAdmin as any)
      .from("ai_usage_events")
      .select("key_id")
      .gte("created_at", threeHoursAgoIso)
      .not("key_id", "is", null),
  ]);

  if (keysRes.error) throw new Error(keysRes.error.message);

  const activeLeaseCount = new Map<string, number>();
  for (const l of leasesRes.data ?? []) {
    if (!l.key_id) continue;
    activeLeaseCount.set(l.key_id, (activeLeaseCount.get(l.key_id) ?? 0) + 1);
  }

  const turns3hCount = new Map<string, number>();
  for (const u of recentUsageRes.data ?? []) {
    if (!u.key_id) continue;
    turns3hCount.set(u.key_id, (turns3hCount.get(u.key_id) ?? 0) + 1);
  }

  return (keysRes.data ?? []).map((k: any) => ({
    id: k.id as string,
    provider: k.provider as string,
    alias: k.alias as string,
    api_key_masked: maskPoolKey(k.api_key),
    max_concurrency: Number(k.max_concurrency ?? 4),
    active: Boolean(k.active),
    priority: Number(k.priority ?? 1),
    cooldown_until: k.cooldown_until ?? null,
    last_used_at: k.last_used_at ?? null,
    last_error: k.last_error ?? null,
    total_requests: Number(k.total_requests ?? 0),
    rate_limit_hits: Number(k.rate_limit_hits ?? 0),
    active_leases: activeLeaseCount.get(k.id) ?? 0,
    turns_last_3h: turns3hCount.get(k.id) ?? 0,
    created_at: k.created_at,
    updated_at: k.updated_at,
  }));
}

export async function saveAiPoolKeyServer(input: {
  id?: string;
  provider: "drael" | "gemini" | "openai" | "anthropic" | "groq";
  alias: string;
  api_key?: string;
  max_concurrency: number;
  priority: number;
  active: boolean;
}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const nowIso = new Date().toISOString();
  const rawKey = String(input.api_key ?? "").trim();
  const hasRealNewKey = rawKey.length > 0 && !rawKey.includes("••••");

  if (input.id) {
    const patch: Record<string, any> = {
      provider: input.provider,
      alias: input.alias.trim(),
      max_concurrency: input.max_concurrency,
      priority: input.priority,
      active: input.active,
      updated_at: nowIso,
    };
    if (hasRealNewKey) {
      patch.api_key = rawKey;
    }
    const { data, error } = await (supabaseAdmin as any)
      .from("ai_provider_keys")
      .update(patch)
      .eq("id", input.id)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, id: data.id as string };
  }

  if (!hasRealNewKey) {
    throw new Error("Informe uma API key válida para cadastrar a conta no pool.");
  }

  const { data, error } = await (supabaseAdmin as any)
    .from("ai_provider_keys")
    .insert({
      provider: input.provider,
      alias: input.alias.trim(),
      api_key: rawKey,
      max_concurrency: input.max_concurrency,
      priority: input.priority,
      active: input.active,
      updated_at: nowIso,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return { ok: true, id: data.id as string };
}

export async function deleteAiPoolKeyServer(id: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await (supabaseAdmin as any).from("ai_provider_keys").delete().eq("id", id);
  if (error) throw new Error(error.message);
  return { ok: true };
}

export async function resetAiPoolKeyCooldownServer(id: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await (supabaseAdmin as any)
    .from("ai_provider_keys")
    .update({ cooldown_until: null, last_error: null, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
  return { ok: true };
}

export async function testAiPoolKeyServer(id: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: keyRow, error } = await (supabaseAdmin as any)
    .from("ai_provider_keys")
    .select("id, provider, alias, api_key")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!keyRow) throw new Error("Conta não encontrada no pool.");

  const { data: globalSettings } = await (supabaseAdmin as any)
    .from("master_settings")
    .select("value")
    .eq("key", "global_ai_config")
    .maybeSingle();
  const gVal = (globalSettings?.value as any) || {};

  const provider = String(keyRow.provider || "drael").toLowerCase();
  const apiKey = String(keyRow.api_key || "").trim();
  const t0 = Date.now();

  try {
    if (provider === "drael" || provider === "openai" || provider === "groq") {
      const baseUrl =
        provider === "drael"
          ? (gVal.drael_base_url || process.env.DRAEL_BASE_URL || "https://drael.sh/v1").replace(/\/+$/, "")
          : provider === "groq"
            ? "https://api.groq.com/openai/v1"
            : (gVal.base_url || process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
      const model = provider === "drael" ? "drael-v1" : provider === "groq" ? "llama-3.1-8b-instant" : "gpt-4o-mini";

      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: "Responda apenas: OK" }],
          max_tokens: 16,
          temperature: 0,
          ...(provider === "drael" ? { tools: [] } : {}),
        }),
        signal: AbortSignal.timeout(15000),
      });
      const txt = await res.text();
      if (!res.ok) {
        return { ok: false, status: res.status, ms: Date.now() - t0, error: txt.slice(0, 220) };
      }
      let sample = "OK";
      try {
        const j = JSON.parse(txt);
        sample = String(j?.choices?.[0]?.message?.content || "OK").trim();
      } catch {}
      return { ok: true, status: res.status, ms: Date.now() - t0, sample: sample.slice(0, 80) };
    }

    if (provider === "gemini") {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: "Responda apenas: OK" }] }] }),
          signal: AbortSignal.timeout(15000),
        },
      );
      const txt = await res.text();
      if (!res.ok) return { ok: false, status: res.status, ms: Date.now() - t0, error: txt.slice(0, 220) };
      return { ok: true, status: res.status, ms: Date.now() - t0, sample: "OK" };
    }

    if (provider === "anthropic") {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-3-5-haiku-latest",
          max_tokens: 16,
          messages: [{ role: "user", content: "Responda apenas: OK" }],
        }),
        signal: AbortSignal.timeout(15000),
      });
      const txt = await res.text();
      if (!res.ok) return { ok: false, status: res.status, ms: Date.now() - t0, error: txt.slice(0, 220) };
      return { ok: true, status: res.status, ms: Date.now() - t0, sample: "OK" };
    }

    return { ok: false, status: 400, ms: Date.now() - t0, error: `Provedor não suportado: ${provider}` };
  } catch (e: any) {
    return { ok: false, status: 0, ms: Date.now() - t0, error: e?.message || "Erro de rede" };
  }
}

function resolveRangeStartIso(range: MasterAiUsageRange): string {
  const now = new Date();
  if (range === "24h") return new Date(now.getTime() - 24 * 3600 * 1000).toISOString();
  if (range === "7d") return new Date(now.getTime() - 7 * 86400 * 1000).toISOString();
  if (range === "30d") return new Date(now.getTime() - 30 * 86400 * 1000).toISOString();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
}

export async function getMasterAiUsageSummaryServer(range: MasterAiUsageRange = "30d") {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const sinceIso = resolveRangeStartIso(range);

  const [eventsRes, companiesRes] = await Promise.all([
    (supabaseAdmin as any)
      .from("ai_usage_events")
      .select("company_id, provider, model, feature, input_tokens, output_tokens, audio_seconds, credits_charged, cost_usd_micros, latency_ms, status, created_at")
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: true })
      .limit(50000),
    supabaseAdmin.from("company").select("id, nome"),
  ]);

  if (eventsRes.error) throw new Error(eventsRes.error.message);

  const companyNames = new Map<string, string>();
  for (const c of companiesRes.data ?? []) {
    companyNames.set(c.id, c.nome || c.id);
  }

  let requests = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let creditsCharged = 0;
  let totalMicros = 0;
  let rateLimitedCount = 0;

  const byProvider = new Map<
    string,
    { provider: string; requests: number; input_tokens: number; output_tokens: number; credits_charged: number; micros: number; rate_limited_count: number }
  >();
  const byCompany = new Map<
    string,
    { company_id: string | null; company_name: string; requests: number; input_tokens: number; output_tokens: number; credits_charged: number; micros: number }
  >();
  const byFeature = new Map<
    string,
    { feature: string; requests: number; input_tokens: number; output_tokens: number; credits_charged: number; micros: number }
  >();
  const byDay = new Map<string, { date: string; requests: number; micros: number; credits_charged: number }>();

  for (const ev of eventsRes.data ?? []) {
    const inTok = Number(ev.input_tokens ?? 0);
    const outTok = Number(ev.output_tokens ?? 0);
    const cred = Number(ev.credits_charged ?? 0);
    const micros = Number(ev.cost_usd_micros ?? 0);
    const isRl = ev.status === "rate_limited" ? 1 : 0;

    requests += 1;
    inputTokens += inTok;
    outputTokens += outTok;
    creditsCharged += cred;
    totalMicros += micros;
    rateLimitedCount += isRl;

    const pKey = String(ev.provider || "desconhecido");
    const pRow = byProvider.get(pKey) ?? {
      provider: pKey,
      requests: 0,
      input_tokens: 0,
      output_tokens: 0,
      credits_charged: 0,
      micros: 0,
      rate_limited_count: 0,
    };
    pRow.requests += 1;
    pRow.input_tokens += inTok;
    pRow.output_tokens += outTok;
    pRow.credits_charged += cred;
    pRow.micros += micros;
    pRow.rate_limited_count += isRl;
    byProvider.set(pKey, pRow);

    const cKey = ev.company_id ? String(ev.company_id) : "__system__";
    const cRow = byCompany.get(cKey) ?? {
      company_id: ev.company_id ?? null,
      company_name: ev.company_id ? companyNames.get(ev.company_id) || "Empresa" : "Sistema / Master",
      requests: 0,
      input_tokens: 0,
      output_tokens: 0,
      credits_charged: 0,
      micros: 0,
    };
    cRow.requests += 1;
    cRow.input_tokens += inTok;
    cRow.output_tokens += outTok;
    cRow.credits_charged += cred;
    cRow.micros += micros;
    byCompany.set(cKey, cRow);

    const fKey = String(ev.feature || "chat_agent");
    const fRow = byFeature.get(fKey) ?? {
      feature: fKey,
      requests: 0,
      input_tokens: 0,
      output_tokens: 0,
      credits_charged: 0,
      micros: 0,
    };
    fRow.requests += 1;
    fRow.input_tokens += inTok;
    fRow.output_tokens += outTok;
    fRow.credits_charged += cred;
    fRow.micros += micros;
    byFeature.set(fKey, fRow);

    const dKey = String(ev.created_at || "").slice(0, 10) || new Date().toISOString().slice(0, 10);
    const dRow = byDay.get(dKey) ?? { date: dKey, requests: 0, micros: 0, credits_charged: 0 };
    dRow.requests += 1;
    dRow.micros += micros;
    dRow.credits_charged += cred;
    byDay.set(dKey, dRow);
  }

  const toUsd = (m: number) => Number((m / 1_000_000).toFixed(4));

  return {
    range,
    since: sinceIso,
    totals: {
      requests,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      credits_charged: creditsCharged,
      cost_usd: toUsd(totalMicros),
      rate_limited_count: rateLimitedCount,
    },
    by_provider: Array.from(byProvider.values())
      .map((r) => ({
        provider: r.provider,
        requests: r.requests,
        input_tokens: r.input_tokens,
        output_tokens: r.output_tokens,
        credits_charged: r.credits_charged,
        cost_usd: toUsd(r.micros),
        rate_limited_count: r.rate_limited_count,
      }))
      .sort((a, b) => b.requests - a.requests),
    by_company: Array.from(byCompany.values())
      .map((r) => ({
        company_id: r.company_id,
        company_name: r.company_name,
        requests: r.requests,
        input_tokens: r.input_tokens,
        output_tokens: r.output_tokens,
        credits_charged: r.credits_charged,
        cost_usd: toUsd(r.micros),
      }))
      .sort((a, b) => b.cost_usd - a.cost_usd || b.requests - a.requests),
    by_feature: Array.from(byFeature.values())
      .map((r) => ({
        feature: r.feature,
        requests: r.requests,
        input_tokens: r.input_tokens,
        output_tokens: r.output_tokens,
        credits_charged: r.credits_charged,
        cost_usd: toUsd(r.micros),
      }))
      .sort((a, b) => b.requests - a.requests),
    daily_series: Array.from(byDay.values())
      .map((r) => ({
        date: r.date,
        requests: r.requests,
        cost_usd: toUsd(r.micros),
        credits_charged: r.credits_charged,
      }))
      .sort((a, b) => a.date.localeCompare(b.date)),
  };
}

export async function getMyCompanyAiUsageServer(companyId: string, days = 30) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const safeDays = Math.max(1, Math.min(365, Math.floor(days)));
  const sinceIso = new Date(Date.now() - safeDays * 86400 * 1000).toISOString();

  // Nunca selecionar cost_usd_micros nem key_alias para a vista do cliente
  const [eventsRes, agentsRes, profilesRes] = await Promise.all([
    (supabaseAdmin as any)
      .from("ai_usage_events")
      .select("user_id, agent_id, feature, input_tokens, output_tokens, credits_charged, created_at")
      .eq("company_id", companyId)
      .gte("created_at", sinceIso)
      .limit(20000),
    supabaseAdmin.from("agent_config").select("id, nome").eq("company_id", companyId),
    supabaseAdmin.from("profiles").select("user_id, nome"),
  ]);

  if (eventsRes.error) throw new Error(eventsRes.error.message);

  const agentNames = new Map<string, string>();
  for (const a of agentsRes.data ?? []) {
    agentNames.set(a.id, a.nome || "Agente IA");
  }

  const profileNames = new Map<string, string>();
  for (const p of profilesRes.data ?? []) {
    if (p.user_id) profileNames.set(p.user_id, p.nome || "Usuário");
  }

  let requests = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let creditsCharged = 0;

  const byFeature = new Map<string, { feature: string; requests: number; input_tokens: number; output_tokens: number; credits_charged: number }>();
  const byAgent = new Map<string, { agent_id: string | null; agent_name: string; requests: number; credits_charged: number }>();
  const byUser = new Map<string, { user_id: string | null; user_name: string; requests: number; credits_charged: number }>();

  for (const ev of eventsRes.data ?? []) {
    const inTok = Number(ev.input_tokens ?? 0);
    const outTok = Number(ev.output_tokens ?? 0);
    const cred = Number(ev.credits_charged ?? 0);

    requests += 1;
    inputTokens += inTok;
    outputTokens += outTok;
    creditsCharged += cred;

    const fKey = String(ev.feature || "chat_agent");
    const fRow = byFeature.get(fKey) ?? { feature: fKey, requests: 0, input_tokens: 0, output_tokens: 0, credits_charged: 0 };
    fRow.requests += 1;
    fRow.input_tokens += inTok;
    fRow.output_tokens += outTok;
    fRow.credits_charged += cred;
    byFeature.set(fKey, fRow);

    const aKey = ev.agent_id ? String(ev.agent_id) : "__none__";
    const aRow = byAgent.get(aKey) ?? {
      agent_id: ev.agent_id ?? null,
      agent_name: ev.agent_id ? agentNames.get(ev.agent_id) || "Agente IA" : "Copiloto / Ferramentas",
      requests: 0,
      credits_charged: 0,
    };
    aRow.requests += 1;
    aRow.credits_charged += cred;
    byAgent.set(aKey, aRow);

    const uKey = ev.user_id ? String(ev.user_id) : "__auto__";
    const uRow = byUser.get(uKey) ?? {
      user_id: ev.user_id ?? null,
      user_name: ev.user_id ? profileNames.get(ev.user_id) || "Usuário" : "Automático / IA",
      requests: 0,
      credits_charged: 0,
    };
    uRow.requests += 1;
    uRow.credits_charged += cred;
    byUser.set(uKey, uRow);
  }

  return {
    days: safeDays,
    since: sinceIso,
    totals: {
      requests,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      credits_charged: creditsCharged,
    },
    by_feature: Array.from(byFeature.values()).sort((a, b) => b.credits_charged - a.credits_charged),
    by_agent: Array.from(byAgent.values()).sort((a, b) => b.credits_charged - a.credits_charged),
    by_user: Array.from(byUser.values()).sort((a, b) => b.credits_charged - a.credits_charged),
  };
}
