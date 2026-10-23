// Métricas agregadas da frota WhatsApp (Uazapi). Server-only.

export type FleetInstance = {
  id: string;
  instanceName: string;
  displayName: string | null;
  numero: string | null;
  status: string;
  paused: boolean;
  companyId: string;
  companyName: string;
  lastStateAt: string | null;
  msgs24h: number;
};

export type WhatsappFleet = {
  generatedAt: string;
  total: number;
  connected: number;
  connecting: number;
  disconnected: number;
  paused: number;
  companies: number;
  capacity: number | null;
  available: number | null;
  usagePct: number | null;
  msgs24h: number;
  msgsIn24h: number;
  msgsOut24h: number;
  msgs7d: number;
  hourly: { hora: string; total: number }[];
  problems: FleetInstance[];
  topInstances: FleetInstance[];
  idle: FleetInstance[];
};

export async function collectWhatsappFleet(capacity?: number): Promise<WhatsappFleet> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const now = new Date();
  const dayAgo = new Date(now.getTime() - 24 * 3600 * 1000);
  const weekAgo = new Date(now.getTime() - 7 * 24 * 3600 * 1000);

  const [instRes, compRes, msgs24Res, msgs7dRes] = await Promise.all([
    (supabaseAdmin as any)
      .from("whatsapp_instances")
      .select("id, instance_name, display_name, numero, status, paused, company_id, last_state_at")
      .in("provider", ["dapi", "dapi_official"]),
    (supabaseAdmin as any).from("company").select("id, nome"),
    (supabaseAdmin as any)
      .from("mensagens")
      .select("company_id, direcao, created_at")
      .gte("created_at", dayAgo.toISOString())
      .limit(50000),
    (supabaseAdmin as any)
      .from("mensagens")
      .select("id", { count: "exact", head: true })
      .gte("created_at", weekAgo.toISOString()),
  ]);

  const rows = (instRes.data ?? []) as any[];
  const compName = new Map<string, string>(
    ((compRes.data ?? []) as any[]).map((c) => [c.id, c.nome as string]),
  );
  const msgs = (msgs24Res.data ?? []) as any[];

  const byCompany24 = new Map<string, number>();
  const hourBuckets = new Map<string, number>();
  let msgsIn = 0;
  let msgsOut = 0;
  for (const m of msgs) {
    byCompany24.set(m.company_id, (byCompany24.get(m.company_id) ?? 0) + 1);
    const d = new Date(m.created_at);
    d.setMinutes(0, 0, 0);
    const key = d.toISOString();
    hourBuckets.set(key, (hourBuckets.get(key) ?? 0) + 1);
    if (String(m.direcao) === "entrada" || String(m.direcao) === "in") msgsIn++;
    else msgsOut++;
  }

  const hourly: { hora: string; total: number }[] = [];
  for (let i = 23; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 3600 * 1000);
    d.setMinutes(0, 0, 0);
    hourly.push({
      hora: d.toLocaleTimeString("pt-BR", { hour: "2-digit" }),
      total: hourBuckets.get(d.toISOString()) ?? 0,
    });
  }

  const map = (r: any): FleetInstance => ({
    id: String(r.id),
    instanceName: String(r.instance_name ?? ""),
    displayName: r.display_name ?? null,
    numero: r.numero ?? null,
    status: String(r.status ?? ""),
    paused: !!r.paused,
    companyId: String(r.company_id),
    companyName: compName.get(String(r.company_id)) ?? "—",
    lastStateAt: r.last_state_at ?? null,
    msgs24h: byCompany24.get(String(r.company_id)) ?? 0,
  });

  const list = rows.map(map);
  const isConnected = (s: string) => s === "connected" || s === "open";

  const connected = list.filter((i) => isConnected(i.status) && !i.paused).length;
  const connecting = list.filter((i) => i.status === "connecting").length;
  const paused = list.filter((i) => i.paused).length;
  const disconnected = list.filter((i) => !isConnected(i.status) && i.status !== "connecting" && !i.paused).length;

  const cap = capacity && capacity > 0 ? capacity : null;

  return {
    generatedAt: now.toISOString(),
    total: list.length,
    connected,
    connecting,
    disconnected,
    paused,
    companies: new Set(list.map((i) => i.companyId)).size,
    capacity: cap,
    available: cap ? Math.max(0, cap - list.length) : null,
    usagePct: cap ? Math.min(100, Math.round((list.length / cap) * 100)) : null,
    msgs24h: msgs.length,
    msgsIn24h: msgsIn,
    msgsOut24h: msgsOut,
    msgs7d: msgs7dRes.count ?? 0,
    hourly,
    problems: list
      .filter((i) => !isConnected(i.status) && !i.paused)
      .sort((a, b) => (b.lastStateAt ?? "").localeCompare(a.lastStateAt ?? ""))
      .slice(0, 20),
    topInstances: [...list].sort((a, b) => b.msgs24h - a.msgs24h).slice(0, 8),
    idle: list.filter((i) => isConnected(i.status) && i.msgs24h === 0).slice(0, 12),
  };
}
