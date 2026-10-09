import { collectProvidersHealth } from "@/lib/provider-monitor.server";

export type MasterAlertLevel = "urgent" | "info";
export type MasterAlertGroup = "clientes" | "financeiro" | "suporte" | "sistema" | "treinamentos";

export type MasterAlert = {
  id: string;
  level: MasterAlertLevel;
  group: MasterAlertGroup;
  title: string;
  description: string;
  href: string;
  at: string;
};

export type MasterAlertsResult = {
  checkedAt: string;
  alerts: MasterAlert[];
  counts: Record<MasterAlertGroup, { urgent: number; info: number }>;
};

export async function collectMasterAlerts(): Promise<MasterAlertsResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const dayAgo = new Date(now - 24 * 3600 * 1000).toISOString();

  const [health, companiesRes, billingRes, ticketsRes, instancesRes, agendErrRes] = await Promise.all([
    collectProvidersHealth().catch(() => null),
    (supabaseAdmin as any).from("company").select("id, nome, created_at, status_cobranca, admin_bloqueado").gte("created_at", dayAgo),
    (supabaseAdmin as any).from("billing_event_log").select("id", { count: "exact", head: true }).eq("processed", false),
    (supabaseAdmin as any).from("support_ticket").select("id, assunto, prioridade, status, sla_due_at, created_at, unread_admin").neq("status", "resolvido").order("created_at", { ascending: false }).limit(60),
    (supabaseAdmin as any).from("whatsapp_instances").select("instance_name, display_name, status, paused, last_state_at, webhook_configured_at"),
    (supabaseAdmin as any).from("mensagem_agendada").select("id", { count: "exact", head: true }).eq("status", "erro").gte("created_at", dayAgo),
  ]);

  const alerts: MasterAlert[] = [];

  // ── Provedores (urgência máxima)
  for (const p of health?.providers ?? []) {
    if (!p.configured) continue;
    if (!p.ok) {
      alerts.push({
        id: `provider-down-${p.provider}-${p.status ?? "net"}`,
        level: "urgent",
        group: "sistema",
        title: `${p.label} instável`,
        description: p.message,
        href: "/master/diagnostico",
        at: p.checkedAt,
      });
    } else if (p.degraded) {
      alerts.push({
        id: `provider-slow-${p.provider}`,
        level: "urgent",
        group: "sistema",
        title: `${p.label} lenta`,
        description: p.message,
        href: "/master/diagnostico",
        at: p.checkedAt,
      });
    }
  }

  // ── Conexões
  const instances = (instancesRes?.data ?? []) as any[];
  const down = instances.filter((i) => i.status === "disconnected" && !i.paused);
  if (down.length) {
    alerts.push({
      id: `instances-down-${down.length}`,
      level: "urgent",
      group: "sistema",
      title: `${down.length} conexão(ões) de WhatsApp caída(s)`,
      description: down.slice(0, 3).map((i) => i.display_name || i.instance_name).join(", ") + (down.length > 3 ? "…" : ""),
      href: "/master/diagnostico",
      at: nowIso,
    });
  }
  const newlyConnected = instances.filter(
    (i) => i.status === "connected" && i.last_state_at && Date.parse(i.last_state_at) > now - 24 * 3600 * 1000,
  );
  for (const i of newlyConnected.slice(0, 5)) {
    alerts.push({
      id: `instance-up-${i.instance_name}-${i.last_state_at}`,
      level: "info",
      group: "sistema",
      title: "Nova conexão ativa",
      description: `${i.display_name || i.instance_name} conectou o WhatsApp.`,
      href: "/master/diagnostico",
      at: i.last_state_at,
    });
  }

  // ── Financeiro
  const pendingBilling = billingRes?.count ?? 0;
  if (pendingBilling > 0) {
    alerts.push({
      id: `billing-pending-${pendingBilling}`,
      level: "urgent",
      group: "financeiro",
      title: `${pendingBilling} evento(s) de cobrança não processado(s)`,
      description: "Webhooks de pagamento aguardando processamento.",
      href: "/master/financeiro",
      at: nowIso,
    });
  }

  // ── Clientes
  const newCompanies = (companiesRes?.data ?? []) as any[];
  for (const c of newCompanies.slice(0, 8)) {
    alerts.push({
      id: `company-new-${c.id}`,
      level: "info",
      group: "clientes",
      title: "Novo cadastro",
      description: `${c.nome || "Empresa sem nome"} criou uma conta.`,
      href: "/master/clientes",
      at: c.created_at,
    });
  }
  const blocked = newCompanies.filter((c) => c.admin_bloqueado);
  if (blocked.length) {
    alerts.push({
      id: `company-blocked-${blocked.length}`,
      level: "urgent",
      group: "clientes",
      title: `${blocked.length} empresa(s) bloqueada(s)`,
      description: "Contas com bloqueio administrativo ativo.",
      href: "/master/clientes",
      at: nowIso,
    });
  }

  // ── Suporte
  const tickets = (ticketsRes?.data ?? []) as any[];
  const slaBreached = tickets.filter((t) => t.sla_due_at && Date.parse(t.sla_due_at) < now);
  if (slaBreached.length) {
    alerts.push({
      id: `ticket-sla-${slaBreached.length}`,
      level: "urgent",
      group: "suporte",
      title: `${slaBreached.length} ticket(s) com SLA vencido`,
      description: slaBreached.slice(0, 2).map((t) => t.assunto).join(" · "),
      href: "/master/suporte",
      at: nowIso,
    });
  }
  const urgentTickets = tickets.filter((t) => ["urgente", "alta"].includes(String(t.prioridade || "").toLowerCase()));
  for (const t of urgentTickets.slice(0, 5)) {
    alerts.push({
      id: `ticket-urgent-${t.id}`,
      level: "urgent",
      group: "suporte",
      title: "Ticket de alta prioridade",
      description: t.assunto || "Sem assunto",
      href: "/master/suporte",
      at: t.created_at,
    });
  }
  const newTickets = tickets.filter(
    (t) => Date.parse(t.created_at) > now - 24 * 3600 * 1000 && !urgentTickets.includes(t),
  );
  for (const t of newTickets.slice(0, 5)) {
    alerts.push({
      id: `ticket-new-${t.id}`,
      level: "info",
      group: "suporte",
      title: "Novo ticket",
      description: t.assunto || "Sem assunto",
      href: "/master/suporte",
      at: t.created_at,
    });
  }

  // ── Agendamentos com erro
  const agendErr = agendErrRes?.count ?? 0;
  if (agendErr > 0) {
    alerts.push({
      id: `agend-erro-${agendErr}`,
      level: "urgent",
      group: "sistema",
      title: `${agendErr} envio(s) programado(s) com erro`,
      description: "Mensagens agendadas falharam nas últimas 24h.",
      href: "/master/sistema",
      at: nowIso,
    });
  }

  // ── Alertas operacionais persistidos (watchdog, fila de envio, webhooks)
  const { data: sysAlerts } = await (supabaseAdmin as any)
    .from("system_alerts")
    .select("id, tipo, severidade, titulo, descricao, created_at")
    .is("resolvido_em", null)
    .order("created_at", { ascending: false })
    .limit(20);
  for (const a of (sysAlerts ?? []) as any[]) {
    alerts.push({
      id: `sys-${a.id}`,
      level: a.severidade === "critical" ? "urgent" : "info",
      group: "sistema",
      title: a.titulo,
      description: a.descricao ?? "",
      href: "/master/diagnostico",
      at: a.created_at,
    });
  }


  alerts.sort((a, b) => {
    if (a.level !== b.level) return a.level === "urgent" ? -1 : 1;
    return Date.parse(b.at) - Date.parse(a.at);
  });

  const counts: MasterAlertsResult["counts"] = {
    clientes: { urgent: 0, info: 0 },
    financeiro: { urgent: 0, info: 0 },
    suporte: { urgent: 0, info: 0 },
    sistema: { urgent: 0, info: 0 },
    treinamentos: { urgent: 0, info: 0 },
  };
  for (const a of alerts) counts[a.group][a.level] += 1;

  return { checkedAt: nowIso, alerts: alerts.slice(0, 40), counts };
}
