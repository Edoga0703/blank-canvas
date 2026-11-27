function generateHolderId(): string {
  if (typeof globalThis !== "undefined" && typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export interface PoolSlotLease {
  leaseId: string | null;
  keyId: string | null;
  alias: string;
  apiKey: string;
  fromPool: boolean;
}

export interface RecordAiUsageParams {
  companyId?: string | null;
  userId?: string | null;
  agentId?: string | null;
  provider: string;
  model: string;
  keyId?: string | null;
  keyAlias?: string | null;
  feature?: string;
  inputTokens?: number;
  outputTokens?: number;
  audioSeconds?: number;
  creditsCharged?: number;
  costUsdMicros?: number;
  latencyMs?: number;
  status?: "ok" | "rate_limited" | "error";
  errorMessage?: string | null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const TOKEN_PRICING_USD_PER_1M: Array<{ match: RegExp; input: number; output: number }> = [
  { match: /gemini-3\.8-flash|gemini-2\.5-pro|gemini-3\.5-pro/i, input: 0.75, output: 3.75 },
  { match: /gemini-3\.5-flash|gemini-2\.5-flash|gemini-2\.0-flash/i, input: 0.30, output: 2.50 },
  { match: /gpt-4o-mini/i, input: 0.15, output: 0.60 },
  { match: /gpt-4\.1-mini/i, input: 0.40, output: 1.60 },
  { match: /gpt-4\.1(?!-)/i, input: 2.00, output: 8.00 },
  { match: /gpt-4o(?!-mini)/i, input: 2.50, output: 10.00 },
  { match: /claude-3-5-haiku|claude-haiku/i, input: 0.80, output: 4.00 },
  { match: /claude/i, input: 3.00, output: 15.00 },
];

/**
 * Calcula custo estimado em microdólares (1 USD = 1_000_000 micros).
 * Nota: 1 token * ($/1M) == microdólares exatos.
 */
export function estimateCostUsdMicros(
  provider: string,
  model: string,
  inputTokens = 0,
  outputTokens = 0,
  audioSeconds = 0,
): number {
  const p = String(provider || "").toLowerCase();
  const m = String(model || "").toLowerCase();

  if (m.includes("whisper") || (audioSeconds > 0 && inputTokens === 0 && outputTokens === 0)) {
    const secs = Math.max(0, Number(audioSeconds) || 0);
    // Whisper: $0.006 / min = 6_000 micros / 60s
    return secs > 0 ? Math.max(100, Math.round((secs / 60) * 6000)) : 0;
  }

  if (p === "drael" || m.startsWith("drael")) {
    // Assinatura fixa (~$40 / 4 semanas), custo amortizado aproximado por turno
    return 700;
  }

  const entry = TOKEN_PRICING_USD_PER_1M.find((r) => r.match.test(m));
  const rates = entry ?? (
    p === "anthropic"
      ? { input: 3.0, output: 15.0 }
      : p === "openai"
        ? { input: 0.15, output: 0.60 }
        : { input: 0.30, output: 2.50 }
  );

  const inTok = Math.max(0, Number(inputTokens) || 0);
  const outTok = Math.max(0, Number(outputTokens) || 0);
  const total = inTok * rates.input + outTok * rates.output;
  if (total <= 0 && (inTok > 0 || outTok > 0)) return 1;
  return Math.round(total);
}

async function resolveLegacyKey(provider: string): Promise<string | null> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await (supabaseAdmin as any)
      .from("master_settings")
      .select("value")
      .eq("key", "global_ai_config")
      .maybeSingle();
    const val = (data?.value as any) || {};
    if (provider === "drael") {
      const openKey = String(val.openai_api_key || "").trim();
      const k =
        String(val.drael_api_key || "").trim() ||
        (openKey.startsWith("dk-") ? openKey : "") ||
        String(process.env.DRAEL_API_KEY || "").trim();
      return k || null;
    }
    if (provider === "openai") {
      const openKey = String(val.openai_api_key || process.env.OPENAI_API_KEY || "").trim();
      return openKey && !openKey.startsWith("dk-") ? openKey : null;
    }
    if (provider === "gemini") {
      return String(val.gemini_api_key || process.env.GEMINI_API_KEY || "").trim() || null;
    }
    if (provider === "anthropic") {
      return String(val.anthropic_api_key || process.env.ANTHROPIC_API_KEY || "").trim() || null;
    }
  } catch {
    // ignore
  }
  return null;
}

/**
 * Adquire 1 turno (lease atômico via PostgreSQL FOR UPDATE SKIP LOCKED) para o provedor.
 * Se todas as contas estiverem com os 4 hilos ocupados, aguarda com polling e jitter até maxWaitMs.
 * Se não houver contas no pool (ai_provider_keys vazio), usa retrocompatibilidade com master_settings.
 */
export async function acquirePoolSlotWithWait(
  provider: string,
  options?: {
    maxWaitMs?: number;
    excludeKeyIds?: string[];
    leaseSeconds?: number;
  },
): Promise<PoolSlotLease | null> {
  const maxWaitMs = options?.maxWaitMs ?? 8000;
  const excludeKeyIds = options?.excludeKeyIds ?? [];
  const leaseSeconds = options?.leaseSeconds ?? 45;
  const holderId = generateHolderId();
  const deadline = Date.now() + maxWaitMs;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // Checar quantas chaves existem no pool para decidir entre wait vs fallback legado
  let totalKeysForProvider = 0;
  let eligibleActiveKeys = 0;
  try {
    const { data: keysMeta } = await (supabaseAdmin as any)
      .from("ai_provider_keys")
      .select("id, active, cooldown_until")
      .eq("provider", provider);
    const list = Array.isArray(keysMeta) ? keysMeta : [];
    totalKeysForProvider = list.length;
    const nowMs = Date.now();
    eligibleActiveKeys = list.filter((k: any) => {
      if (!k.active) return false;
      if (excludeKeyIds.includes(k.id)) return false;
      if (k.cooldown_until && new Date(k.cooldown_until).getTime() > nowMs + maxWaitMs) return false;
      return true;
    }).length;
  } catch {
    totalKeysForProvider = 0;
  }

  if (totalKeysForProvider === 0) {
    if (excludeKeyIds.includes("legacy-master")) return null;
    const legacy = await resolveLegacyKey(provider);
    if (!legacy) return null;
    return {
      leaseId: null,
      keyId: null,
      alias: "legacy-master",
      apiKey: legacy,
      fromPool: false,
    };
  }

  if (eligibleActiveKeys === 0) {
    return null;
  }

  while (true) {
    try {
      const { data, error } = await (supabaseAdmin as any).rpc("acquire_ai_pool_slot", {
        p_provider: provider,
        p_holder_id: holderId,
        p_lease_seconds: leaseSeconds,
        p_exclude_key_ids: excludeKeyIds,
      });

      if (!error) {
        const row = Array.isArray(data) ? data[0] : data;
        if (row?.key_id && row?.api_key) {
          return {
            leaseId: row.lease_id ?? null,
            keyId: row.key_id,
            alias: row.alias || "pool-key",
            apiKey: row.api_key,
            fromPool: true,
          };
        }
      }
    } catch {
      // retry until deadline
    }

    if (Date.now() >= deadline) {
      return null;
    }

    const waitMs = 350 + Math.floor(Math.random() * 250);
    await sleep(Math.min(waitMs, Math.max(50, deadline - Date.now())));
  }
}

export async function releasePoolSlot(leaseId: string | null | undefined): Promise<void> {
  if (!leaseId) return;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await (supabaseAdmin as any).rpc("release_ai_pool_slot", { p_lease_id: leaseId });
  } catch {
    // lease expirará automaticamente pelo TTL de 45s
  }
}

