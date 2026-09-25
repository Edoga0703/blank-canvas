import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";



async function assertSuper(supabase: any, userId: string) {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "super_admin")
    .maybeSingle();
  if (!data) throw new Error("Acesso negado");
}

export const getSystemHealth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuper(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const now = Date.now();
    const dayAgo = new Date(now - 24 * 3600 * 1000).toISOString();
    const weekAgo = new Date(now - 7 * 86400000).toISOString();
    const hourAgo = new Date(now - 3600 * 1000).toISOString();

    const stuckCadenceCutoff = new Date(now - 3 * 86400000).toISOString();

    const [
      companiesRes,
      subsRes,
      instancesRes,
      msgs24hRes,
      msgs1hRes,
      msgsTotalRes,
      ledger24hRes,
      billing24hRes,
      billing7dRes,
      billingFailedOpenRes,
      plansRes,
      lastMsgRes,
      usersActiveRes,
      contatosRes,
      msgs30dRes,
      infraRes,
      agendPendOverdueRes,
      agendErrorRes,
      cadenceStuckRes,
    ] = await Promise.all([
      supabaseAdmin.from("company").select("id, status_cobranca, trial_ate, creditos_saldo, admin_bloqueado, created_at"),
      supabaseAdmin.from("subscription").select("id, status, plan_id, valor_customizado_cents, ciclo, cortesia, company_id, extra_usuarios, extra_conexoes"),
      supabaseAdmin.from("whatsapp_instances").select("company_id, status, updated_at, last_state_at"),
      supabaseAdmin.from("mensagens").select("id", { count: "exact", head: true }).gte("created_at", dayAgo),
      supabaseAdmin.from("mensagens").select("id", { count: "exact", head: true }).gte("created_at", hourAgo),
      supabaseAdmin.from("mensagens").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("credit_ledger").select("delta, motivo, created_at").gte("created_at", dayAgo).lt("delta", 0),
      supabaseAdmin.from("billing_event_log").select("id, processed, provider, created_at").gte("created_at", dayAgo),
      supabaseAdmin.from("billing_event_log").select("id, processed, provider, created_at").gte("created_at", weekAgo),
      supabaseAdmin.from("billing_event_log").select("id", { count: "exact", head: true }).eq("processed", false),
      supabaseAdmin.from("plan").select("id, slug, preco_cents, limite_instancias, limite_usuarios, limite_contatos, limite_mensagens"),
      supabaseAdmin.from("mensagens").select("created_at").order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabaseAdmin.from("company_user").select("id", { count: "exact", head: true }).eq("ativo", true),
      supabaseAdmin.from("crm_cards").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("mensagens").select("id", { count: "exact", head: true }).eq("direcao", "saida").gte("created_at", new Date(now - 30 * 86400000).toISOString()),
      supabaseAdmin.rpc("get_infra_stats"),
      supabaseAdmin.from("mensagem_agendada").select("id", { count: "exact", head: true }).eq("status", "pendente").lt("agendado_para", new Date().toISOString()),
      supabaseAdmin.from("mensagem_agendada").select("id", { count: "exact", head: true }).eq("status", "erro").gte("created_at", weekAgo),
      supabaseAdmin.from("crm_cards").select("id", { count: "exact", head: true }).eq("regua_status", "ativa").lt("entrou_stage_em", stuckCadenceCutoff).is("regua_ultimo_disparo_em", null),
    ]);



    const companies = companiesRes.data ?? [];
    const subs = subsRes.data ?? [];
    const instances = instancesRes.data ?? [];
    const plans = plansRes.data ?? [];
    const planById = new Map(plans.map((p: any) => [p.id, p]));

    // Overall
    const totalCompanies = companies.length;
    const activeCompanies = companies.filter((c: any) => c.status_cobranca === "ativo").length;
    const trialCompanies = companies.filter((c: any) => c.status_cobranca === "trial").length;
    const suspendedCompanies = companies.filter((c: any) => c.status_cobranca === "suspenso" || c.admin_bloqueado).length;

    // WhatsApp
    const wa = { connected: 0, connecting: 0, disconnected: 0, stale: 0, total: instances.length };
    for (const i of instances as any[]) {
      const s = String(i.status || "").toLowerCase();
      if (s === "open" || s === "connected") wa.connected++;
      else if (s === "connecting" || s === "qr" || s === "pairing") wa.connecting++;
      else wa.disconnected++;
      const t = i.last_state_at || i.updated_at;
      if (t && s !== "open" && s !== "connected" && Date.parse(t) < now - 30 * 60 * 1000) wa.stale++;
    }

    // AI credits
    const totalCreditsBalance = companies.reduce((sum: number, c: any) => sum + (c.creditos_saldo ?? 0), 0);
    const zeroCreditActive = companies.filter((c: any) => (c.creditos_saldo ?? 0) <= 0 && c.status_cobranca === "ativo").length;
    const aiConsumed24h = (ledger24hRes.data ?? []).reduce((s: number, r: any) => s + Math.abs(r.delta || 0), 0);

    // Billing / MRR
    const billing24h = billing24hRes.data ?? [];
    const billing7d = billing7dRes.data ?? [];
    const billing24hFailed = billing24h.filter((e: any) => !e.processed).length;
    const billing7dFailed = billing7d.filter((e: any) => !e.processed).length;
    const failRate24h = billing24h.length ? billing24hFailed / billing24h.length : 0;

    let mrrCents = 0;
    for (const s of subs as any[]) {
      if (s.status !== "ativo" && s.status !== "active") continue;
      if (s.cortesia) continue;
      const p: any = s.plan_id ? planById.get(s.plan_id) : null;
      const price = s.valor_customizado_cents ?? p?.preco_cents ?? 0;
      const monthly = s.ciclo === "anual" ? Math.round(price / 12) : price;
      mrrCents += monthly;
    }

    const lastMsgAt = (lastMsgRes.data as any)?.created_at ?? null;
    const dbFreshMinutes = lastMsgAt ? Math.round((now - Date.parse(lastMsgAt)) / 60000) : null;

    const infra: any = (infraRes as any)?.data ?? null;

    // Capacidade da PLATAFORMA (limites do sistema como um todo — não do tenant).
    // Defina via env se quiser sobrescrever; defaults são conservadores para infra Cloud padrão.
    const num = (v: string | undefined, d: number) => {
      const n = Number(v);
      return Number.isFinite(n) && n > 0 ? n : d;
    };
    const PLATFORM_MAX_COMPANIES = num(process.env.PLATFORM_MAX_COMPANIES, 500);
    const PLATFORM_MAX_USERS = num(process.env.PLATFORM_MAX_USERS, 2000);
    const PLATFORM_MAX_INSTANCES = num(process.env.PLATFORM_MAX_INSTANCES, 500);
    const PLATFORM_MAX_MESSAGES_30D = num(process.env.PLATFORM_MAX_MESSAGES_30D, 1_000_000);
    const PLATFORM_MAX_CONTATOS = num(process.env.PLATFORM_MAX_CONTATOS, 500_000);
    const PLATFORM_MAX_DB_BYTES = num(process.env.PLATFORM_MAX_DB_BYTES, 8 * 1024 * 1024 * 1024); // 8 GB
    const PLATFORM_MAX_CONNECTIONS = Number(infra?.connections_max ?? 60);

    return {
      generated_at: new Date().toISOString(),
      overall: {
        totalCompanies,
        activeCompanies,
        trialCompanies,
        suspendedCompanies,
        totalMessages: msgsTotalRes.count ?? 0,
        messages24h: msgs24hRes.count ?? 0,
        messages1h: msgs1hRes.count ?? 0,
        dbFreshMinutes,
      },
      whatsapp: wa,
      ai: {
        totalCreditsBalance,
        zeroCreditActive,
        aiConsumed24h,
      },
      billing: {
        events24h: billing24h.length,
        failed24h: billing24hFailed,
        events7d: billing7d.length,
        failed7d: billing7dFailed,
        failRate24h,
        openFailed: billingFailedOpenRes.count ?? 0,
        mrrCents,
      },
      platform: {
        companies:   { used: totalCompanies,               limit: PLATFORM_MAX_COMPANIES },
        usuarios:    { used: usersActiveRes.count ?? 0,    limit: PLATFORM_MAX_USERS },
        instancias:  { used: wa.total,                     limit: PLATFORM_MAX_INSTANCES },
        contatos:    { used: contatosRes.count ?? 0,       limit: PLATFORM_MAX_CONTATOS },
        mensagens30d:{ used: msgs30dRes.count ?? 0,        limit: PLATFORM_MAX_MESSAGES_30D },
        dbBytes:     { used: Number(infra?.db_size_bytes ?? 0), limit: PLATFORM_MAX_DB_BYTES },
        conexoes:    { used: Number(infra?.connections_total ?? 0), limit: PLATFORM_MAX_CONNECTIONS },
      },
      queues: {
        agendadaOverdue: agendPendOverdueRes.count ?? 0,
        agendadaError7d: agendErrorRes.count ?? 0,
        cadenceStuck: cadenceStuckRes.count ?? 0,
      },
      infra: infra ? {
        dbSizeBytes: Number(infra.db_size_bytes ?? 0),
        walSizeBytes: Number(infra.wal_size_bytes ?? 0),
        connections: {
          total: Number(infra.connections_total ?? 0),
          active: Number(infra.connections_active ?? 0),
          idle: Number(infra.connections_idle ?? 0),
          max: Number(infra.connections_max ?? 0),
        },
        topTables: (infra.top_tables ?? []) as Array<{ name: string; size_bytes: number }>,
        storageTotalBytes: Number(infra.storage_total_bytes ?? 0),
        storageObjectCount: Number(infra.storage_object_count ?? 0),
        buckets: (infra.buckets ?? []) as Array<{ name: string; objects: number; size_bytes: number }>,
        slowQueries: (infra.slow_queries ?? []) as Array<{ query: string; calls: number; mean_ms: number; total_ms: number }>,
      } : null,
    };
  });

