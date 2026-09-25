// Agregador único da "Visão geral" do painel master.
// Server-only: usa o client admin. Nunca importar do browser.

export type MasterAlert = {
  id: string;
  level: "critical" | "warning";
  label: string;
  value: number;
  hint: string;
  to: string;
};

export async function computeMasterOverview() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const now = new Date();
  const dayAgo = new Date(now.getTime() - 24 * 3600 * 1000).toISOString();

  const [
    companiesRes,
    subsRes,
    msgsTotalRes,
    msgs24hRes,
    instancesRes,
    billingOpenRes,
    agendOverdueRes,
    zeroCreditRes,
    lovableCreditsRes,
  ] = await Promise.all([
    supabaseAdmin.from("company").select("id, status_cobranca, trial_ate, created_at, creditos_saldo, admin_bloqueado"),
    supabaseAdmin
      .from("subscription")
      .select(
        "status, company_id, created_at, cortesia, valor_customizado_cents, current_period_end, plan:plan(id, nome, preco_cents)",
      ),
    supabaseAdmin.from("mensagens").select("id", { count: "exact", head: true }),
    supabaseAdmin.from("mensagens").select("id", { count: "exact", head: true }).gte("created_at", dayAgo),
    supabaseAdmin.from("whatsapp_instances").select("status"),
    supabaseAdmin.from("billing_event_log").select("id", { count: "exact", head: true }).eq("processed", false),
    supabaseAdmin
      .from("mensagem_agendada")
      .select("id", { count: "exact", head: true })
      .eq("status", "pendente")
      .lt("agendado_para", now.toISOString()),
    supabaseAdmin
      .from("company")
      .select("id", { count: "exact", head: true })
      .eq("status_cobranca", "ativo")
      .lte("creditos_saldo", 0),
    supabaseAdmin.from("lovable_credit_balance").select("*").maybeSingle(),
  ]);

  const all = (companiesRes.data ?? []) as any[];
  const subs = (subsRes.data ?? []) as any[];
  const instances = (instancesRes.data ?? []) as any[];
  const lovableCredits = lovableCreditsRes.data;

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  // Só entra no MRR quem realmente paga: assinatura ativa, não-cortesia,
  // com valor > 0 e ciclo vigente (5 dias de tolerância).
  const GRACE_MS = 5 * 86_400_000;
  const valorOf = (s: any) => s.valor_customizado_cents ?? s.plan?.preco_cents ?? 0;
  const activeSubs = subs.filter((s: any) => {
    if (s.status !== "active" || s.cortesia) return false;
    if (valorOf(s) <= 0) return false;
    if (!s.current_period_end) return false;
    return new Date(s.current_period_end).getTime() >= now.getTime() - GRACE_MS;
  });
  const mrr = activeSubs.reduce((sum, s) => sum + valorOf(s), 0);

  const conectadas = instances.filter((i) => {
    const s = String(i.status || "").toLowerCase();
    return s === "open" || s === "connected";
  }).length;

  const stats = {
    total: all.length,
    ativas: all.filter((c) => c.status_cobranca === "ativo").length,
    trial: all.filter((c) => c.status_cobranca === "trial").length,
    suspensas: all.filter((c) => c.status_cobranca === "suspenso" || c.admin_bloqueado).length,
    novasMes: all.filter((c) => new Date(c.created_at).getTime() >= monthStart).length,
    mensagens: msgsTotalRes.count ?? 0,
    mensagens24h: msgs24hRes.count ?? 0,
    assinaturasAtivas: activeSubs.length,
    mrr,
    arpu: activeSubs.length ? Math.round(mrr / activeSubs.length) : 0,
    emAtraso: subs.filter((s) => s.status === "past_due").length,
    churn: subs.filter((s) => s.status === "canceled").length,
    conexoesTotal: instances.length,
    conexoesConectadas: conectadas,
    lovableCredits: lovableCredits ? {
      remaining: lovableCredits.remaining,
      total: lovableCredits.total_granted,
      used: lovableCredits.billing_period_used,
      daily_remaining: lovableCredits.daily_remaining,
      updated_at: lovableCredits.updated_at,
      estimated_responses: Math.floor(lovableCredits.remaining * 100) // Estimativa conservadora: 1 crédito ≈ 100 respostas
    } : null

  };

  // Receita por plano
  const byPlan = new Map<string, { nome: string; mrr: number; workspaces: number }>();
  for (const s of activeSubs) {
    const p = s.plan;
    if (!p) continue;
    const key = p.id ?? p.nome ?? "sem-plano";
    const prev = byPlan.get(key) ?? { nome: p.nome ?? "Sem plano", mrr: 0, workspaces: 0 };
    prev.mrr += p.preco_cents ?? 0;
    prev.workspaces += 1;
    byPlan.set(key, prev);
  }
  const receitaPorPlano = Array.from(byPlan.values()).sort((a, b) => b.mrr - a.mrr);

  // Crescimento — 6 meses
  const series: { mes: string; novos: number; ativos: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const next = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    const novos = all.filter((c) => {
      const t = new Date(c.created_at).getTime();
      return t >= d.getTime() && t < next.getTime();
    }).length;
    const ativos = activeSubs.filter((s) => new Date(s.created_at).getTime() < next.getTime()).length;
    series.push({ mes: d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", ""), novos, ativos });
  }

  // Alertas — só o que exige ação
  const alerts: MasterAlert[] = [];
  const billingOpen = billingOpenRes.count ?? 0;
  if (billingOpen > 0) {
    alerts.push({
      id: "billing",
      level: "critical",
      label: "Eventos de cobrança falhados",
      value: billingOpen,
      hint: "Webhooks não processados — reprocesse",
      to: "/master/clientes",
    });
  }
  const desconectadas = instances.length - conectadas;
  if (desconectadas > 0) {
    alerts.push({
      id: "wa",
      level: desconectadas > instances.length / 2 ? "critical" : "warning",
      label: "Conexões WhatsApp fora do ar",
      value: desconectadas,
      hint: `${conectadas}/${instances.length} conectadas`,
      to: "/master/sistema",
    });
  }
  const overdue = agendOverdueRes.count ?? 0;
  if (overdue > 0) {
    alerts.push({
      id: "fila",
      level: "warning",
      label: "Mensagens agendadas atrasadas",
      value: overdue,
      hint: "Fila com envios pendentes vencidos",
      to: "/master/sistema",
    });
  }
  const semCredito = zeroCreditRes.count ?? 0;
  if (semCredito > 0) {
    alerts.push({
      id: "credito",
      level: "warning",
      label: "Empresas ativas sem crédito de IA",
      value: semCredito,
      hint: "Agente de IA parado nessas contas",
      to: "/master/clientes",
    });
  }
  if (stats.emAtraso > 0) {
    alerts.push({
      id: "atraso",
      level: "critical",
      label: "Assinaturas em atraso",
      value: stats.emAtraso,
      hint: "Cobrança pendente",
      to: "/master/clientes",
    });
  }

  // Alerta de créditos Lovable baixos
  if (lovableCredits && lovableCredits.remaining <= 2) {
    alerts.push({
      id: "lovable-credits",
      level: lovableCredits.remaining <= 0.5 ? "critical" : "warning",
      label: "Créditos Lovable Críticos",
      value: lovableCredits.remaining,
      hint: lovableCredits.remaining <= 0 ? "IA PARADA: créditos esgotados na Lovable" : "Créditos quase acabando no AI Gateway",
      to: "/master/sistema",
    });
  }

  return { stats, series, receitaPorPlano, alerts, generated_at: now.toISOString() };
}
