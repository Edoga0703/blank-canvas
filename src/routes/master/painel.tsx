import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { brand } from "@/config/brand";
import {
  DollarSign, Building2, Sparkles, AlertTriangle, Loader2, MessageSquare, PlugZap, ChevronRight, RefreshCw,
  Cpu
} from "lucide-react";
import { masterOverview } from "@/lib/master.functions";
import { getSystemHealth } from "@/lib/system-health.functions";

import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/master/painel")({
  head: () => ({
    meta: [
      { title: `Visão geral — ${brand.name} Master` },
      { name: "description", content: "Receita, workspaces, alertas operacionais e crescimento da plataforma." },
      { property: "og:title", content: `Visão geral — ${brand.name} Master` },
      { property: "og:description", content: "Painel de controle da plataforma: MRR, workspaces e alertas." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Painel,
});

const BRAND_BLUE = "#0B22FE";
const GREEN = "#22B85F";

function brl(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function Painel() {
  const load = useServerFn(masterOverview);
  const loadHealth = useServerFn(getSystemHealth);
  const [data, setData] = useState<any | null>(null);
  const [health, setHealth] = useState<any | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  async function fetchData() {
    setRefreshing(true);
    try { 
      const ov = await load();
      setData(ov ?? {}); 
    } catch (e: any) { 
      toast.error(e?.message ? String(e.message) : "Não foi possível carregar o painel.");
      setData((prev: any) => prev ?? {});
    } finally { 
      setRefreshing(false); 
    }
    try { setHealth(await loadHealth()); } catch { /* opcional */ }
  }

  useEffect(() => { void fetchData(); }, []);


  if (!data) {
    return (
      <div className="py-20 grid place-items-center text-muted-foreground">
        <Loader2 className="size-6 animate-spin" />
      </div>
    );
  }

  const s = {
    mrr: 0, arpu: 0, assinaturasAtivas: 0, total: 0, trial: 0, novasMes: 0,
    mensagens24h: 0, mensagens: 0, conexoesConectadas: 0, conexoesTotal: 0,
    lovableCredits: null as any,
    ...(data.stats ?? {}),
  };
  const alerts = (data.alerts ?? []) as any[];
  const receitaPorPlano = (data.receitaPorPlano ?? []) as any[];
  const series = (data.series ?? []) as any[];
  const totalMrr = Math.max(1, receitaPorPlano.reduce((a: number, p: any) => a + (p?.mrr ?? 0), 0));

  return (
    <div className="space-y-6">
      {/* Hero — receita e base em destaque */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0B22FE] to-[#214AC4] text-white p-5 sm:p-7">
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-end justify-between gap-6">
          <div className="min-w-0">
            <div className="text-[10.5px] font-bold uppercase tracking-[0.16em] text-white/70">Visão geral da plataforma</div>
            <div className="mt-2 text-[40px] sm:text-[46px] font-semibold leading-none tabular-nums">{brl(s.mrr)}</div>
            <div className="mt-2 text-[13px] text-white/75">
              Receita recorrente · ARPU {brl(s.arpu)} · {s.assinaturasAtivas} assinaturas ativas
            </div>
          </div>
          <div className="flex items-center gap-6 flex-wrap">
            <HeroStat label="Workspaces" value={String(s.total)} hint={`${s.novasMes} novos no mês`} />
            <HeroStat label="Em teste" value={String(s.trial)} hint="avaliação" />
            <HeroStat label="Conexões" value={`${s.conexoesConectadas}/${s.conexoesTotal}`} hint="WhatsApp online" />
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void fetchData()}
              disabled={refreshing}
              className="rounded-xl bg-white/15 hover:bg-white/25 text-white border-0"
            >
              <RefreshCw className={`size-4 mr-1.5 ${refreshing ? "animate-spin" : ""}`} /> Atualizar
            </Button>
          </div>
        </div>
        <div className="pointer-events-none absolute -right-10 -top-16 size-64 rounded-full bg-white/10 blur-2xl" />
      </div>

      {/* Alertas — só aparecem quando há problema */}
      {alerts.length > 0 && (
        <section className="space-y-2.5">
          <SectionTitle>Precisa de atenção</SectionTitle>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {alerts.map((a, i) => (
              <a
                key={a?.id ?? i}
                href={typeof a?.to === "string" && a.to ? a.to : "#"}
                className={`group flex items-center gap-3 rounded-2xl border p-4 transition-colors ${
                  a.level === "critical"
                    ? "border-red-200 bg-red-50/60 hover:bg-red-50"
                    : "border-amber-200 bg-amber-50/60 hover:bg-amber-50"
                }`}
              >
                <div className={`size-9 rounded-lg grid place-items-center shrink-0 ${
                  a.level === "critical" ? "bg-red-100 text-red-600" : "bg-amber-100 text-amber-600"
                }`}>
                  <AlertTriangle className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[13.5px] font-semibold leading-tight">
                    {a.value} · {a.label}
                  </div>
                  <div className="text-[11.5px] text-muted-foreground truncate">{a.hint}</div>
                </div>
                <ChevronRight className="size-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
              </a>
            ))}
          </div>
        </section>
      )}

      {/* KPIs */}
      <section className="space-y-2.5">
        <SectionTitle>Indicadores</SectionTitle>
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 2xl:grid-cols-6">
          <Kpi label="MRR" value={brl(s.mrr)} hint={`ARPU ${brl(s.arpu)}`} icon={<DollarSign className="size-4" />} iconBg="bg-emerald-50 text-emerald-600" />
          <Kpi label="Workspaces ativos" value={s.assinaturasAtivas} hint={`${s.total} no total`} icon={<Building2 className="size-4" />} iconBg="bg-indigo-50 text-[color:var(--brand-text)]" />
          <Kpi label="Em trial" value={s.trial} hint={`${s.novasMes} novos no mês`} icon={<Sparkles className="size-4" />} iconBg="bg-blue-50 text-blue-600" />
          <Kpi
            label="Créditos Lovable (IA)"
            value={s.lovableCredits ? Number(s.lovableCredits.remaining ?? 0).toFixed(1) : "---"}
            hint={s.lovableCredits ? `${Number(s.lovableCredits.daily_remaining ?? 0).toFixed(1)} diários (${s.lovableCredits.estimated_responses ?? 0}+ respostas estimadas)` : "Não configurado"}
            icon={<Cpu className="size-4" />}
            iconBg={Number(s.lovableCredits?.remaining ?? 99) <= 1 ? "bg-red-50 text-red-600" : "bg-cyan-50 text-cyan-600"}
          />
          <Kpi label="Mensagens 24h" value={Number(s.mensagens24h ?? 0).toLocaleString("pt-BR")} hint={`${Number(s.mensagens ?? 0).toLocaleString("pt-BR")} no total`} icon={<MessageSquare className="size-4" />} iconBg="bg-sky-50 text-sky-600" />
          <Kpi label="Conexões ativas" value={`${s.conexoesConectadas}/${s.conexoesTotal}`} hint="WhatsApp conectado" icon={<PlugZap className="size-4" />} iconBg="bg-violet-50 text-violet-600" />
        </div>
      </section>


      {/* Chart + Receita por plano */}
      <SectionTitle>Crescimento e receita</SectionTitle>
      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr] !mt-2.5">
        <Card className="p-6 rounded-2xl border-[color:var(--hairline)]">
          <h2 className="text-[17px] font-semibold">Crescimento de workspaces</h2>
          <p className="text-xs text-muted-foreground mb-4">
            Novos cadastros e ativos pagantes nos últimos 6 meses
          </p>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={series} barCategoryGap="30%" barGap={6}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(15,23,42,.08)" vertical={false} />
              <XAxis dataKey="mes" fontSize={11} stroke="#94a3b8" tickLine={false} axisLine={false} />
              <YAxis fontSize={11} allowDecimals={false} stroke="#94a3b8" tickLine={false} axisLine={false} />
              <Tooltip
                cursor={{ fill: "rgba(11,34,254,.05)" }}
                contentStyle={{ background: "#fff", border: "1px solid rgba(15,23,42,.08)", borderRadius: 12, fontSize: 12 }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" iconSize={8} />
              <Bar dataKey="novos" name="Novos" fill={BRAND_BLUE} radius={[6, 6, 0, 0]} maxBarSize={36} />
              <Bar dataKey="ativos" name="Ativos pagantes" fill={GREEN} radius={[6, 6, 0, 0]} maxBarSize={36} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-6 rounded-2xl border-[color:var(--hairline)]">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="text-[17px] font-semibold">Receita por plano</h2>
              <p className="text-xs text-muted-foreground mb-4">Distribuição do MRR</p>
            </div>
            <Link to="/master/planos" className="text-xs text-[color:var(--brand-text)] hover:underline shrink-0">Catálogo</Link>
          </div>
          {receitaPorPlano.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center">Sem assinaturas ativas ainda.</div>
          ) : (
            <div className="space-y-5">
              {receitaPorPlano.map((p: any) => {
                const pct = Math.round((p.mrr / totalMrr) * 100);
                return (
                  <div key={p.nome}>
                    <div className="flex items-center justify-between text-sm mb-1.5">
                      <span className="font-medium truncate">{p.nome}</span>
                      <span className="text-muted-foreground tabular-nums">{brl(p.mrr)}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: BRAND_BLUE }} />
                      </div>
                      <span className="text-xs text-muted-foreground tabular-nums w-10 text-right">{pct}%</span>
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-1">{p.workspaces} workspaces</div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      {/* Saúde da plataforma (antes em Sistema → Visão geral) */}
      {health && (
        <section className="space-y-2.5">
        <SectionTitle>Saúde da plataforma</SectionTitle>
        <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
          <Card className="p-6 rounded-2xl border-[color:var(--hairline)]">
            <h2 className="text-[17px] font-semibold">Capacidade da plataforma</h2>
            <p className="text-xs text-muted-foreground mb-4">Uso atual x limite da infraestrutura</p>
            <div className="space-y-3.5">
              <CapBar label="Workspaces" used={health.platform.companies.used} limit={health.platform.companies.limit} />
              <CapBar label="Usuários ativos" used={health.platform.usuarios.used} limit={health.platform.usuarios.limit} />
              <CapBar label="Conexões WhatsApp" used={health.platform.instancias.used} limit={health.platform.instancias.limit} />
              <CapBar label="Mensagens (30d)" used={health.platform.mensagens30d.used} limit={health.platform.mensagens30d.limit} />
              <CapBar label="Banco de dados" used={health.platform.dbBytes.used} limit={health.platform.dbBytes.limit} format={gb} />
              <CapBar label="Conexões do banco" used={health.platform.conexoes.used} limit={health.platform.conexoes.limit} />
            </div>
          </Card>

          <Card className="p-6 rounded-2xl border-[color:var(--hairline)] space-y-3">
            <h2 className="text-[17px] font-semibold">Operação e filas</h2>
            <p className="text-xs text-muted-foreground">Sinais técnicos que exigem intervenção</p>
            <HealthRow label="WhatsApp conectados" value={`${health.whatsapp.connected}/${health.whatsapp.total}`} bad={health.whatsapp.disconnected > 0} />
            <HealthRow label="Conexões travadas (30min+)" value={health.whatsapp.stale} bad={health.whatsapp.stale > 0} />
            <HealthRow label="Agendamentos atrasados" value={health.queues.agendadaOverdue} bad={health.queues.agendadaOverdue > 0} />
            <HealthRow label="Erros de agendamento (7d)" value={health.queues.agendadaError7d} bad={health.queues.agendadaError7d > 0} />
            <HealthRow label="Réguas paradas (3d+)" value={health.queues.cadenceStuck} bad={health.queues.cadenceStuck > 0} />
            <HealthRow label="Webhooks de cobrança falhos" value={health.billing.openFailed} bad={health.billing.openFailed > 0} />
            <HealthRow label="Contas ativas sem créditos" value={health.ai.zeroCreditActive} bad={health.ai.zeroCreditActive > 0} />
            <HealthRow label="Última mensagem recebida" value={health.overall.dbFreshMinutes === null ? "—" : `${health.overall.dbFreshMinutes} min atrás`} bad={(health.overall.dbFreshMinutes ?? 0) > 60} />
          </Card>
        </div>
        </section>
      )}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{children}</h2>
  );
}

function HeroStat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-[92px]">
      <div className="text-[10.5px] uppercase tracking-wider text-white/60">{label}</div>
      <div className="text-[22px] font-semibold leading-tight tabular-nums">{value}</div>
      {hint && <div className="text-[11px] text-white/60">{hint}</div>}
    </div>
  );
}

function gb(n: number) {
  return `${(n / (1024 ** 3)).toFixed(2)} GB`;
}

function CapBar({ label, used, limit, format }: { label: string; used: number; limit: number; format?: (n: number) => string }) {
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const tone = pct >= 90 ? "#EF4444" : pct >= 70 ? "#F59E0B" : GREEN;
  const fmt = format ?? ((n: number) => n.toLocaleString("pt-BR"));
  return (
    <div>
      <div className="flex items-center justify-between text-sm mb-1.5">
        <span className="font-medium truncate">{label}</span>
        <span className="text-muted-foreground tabular-nums text-xs">{fmt(used)} / {fmt(limit)}</span>
      </div>
      <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: tone }} />
      </div>
    </div>
  );
}

function HealthRow({ label, value, bad }: { label: string; value: React.ReactNode; bad?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 text-[13px] border-b border-[color:var(--hairline)] last:border-0 py-1.5">
      <span className="text-muted-foreground truncate">{label}</span>
      <span className={`font-semibold tabular-nums ${bad ? "text-red-600" : "text-emerald-600"}`}>{value}</span>
    </div>
  );
}


function Kpi({
  label, value, hint, icon, iconBg,
}: { label: string; value: React.ReactNode; hint?: string; icon: React.ReactNode; iconBg: string }) {
  return (
    <Card className="p-4 rounded-2xl border-[color:var(--hairline)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[12px] text-muted-foreground leading-tight break-words">{label}</div>
          <div className="text-[24px] font-semibold mt-1 tabular-nums leading-tight truncate">{value}</div>
          {hint && <div className="text-[11px] text-muted-foreground mt-1">{hint}</div>}
        </div>
        <div className={`size-9 rounded-lg grid place-items-center shrink-0 ${iconBg}`}>{icon}</div>
      </div>
    </Card>
  );
}