// -----------------------------------------------------------------------------
// Evolution API health probe
// -----------------------------------------------------------------------------
export const pingEvolutionApi = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuper(context.supabase, context.userId);
    const url = process.env.EVOLUTION_API_URL;
    const key = process.env.EVOLUTION_API_KEY;
    if (!url || !key) {
      return { ok: false, status: 0, latencyMs: 0, error: "EVOLUTION_API_URL/KEY não configurados", instances: null, checkedAt: new Date().toISOString() };
    }
    const started = Date.now();
    try {
      const res = await fetch(`${url.replace(/\/$/, "")}/instance/fetchInstances`, {
        headers: { apikey: key, "Content-Type": "application/json" },
        signal: AbortSignal.timeout(8000),
      });
      const latencyMs = Date.now() - started;
      let body: any = null;
      try { body = await res.json(); } catch { /* ignore */ }
      const instances = Array.isArray(body) ? body.length : (Array.isArray(body?.instances) ? body.instances.length : null);
      return {
        ok: res.ok,
        status: res.status,
        latencyMs,
        error: res.ok ? null : (body?.message || body?.error || `HTTP ${res.status}`),
        instances,
        checkedAt: new Date().toISOString(),
      };
    } catch (e: any) {
      return {
        ok: false,
        status: 0,
        latencyMs: Date.now() - started,
        error: e?.name === "TimeoutError" ? "Timeout (>8s)" : (e?.message ?? "Erro de rede"),
        instances: null,
        checkedAt: new Date().toISOString(),
      };
    }
  });