export async function cooldownPoolKey(
  keyId: string | null | undefined,
  cooldownSeconds = 15,
  errorMessage?: string | null,
): Promise<void> {
  if (!keyId) return;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await (supabaseAdmin as any).rpc("cooldown_ai_pool_key", {
      p_key_id: keyId,
      p_cooldown_seconds: cooldownSeconds,
      p_error: errorMessage ? String(errorMessage).slice(0, 400) : null,
    });
  } catch {
    // ignore
  }
}

export async function recordAiUsageEvent(params: RecordAiUsageParams): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const status = params.status ?? "ok";
    const inputTokens = Math.max(0, Math.round(Number(params.inputTokens) || 0));
    const outputTokens = Math.max(0, Math.round(Number(params.outputTokens) || 0));
    const audioSeconds = Math.max(0, Math.round(Number(params.audioSeconds) || 0));
    const latencyMs = Math.max(0, Math.round(Number(params.latencyMs) || 0));

    const costUsdMicros =
      typeof params.costUsdMicros === "number"
        ? Math.max(0, Math.round(params.costUsdMicros))
        : status === "ok"
          ? estimateCostUsdMicros(params.provider, params.model, inputTokens, outputTokens, audioSeconds)
          : 0;

    const creditsCharged =
      typeof params.creditsCharged === "number"
        ? Math.max(0, Math.round(params.creditsCharged))
        : status === "ok"
          ? 1
          : 0;

    await (supabaseAdmin as any).from("ai_usage_events").insert({
      company_id: params.companyId || null,
      user_id: params.userId || null,
      agent_id: params.agentId || null,
      provider: params.provider,
      model: params.model || "unknown",
      key_id: params.keyId || null,
      key_alias: params.keyAlias || null,
      feature: params.feature || "chat_agent",
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      audio_seconds: audioSeconds,
      credits_charged: creditsCharged,
      cost_usd_micros: costUsdMicros,
      latency_ms: latencyMs,
      status,
      error_message: params.errorMessage ? String(params.errorMessage).slice(0, 500) : null,
    });
  } catch {
    // Telemetria nunca pode interromper a resposta de IA
  }
}
