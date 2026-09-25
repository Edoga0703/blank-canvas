export type ProviderKey = "uazapi";

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

/** Tenta ler o limite de instâncias direto da resposta do provedor. */
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
  if (Array.isArray(parsed?.instances)) return parsed.instances.length;
  if (Array.isArray(parsed?.data)) return parsed.data.length;
  return undefined;
}

export async function collectProvidersHealth(): Promise<ProvidersHealthResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: rows } = await (supabaseAdmin as any)
    .from("whatsapp_instances")
    .select("instance_name, provider, provider_type, status, paused");

  const local = (rows ?? []) as any[];
  const stats = (key: ProviderKey) => {
    const list = local.filter((r) => {
      const p = String(r.provider || r.provider_type || "uazapi").toLowerCase();
      return p.includes(key);
    });
    return {
      instancesLocal: list.length,
      connected: list.filter((r) => r.status === "connected" && !r.paused).length,
      connecting: list.filter((r) => r.status === "connecting").length,
      disconnected: list.filter((r) => r.status === "disconnected" && !r.paused).length,
      paused: list.filter((r) => !!r.paused).length,
    };
  };

  const checkedAt = new Date().toISOString();
  const manualCapacity = await getProviderCapacityConfig();

  const uazapiUrl = (process.env.UAZAPI_URL || "").replace(/\/+$/, "");
  const uazapiToken = process.env.UAZAPI_ADMIN_TOKEN || "";

  const uazFirst = uazapiUrl && uazapiToken ? await ping(`${uazapiUrl}/instance/all`, { admintoken: uazapiToken }) : null;


  // Garbage collection: instâncias que existem no servidor Uazapi mas não têm
  // registro local (sobras de tentativas de conexão) consomem slot da capacidade
  // e inflam a contagem. Removemos as órfãs criadas há mais de 15 minutos.
  let uaz = uazFirst;
  if (uaz?.ok && uazapiUrl && uazapiToken) {
    const remoteList: any[] = Array.isArray(uaz.parsed)
      ? uaz.parsed
      : Array.isArray((uaz.parsed as any)?.instances)
        ? (uaz.parsed as any).instances
        : [];
    const localNames = new Set(local.map((r) => String(r.instance_name || "")));
    const cutoff = Date.now() - 15 * 60 * 1000;
    const orphans = remoteList.filter((i) => {
      const name = String(i?.name || "");
      if (!name || localNames.has(name)) return false;
      const created = Date.parse(i?.created || "") || 0;
      return created > 0 && created < cutoff && !!i?.token;
    });
    if (orphans.length) {
      await Promise.all(
        orphans.map((i) =>
          fetch(`${uazapiUrl}/instance`, { method: "DELETE", headers: { token: String(i.token) } })
            .catch((e) => console.warn("[uazapi.pruneOrphan]", i?.name, e?.message)),
        ),
      );
      const refreshed = await ping(`${uazapiUrl}/instance/all`, { admintoken: uazapiToken });
      if (refreshed.ok) uaz = refreshed;
    }
  }

  function build(
    provider: ProviderKey,
    label: string,
    url: string,
    configured: boolean,
    r: Awaited<ReturnType<typeof ping>> | null,
    missingMsg: string,
  ): ProviderHealth {
    const s = stats(provider);
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
          ? `Operacional — ${remote} instância(s) no provedor.`
          : "Operacional."
      : authFail
        ? "Credenciais inválidas ou expiradas."
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

  return {
    checkedAt,
    providers: [
      build("uazapi", "Uazapi", uazapiUrl, !!(uazapiUrl && uazapiToken), uaz, "UAZAPI_URL / UAZAPI_ADMIN_TOKEN não configurados."),
    ],
  };
}
