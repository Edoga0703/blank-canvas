export type ProviderKey = "dapi";

export type ProviderHealth = {
  provider: ProviderKey;
  label: string;
  configured: boolean;
  ok: boolean;
  degraded: boolean;
  status?: number;
  latencyMs: number;
  message: string;
  url?: string;
  instancesRemote?: number;
  capacity?: number;
  capacitySource?: "provider" | "manual";
  instancesLocal: number;
  connected: number;
  connecting: number;
  disconnected: number;
  paused: number;
  checkedAt: string;
};

export type ProvidersHealthResult = {
  checkedAt: string;
  providers: ProviderHealth[];
};

const LATENCY_DEGRADED_MS = 2500;

export function detectCapacity(parsed: any): number | undefined {
  const candidates = [
    parsed?.limit, parsed?.max_instances, parsed?.maxInstances, parsed?.instance_limit,
    parsed?.instancesLimit, parsed?.plan?.max_instances, parsed?.plan?.limit,
    parsed?.subscription?.max_instances, parsed?.account?.max_instances,
    parsed?.data?.limit, parsed?.data?.max_instances,
  ];
  for (const c of candidates) {
    const n = Number(c);
    if (Number.isFinite(n) && n > 0) return Math.round(n);
  }
  return undefined;
}

export async function getProviderCapacityConfig(): Promise<Record<string, number>> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await (supabaseAdmin as any)
    .from("app_config").select("provider_capacity").eq("id", true).maybeSingle();
  const raw = (data?.provider_capacity ?? {}) as Record<string, unknown>;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw)) {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) out[k] = Math.round(n);
  }
  return out;
}

export async function saveProviderCapacityConfig(next: Record<string, number>) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const clean: Record<string, number> = {};
  for (const [k, v] of Object.entries(next)) {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) clean[k] = Math.round(n);
  }
  const { error } = await (supabaseAdmin as any)
    .from("app_config").upsert({ id: true, provider_capacity: clean });
  if (error) throw new Error(error.message);
  return clean;
}

async function ping(url: string, headers: Record<string, string>) {
  const started = Date.now();
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json", ...headers },
      signal: AbortSignal.timeout(12_000),
    });
    const text = await res.text();
    let parsed: any = null;
    try { parsed = text ? JSON.parse(text) : null; } catch { parsed = null; }
    return { latencyMs: Date.now() - started, status: res.status as number | undefined, ok: res.ok, parsed, error: undefined as string | undefined };
  } catch (e: any) {
    return { latencyMs: Date.now() - started, status: undefined as number | undefined, ok: false, parsed: null, error: String(e?.message ?? e) };
  }
}

function countRemote(parsed: any): number | undefined {
  if (Array.isArray(parsed)) return parsed.length;
  if (Array.isArray(parsed?.sessions)) return parsed.sessions.length;
  if (Array.isArray(parsed?.instances)) return parsed.instances.length;
  if (Array.isArray(parsed?.data)) return parsed.data.length;
  return undefined;
}

export async function collectProvidersHealth(): Promise<ProvidersHealthResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: rows } = await (supabaseAdmin as any)
    .from("whatsapp_instances")
    .select("instance_name, provider, provider_type, status, paused")
    .in("provider", ["dapi", "dapi_official"]);

  const local = (rows ?? []) as any[];
  const stats = () => ({
    instancesLocal: local.length,
    connected: local.filter((r) => r.status === "connected" && !r.paused).length,
    connecting: local.filter((r) => r.status === "connecting").length,
    disconnected: local.filter((r) => r.status === "disconnected" && !r.paused).length,
    paused: local.filter((r) => !!r.paused).length,
  });

  const checkedAt = new Date().toISOString();
  const manualCapacity = await getProviderCapacityConfig();

  function build(
    provider: ProviderKey,
    label: string,
    url: string,
    configured: boolean,
    r: Awaited<ReturnType<typeof ping>> | null,
    missingMsg: string,
  ): ProviderHealth {
    const s = stats();
    const manual = manualCapacity[provider];
    if (!configured || !r) {
      return {
        provider, label, configured: false, ok: false, degraded: false,
        latencyMs: 0, message: missingMsg, url: url || undefined, ...s,
        capacity: manual, capacitySource: manual ? "manual" : undefined, checkedAt,
      };
    }
    const authFail = r.status === 401 || r.status === 403;
    const ok = r.ok;
    const degraded = ok && r.latencyMs > LATENCY_DEGRADED_MS;
    const remote = ok ? countRemote(r.parsed) : undefined;
    const detected = ok ? detectCapacity(r.parsed) : undefined;
    const capacity = detected ?? manual;
    const message = ok
      ? degraded
        ? `Operacional, porém lento (${r.latencyMs} ms).`
        : remote !== undefined
          ? `Operacional — ${remote} sessão(ões) na D-API.`
          : "Operacional."
      : authFail
        ? "Credenciais inválidas ou expiradas (DAPI_API_KEY)."
        : r.status
          ? `Servidor respondeu HTTP ${r.status}.`
          : `Sem resposta: ${r.error || "erro de rede"}.`;
    return {
      provider, label, configured: true, ok, degraded,
      status: r.status, latencyMs: r.latencyMs, message,
      url, instancesRemote: remote, ...s,
      capacity, capacitySource: capacity === undefined ? undefined : detected !== undefined ? "provider" : "manual",
      checkedAt,
    };
  }

  const dapiUrl = (process.env.DAPI_BASE_URL || "https://api.d-api.cloud/api/v1").replace(/\/+$/, "");
  const dapiKey = (process.env.DAPI_API_KEY || "098aeda184429bc8201ba60d88116821906397caa5fd5b935b615318a245da03").trim();
  const dapiPing = dapiUrl && dapiKey ? await ping(`${dapiUrl}/sessions`, { Authorization: dapiKey }) : null;

  return {
    checkedAt,
    providers: [
      build("dapi", "D-API WhatsApp SaaS", dapiUrl, !!(dapiUrl && dapiKey), dapiPing, "DAPI_API_KEY não configurada."),
    ],
  };
}
