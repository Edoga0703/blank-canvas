import type React from "react";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import {
  DollarSign, Users, TrendingUp, Wallet, Activity, Filter, PieChart as PieIcon,
  Trophy, MessageSquare, ClipboardList, Target, Star, Smile,
  Receipt, CalendarClock, UserX, XCircle,
  Inbox, Hourglass, Headphones, CheckCircle2, UserCheck, Timer, Clock,
  Crown, Bot, Zap
} from "lucide-react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import type { DashboardMetrics, Range } from "./widget-data";
import { InitialsAvatar } from "@/components/ui/initials-avatar";
import { OPS_WIDGETS } from "./ops-widgets";
import { TEAM_WIDGETS } from "./team-widgets";


export type CellSize = 1 | 2;
export type ChartKind = "kpi" | "area" | "bar" | "pie" | "progress" | "line" | "funnel";

export const WIDGET_CATEGORIES = [
  "Vendas", "Leads", "Conversas", "Agendamentos", "Tarefas", "Marketing", "Satisfação",
  "Atendimento & Operação",
] as const;

export type WidgetCategory = (typeof WIDGET_CATEGORIES)[number];

export interface WidgetMeta {
  id: string;
  title: string;
  description: string;
  category: WidgetCategory;
  icon: LucideIcon;
  defaultChart: ChartKind;
  supportedCharts: ChartKind[];
  render: (props: {
    chart: ChartKind;
    size: CellSize;
    metrics: DashboardMetrics;
    range: Range;
  }) => React.ReactElement;
}

const PIE_COLORS = ["#0b22fe", "#22d3ee", "#f59e0b", "#10b981", "#ef4444", "#a78bfa"];
const rangeLabel: Record<Range, string> = {
  today: "hoje", "7d": "últimos 7 dias", "30d": "este mês", "90d": "últimos 90 dias",
};

function fmtBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}
function fmtBRLCompact(v: number) {
  if (v >= 1000) {
    return "R$ " + (v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "k";
  }
  return fmtBRL(v);
}
function fmtNum(v: number) { return v.toLocaleString("pt-BR"); }

function Header({ title, Icon }: { title: string; Icon: LucideIcon }) {
  return (
    <div className="flex items-start justify-between gap-1.5 mb-1">
      <div className="text-[10.5px] uppercase tracking-[0.1em] text-muted-foreground/80 font-semibold leading-tight break-words min-w-0 flex-1">
        {title}
      </div>
      <Icon className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0 mt-0.5" />
    </div>
  );
}

function Delta({ value, suffix = "" }: { value: number; suffix?: string }) {
  const pos = value >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${
      pos ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-red-500/10 text-red-600 dark:text-red-400"
    }`}>
      {pos ? "▲" : "▼"} {fmtNum(Math.abs(value))}{suffix}
    </span>
  );
}

function KpiBig({
  label, value, delta, range, color, Icon,
}: {
  label: string; value: string; delta: React.ReactNode; range: Range;
  color: "cyan" | "emerald" | "amber" | "primary"; Icon: LucideIcon;
}) {
  const colorClass = {
    cyan: "text-cyan-500 dark:text-cyan-400",
    emerald: "text-emerald-500 dark:text-emerald-400",
    amber: "text-amber-500 dark:text-amber-400",
    primary: "text-primary",
  }[color];
  return (
    <div className="h-full flex flex-col justify-between p-3.5 sm:p-5 bg-card border border-border/60 rounded-2xl overflow-hidden shadow-sm">
      <Header title={label} Icon={Icon} />
      <div className="flex-1 flex flex-col justify-center min-w-0">
        <div
          className={`font-bold leading-none tracking-tight ${colorClass} flex items-baseline gap-1`}
          style={{ fontSize: "clamp(1.3rem, 2.6vw, 2.375rem)" }}
        >
          {value.startsWith("R$") ? (
            <>
              <span style={{ fontSize: "0.55em" }} className="font-semibold opacity-80">R$</span>
              <span>{value.replace(/^R\$\s*/, "")}</span>
            </>
          ) : (
            value
          )}
        </div>
      </div>
      <div className="text-[11px] text-muted-foreground mt-2 sm:mt-3 flex items-center justify-between gap-2">
        <span className="truncate">{rangeLabel[range]}</span>
        <span className="shrink-0">{delta}</span>
      </div>
    </div>
  );
}

function ChartCard({
  label, Icon, children,
}: { label: string; Icon: LucideIcon; children: React.ReactNode }) {
  return (
    <div className="h-full flex flex-col p-3.5 sm:p-5 bg-card border border-border/60 rounded-2xl min-h-0 shadow-sm">
      <Header title={label} Icon={Icon} />
      <div className="flex-1 min-h-0 mt-1">{children}</div>
    </div>
  );
}

function AreaBig({ data }: { data: { date: string; value: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 10, right: 6, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="areaG" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0b22fe" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#0b22fe" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} vertical={false} />
        <XAxis dataKey="date" fontSize={10} stroke="hsl(var(--muted-foreground))" tickLine={false} axisLine={false} />
        <YAxis fontSize={10} stroke="hsl(var(--muted-foreground))" tickLine={false} axisLine={false} />
        <Tooltip
          cursor={{ stroke: "#0b22fe", strokeOpacity: 0.35, strokeWidth: 1 }}
          wrapperStyle={{ zIndex: 50, outline: "none" }}
          contentStyle={{ background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 10, fontSize: 12, boxShadow: "0 6px 20px -8px rgba(0,0,0,0.25)" }}
        />
        <Area type="monotone" dataKey="value" stroke="#0b22fe" fill="url(#areaG)" strokeWidth={2.5} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function BarBig({ data }: { data: { stage: string; count: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 10, right: 6, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} vertical={false} />
        <XAxis dataKey="stage" fontSize={10} stroke="hsl(var(--muted-foreground))" tickLine={false} axisLine={false} />
        <YAxis fontSize={10} stroke="hsl(var(--muted-foreground))" tickLine={false} axisLine={false} />
        <Tooltip
          cursor={{ fill: "rgba(11, 34, 254, 0.06)" }}
          wrapperStyle={{ zIndex: 50, outline: "none" }}
          contentStyle={{ background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 10, fontSize: 12, boxShadow: "0 6px 20px -8px rgba(0,0,0,0.25)" }}
        />
        <Bar dataKey="count" fill="#0b22fe" radius={[8, 8, 0, 0]} maxBarSize={48} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function FunnelBig({ data }: { data: { stage: string; count: number }[] }) {
  // Funil fixo: formatação sempre visível, mesmo sem dados nas etapas.
  const DEFAULT_STAGES = ["Novo lead", "Qualificação", "Proposta", "Negociação", "Ganho"];
  const stages = data.filter((s) => s.stage);
  const rendered = stages.length > 0
    ? stages
    : DEFAULT_STAGES.map((stage) => ({ stage, count: 0 }));

  const COLORS = ["#0b22fe", "#3b4bff", "#6172ff", "#8a97ff", "#b3bbff", "#d6dbff"];
  const n = rendered.length;
  // Largura vai de 100% no topo até 45% na base — trapézio contínuo.
  const widthAt = (i: number) => 100 - (i / n) * 55;

  return (
    <div className="h-full w-full flex flex-col items-center justify-center gap-[3px] py-2">
      {rendered.map((s, i) => {
        const top = widthAt(i);
        const bottom = widthAt(i + 1);
        const color = COLORS[i % COLORS.length];
        const clip = `polygon(${(100 - top) / 2}% 0, ${100 - (100 - top) / 2}% 0, ${100 - (100 - bottom) / 2}% 100%, ${(100 - bottom) / 2}% 100%)`;
        return (
          <div
            key={s.stage + i}
            className="w-full relative"
            style={{ height: `${100 / n}%`, minHeight: 30 }}
            title={`${s.stage}: ${s.count}`}
          >
            <div
              className="absolute inset-0 flex items-center justify-center px-4"
              style={{ background: color, clipPath: clip }}
            >
              <div className="flex items-center gap-2 min-w-0 text-white">
                <span className="truncate text-[12px] font-semibold drop-shadow-sm">{s.stage}</span>
                <span className="shrink-0 text-[11px] font-bold bg-white/25 rounded-md px-1.5 py-0.5">
                  {s.count}
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PieBig({ data }: { data: { name: string; value: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="82%" paddingAngle={2} stroke="hsl(var(--card))" strokeWidth={2}>
          {data.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
        </Pie>
        <Tooltip
          wrapperStyle={{ zIndex: 50, outline: "none" }}
          contentStyle={{ background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 10, fontSize: 12, boxShadow: "0 6px 20px -8px rgba(0,0,0,0.25)" }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

function ProgressBig({ value, label, Icon }: { value: number; label: string; Icon: LucideIcon }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="h-full flex flex-col justify-between p-3.5 sm:p-5 bg-card border border-border/60 rounded-2xl overflow-hidden shadow-sm">
      <Header title={label} Icon={Icon} />
      <div className="flex-1 flex flex-col justify-center min-w-0">
        <div className="flex items-baseline gap-1">
          <div
            className="font-bold leading-none tracking-tight text-primary"
            style={{ fontSize: "clamp(1.3rem, 2.6vw, 2.375rem)" }}
          >
            {pct.toFixed(1)}
          </div>
          <div className="text-primary/70 font-semibold text-lg">%</div>
        </div>
      </div>
      <div className="mt-3 h-1.5 rounded-full bg-muted overflow-hidden">
        <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>
      <div className="text-[11px] text-muted-foreground mt-2">no período</div>
    </div>
  );
}

function fmtDur(min: number) {
  if (min <= 0) return "0m";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

const ATENDIMENTO_WIDGETS: WidgetMeta[] = [
  {
    id: "kpi_conv_total",
    title: "Total de conversas",
    description: "Conversas com mensagens no período.",
    category: "Conversas",
    icon: Inbox,
    defaultChart: "kpi",
    supportedCharts: ["kpi"],
    render: ({ metrics, range }) => (
      <KpiBig label="Total de conversas" value={fmtNum(metrics.convTotal)} delta={<Delta value={0} />} range={range} color="primary" Icon={Inbox} />
    ),
  },
  {
    id: "kpi_conv_aguardando",
    title: "Aguardando",
    description: "Conversas em que o lead falou por último.",
    category: "Conversas",
    icon: Hourglass,
    defaultChart: "kpi",
    supportedCharts: ["kpi"],
    render: ({ metrics, range }) => (
      <KpiBig label="Aguardando" value={fmtNum(metrics.convAguardando)} delta={<Delta value={0} />} range={range} color="amber" Icon={Hourglass} />
    ),
  },
  {
    id: "kpi_conv_em_atendimento",
    title: "Em atendimento",
    description: "Conversas ativas nas últimas 24h já respondidas.",
    category: "Conversas",
    icon: Headphones,
    defaultChart: "kpi",
    supportedCharts: ["kpi"],
    render: ({ metrics, range }) => (
      <KpiBig label="Em atendimento" value={fmtNum(metrics.convEmAtendimento)} delta={<Delta value={0} />} range={range} color="cyan" Icon={Headphones} />
    ),
  },
  {
    id: "kpi_conv_finalizados",
    title: "Finalizados",
    description: "Conversas respondidas e sem atividade há mais de 24h.",
    category: "Conversas",
    icon: CheckCircle2,
    defaultChart: "kpi",
    supportedCharts: ["kpi"],
    render: ({ metrics, range }) => (
      <KpiBig label="Finalizados" value={fmtNum(metrics.convFinalizados)} delta={<Delta value={0} />} range={range} color="emerald" Icon={CheckCircle2} />
    ),
  },
  {
    id: "kpi_atendentes_online",
    title: "Atendentes online",
    description: "Membros que responderam nos últimos 30 minutos.",
    category: "Conversas",
    icon: UserCheck,
    defaultChart: "kpi",
    supportedCharts: ["kpi"],
    render: ({ metrics, range }) => (
      <KpiBig
        label="Atendentes online"
        value={`${fmtNum(metrics.atendentesOnline)} / ${fmtNum(metrics.atendentesTotal)}`}
        delta={<span className="text-[11px] text-muted-foreground">equipe</span>}
        range={range}
        color="primary"
        Icon={UserCheck}
      />
    ),
  },
  {
    id: "kpi_tempo_espera",
    title: "Tempo médio de espera",
    description: "Tempo até a primeira resposta ao lead.",
    category: "Conversas",
    icon: Timer,
    defaultChart: "kpi",
    supportedCharts: ["kpi"],
    render: ({ metrics, range }) => (
      <KpiBig label="Tempo médio de espera" value={fmtDur(metrics.tempoEsperaMin)} delta={<Delta value={0} />} range={range} color="amber" Icon={Timer} />
    ),
  },
  {
    id: "kpi_tempo_atendimento",
    title: "Tempo médio de atendimento",
    description: "Duração média das conversas no período.",
    category: "Conversas",
    icon: Clock,
    defaultChart: "kpi",
    supportedCharts: ["kpi"],
    render: ({ metrics, range }) => (
      <KpiBig label="Tempo médio de atendimento" value={fmtDur(metrics.tempoAtendimentoMin)} delta={<Delta value={0} />} range={range} color="cyan" Icon={Clock} />
    ),
  },
  {
    id: "kpi_loss_value",
    title: "Valor Perdido",
    description: "Total em negociações perdidas no período.",
    category: "Vendas",
    icon: UserX,
    defaultChart: "kpi",
    supportedCharts: ["kpi"],
    render: ({ metrics, range }) => (
      <KpiBig label="Valor Perdido" value={fmtBRLCompact(metrics.lossValueCents / 100)} delta={<Delta value={0} />} range={range} color="amber" Icon={UserX} />
    ),
  },
  {
    id: "kpi_ai_handled",
    title: "IA: Atendimentos",
    description: "Conversas gerenciadas pela IA no período.",
    category: "Conversas",
    icon: Bot,
    defaultChart: "kpi",
    supportedCharts: ["kpi"],
    render: ({ metrics, range }) => (
      <KpiBig label="IA: Atendimentos" value={fmtNum(metrics.aiHandledCount)} delta={<Delta value={0} />} range={range} color="primary" Icon={Bot} />
    ),
  },
  {
    id: "kpi_ai_qualified",
    title: "IA: Qualificados",
    description: "Leads que a IA qualificou com sucesso.",
    category: "Leads",
    icon: Target,
    defaultChart: "kpi",
    supportedCharts: ["kpi"],
    render: ({ metrics, range }) => (
      <KpiBig label="IA: Qualificados" value={fmtNum(metrics.aiQualifiedCount)} delta={<Delta value={0} />} range={range} color="emerald" Icon={Target} />
    ),
  },
  {
    id: "kpi_ai_handoff",
    title: "IA: Handoffs",
    description: "Transferências da IA para humanos.",
    category: "Conversas",
    icon: Headphones,
    defaultChart: "kpi",
    supportedCharts: ["kpi"],
    render: ({ metrics, range }) => (
      <KpiBig label="IA: Handoffs" value={fmtNum(metrics.aiHandoffCount)} delta={<Delta value={0} />} range={range} color="cyan" Icon={Headphones} />
    ),
  },
];

export const WIDGETS_V2: WidgetMeta[] = [
  {
    id: "kpi_revenue_won",
    title: "Receita ganha",
    description: "Total de vendas fechadas no período.",
    category: "Vendas",
    icon: DollarSign,
    defaultChart: "kpi",
    supportedCharts: ["kpi", "area"],
    render: ({ chart, size, metrics, range }) => {
      if (size === 2 && (chart === "area" || chart === "kpi")) {
        return <ChartCard label="Receita ganha" Icon={DollarSign}><AreaBig data={metrics.revenueSeries} /></ChartCard>;
      }
      return <KpiBig label="Receita ganha" value={fmtBRLCompact(metrics.revenueWon)} delta={<Delta value={metrics.revenueDelta} />} range={range} color="emerald" Icon={DollarSign} />;
    },
  },
  {
    id: "kpi_general_goal",
    title: "Meta Geral",
    description: "Progresso em relação à meta geral do mês.",
    category: "Vendas",
    icon: Trophy,
    defaultChart: "progress",
    supportedCharts: ["progress", "kpi"],
    render: ({ chart, metrics, range }) => {
      const value = metrics.generalGoalCents > 0 ? (metrics.totalRevenueCents / metrics.generalGoalCents) * 100 : 0;
      if (chart === "kpi") {
        return <KpiBig label="Meta Geral" value={fmtBRLCompact(metrics.generalGoalCents)} delta={<Delta value={value - 100} suffix="%" />} range={range} color="primary" Icon={Trophy} />;
      }
      return <ProgressBig value={value} label="Meta Geral" Icon={Trophy} />;
    },
  },

  {
    id: "kpi_new_leads",
    title: "Novos leads",
    description: "Leads captados no período.",
    category: "Leads",
    icon: Users,
    defaultChart: "kpi",
    supportedCharts: ["kpi"],

    render: ({ metrics, range }) => (
      <KpiBig label="Novos leads" value={fmtNum(metrics.newLeads)} delta={<Delta value={metrics.leadsDelta} />} range={range} color="cyan" Icon={Users} />
    ),
  },
  {
    id: "kpi_conversion",
    title: "Taxa de conversão",
    description: "Percentual de leads que fecham.",
    category: "Vendas",
    icon: Target,
    defaultChart: "progress",
    supportedCharts: ["progress", "kpi"],
    render: ({ chart, metrics, range }) => {
      if (chart === "kpi") {
        return <KpiBig label="Conversão" value={`${metrics.conversionRate}%`} delta={<span className="text-[11px] text-muted-foreground">vendas / leads do período</span>} range={range} color="amber" Icon={Target} />;
      }
      return <ProgressBig value={metrics.conversionRate} label="Conversão" Icon={Target} />;
    },
  },
  {
    id: "kpi_pipeline",
    title: "Pipeline",
    description: "Valor total em negociação.",
    category: "Vendas",
    icon: Wallet,
    defaultChart: "kpi",
    supportedCharts: ["kpi"],
    render: ({ metrics, range }) => (
      <KpiBig label="Pipeline" value={fmtBRLCompact(metrics.pipelineValue)} delta={<span className="text-[11px] text-muted-foreground">em aberto</span>} range={range} color="cyan" Icon={Wallet} />
    ),

  },
  {
    id: "chart_revenue",
    title: "Receita por dia",
    description: "Série temporal de receita.",
    category: "Vendas",
    icon: Activity,
    defaultChart: "area",
    supportedCharts: ["area", "bar"],
    render: ({ chart, metrics }) => (
      <ChartCard label="Receita" Icon={Activity}>
        {chart === "bar"
          ? <BarBig data={metrics.revenueSeries.map(d => ({ stage: d.date, count: d.value }))} />
          : <AreaBig data={metrics.revenueSeries} />}
      </ChartCard>
    ),
  },
  {
    id: "chart_funnel",
    title: "Funil de vendas",
    description: "Distribuição por estágio do CRM.",
    category: "Vendas",
    icon: Filter,
    defaultChart: "funnel",
    supportedCharts: ["funnel", "bar", "pie"],
    render: ({ chart, metrics }) => (
      <ChartCard label="Funil" Icon={Filter}>
        {chart === "pie"
          ? <PieBig data={metrics.funnelStages.map(f => ({ name: f.stage, value: f.count }))} />
          : chart === "bar"
          ? <BarBig data={metrics.funnelStages} />
          : <FunnelBig data={metrics.funnelStages} />}
      </ChartCard>
    ),
  },
  {
    id: "chart_channels",
    title: "Conversas por canal",
    description: "Distribuição das conversas por canal (WhatsApp, Instagram, Messenger, Telegram).",

    category: "Conversas",
    icon: MessageSquare,
    defaultChart: "pie",
    supportedCharts: ["pie", "bar"],
    render: ({ chart, metrics }) => (
      <ChartCard label="Canais" Icon={MessageSquare}>
        {chart === "bar"
          ? <BarBig data={metrics.channelsBreakdown.map(s => ({ stage: s.name, count: s.value }))} />
          : <PieBig data={metrics.channelsBreakdown} />}
      </ChartCard>
    ),
  },
  {
    id: "chart_leads_canal",
    title: "Leads por canal",
    description: "Novos leads criados no período, separados por canal de origem.",
    category: "Leads",
    icon: Users,
    defaultChart: "pie",
    supportedCharts: ["pie", "bar"],
    render: ({ chart, metrics }) => (
      <ChartCard label="Leads por canal" Icon={Users}>
        {chart === "bar"
          ? <BarBig data={metrics.leadsByChannel.map(s => ({ stage: s.name, count: s.value }))} />
          : <PieBig data={metrics.leadsByChannel} />}
      </ChartCard>
    ),
  },
  {

    id: "chart_sources",
    title: "Origem dos leads",
    description: "De onde vêm seus leads.",
    category: "Marketing",
    icon: PieIcon,
    defaultChart: "pie",
    supportedCharts: ["pie", "bar"],
    render: ({ chart, metrics }) => (
      <ChartCard label="Origens" Icon={PieIcon}>
        {chart === "bar"
          ? <BarBig data={metrics.sourcesBreakdown.map(s => ({ stage: s.name, count: s.value }))} />
          : <PieBig data={metrics.sourcesBreakdown} />}
      </ChartCard>
    ),
  },
  {
    id: "kpi_unread",
    title: "Mensagens não lidas",
    description: "Conversas aguardando resposta.",
    category: "Conversas",
    icon: MessageSquare,
    defaultChart: "kpi",
    supportedCharts: ["kpi"],
    render: ({ metrics, range }) => (
      <KpiBig label="Não lidas" value={fmtNum(metrics.unreadMessages)} delta={<span className="text-[11px] text-muted-foreground">aguardando resposta</span>} range={range} color="amber" Icon={MessageSquare} />
    ),

  },
  {
    id: "kpi_followups",
    title: "Follow-ups pendentes",
    description: "Contatos aguardando retorno.",
    category: "Tarefas",
    icon: ClipboardList,
    defaultChart: "kpi",
    supportedCharts: ["kpi"],
    render: ({ metrics, range }) => (
      <KpiBig label="Follow-ups" value={fmtNum(metrics.pendingFollowups)} delta={<span className="text-[11px] text-muted-foreground">réguas ativas</span>} range={range} color="amber" Icon={ClipboardList} />
    ),
  },
  {
    id: "kpi_sales_count",
    title: "Vendas fechadas",
    description: "Quantidade de vendas registradas no Comercial.",
    category: "Vendas",
    icon: Receipt,
    defaultChart: "kpi",
    supportedCharts: ["kpi"],
    render: ({ metrics, range }) => (
      <KpiBig label="Vendas" value={fmtNum(metrics.salesCount)} delta={<Delta value={0} />} range={range} color="emerald" Icon={Receipt} />
    ),
  },
  {
    id: "kpi_avg_ticket",
    title: "Ticket médio",
    description: "Valor médio por venda no período.",
    category: "Vendas",
    icon: TrendingUp,
    defaultChart: "kpi",
    supportedCharts: ["kpi"],
    render: ({ metrics, range }) => (
      <KpiBig label="Ticket médio" value={fmtBRLCompact(metrics.avgTicket)} delta={<Delta value={0} />} range={range} color="primary" Icon={TrendingUp} />
    ),
  },
  {
    id: "kpi_losses",
    title: "Vendas perdidas",
    description: "Cards movidos para a coluna de Perda.",
    category: "Vendas",
    icon: XCircle,
    defaultChart: "kpi",
    supportedCharts: ["kpi"],
    render: ({ metrics, range }) => (
      <KpiBig label="Perdas" value={fmtNum(metrics.lossCount)} delta={<Delta value={0} />} range={range} color="amber" Icon={XCircle} />
    ),
  },
  {
    id: "kpi_scheduled",
    title: "Compromissos agendados",
    description: "Reuniões e visitas futuras no período.",
    category: "Agendamentos",
    icon: CalendarClock,
    defaultChart: "kpi",
    supportedCharts: ["kpi"],
    render: ({ metrics, range }) => (
      <KpiBig label="Agendados" value={fmtNum(metrics.scheduledCount)} delta={<Delta value={0} />} range={range} color="cyan" Icon={CalendarClock} />
    ),
  },
  {
    id: "kpi_unassigned",
    title: "Leads sem responsável",
    description: "Leads ainda não atribuídos a um atendente.",
    category: "Leads",
    icon: UserX,
    defaultChart: "kpi",
    supportedCharts: ["kpi"],
    render: ({ metrics, range }) => (
      <KpiBig label="Sem responsável" value={fmtNum(metrics.unassignedLeads)} delta={<Delta value={0} />} range={range} color="amber" Icon={UserX} />
    ),
  },
  {
    id: "chart_ranking",
    title: "Ranking do time",
    description: "Top performers do período.",
    category: "Vendas",
    icon: Trophy,
    defaultChart: "bar",
    supportedCharts: ["bar"],
    render: ({ metrics }) => (
      <ChartCard label="Ranking do time" Icon={Trophy}>
        <div className="space-y-4">
          {/* Top 3 Podium */}
          {metrics.ranking.length > 0 && (
            <div className="flex items-end justify-center gap-2 sm:gap-4 px-2 pt-8 pb-4 border-b border-[color:var(--hairline)]">
              {/* 2nd Place */}
              {metrics.ranking[1] && (
                <div className="flex flex-1 flex-col items-center">
                  <div className="relative mb-2">
                    <InitialsAvatar 
                      name={metrics.ranking[1].name} 
                      src={metrics.ranking[1].avatar_url} 
                      className="h-10 w-10 sm:h-12 sm:w-12 border-2 border-[#8b93a1]" 
                    />
                    <div className="absolute -bottom-1 -right-1 size-5 rounded-full bg-[#8b93a1] text-white text-[10px] font-bold grid place-items-center border-2 border-[color:var(--panel)]">2º</div>
                  </div>
                  <div className="text-[11px] font-bold truncate max-w-[80px]">{metrics.ranking[1].name}</div>
                  <div className="text-[10px] text-muted-foreground">{metrics.ranking[1].value} vendas</div>
                </div>
              )}
              
              {/* 1st Place */}
              {metrics.ranking[0] && (
                <div className="flex flex-1 flex-col items-center pb-2">
                  <div className="relative mb-3">
                    <InitialsAvatar 
                      name={metrics.ranking[0].name} 
                      src={metrics.ranking[0].avatar_url} 
                      className="h-14 w-14 sm:h-16 sm:w-16 border-2 border-[#e0a800]" 
                    />
                    <div className="absolute -bottom-1 -right-1 size-6 rounded-full bg-[#e0a800] text-white text-[11px] font-bold grid place-items-center border-2 border-[color:var(--panel)]">1º</div>
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 text-[#e0a800]">
                      <Crown className="size-5" />
                    </div>
                  </div>
                  <div className="text-[13px] font-extrabold truncate max-w-[100px] text-primary">{metrics.ranking[0].name}</div>
                  <div className="text-[11px] font-bold text-muted-foreground">{metrics.ranking[0].value} vendas</div>
                </div>
              )}

              {/* 3rd Place */}
              {metrics.ranking[2] && (
                <div className="flex flex-1 flex-col items-center">
                  <div className="relative mb-2">
                    <InitialsAvatar 
                      name={metrics.ranking[2].name} 
                      src={metrics.ranking[2].avatar_url} 
                      className="h-10 w-10 sm:h-12 sm:w-12 border-2 border-[#a86b3d]" 
                    />
                    <div className="absolute -bottom-1 -right-1 size-5 rounded-full bg-[#a86b3d] text-white text-[10px] font-bold grid place-items-center border-2 border-[color:var(--panel)]">3º</div>
                  </div>
                  <div className="text-[11px] font-bold truncate max-w-[80px]">{metrics.ranking[2].name}</div>
                  <div className="text-[10px] text-muted-foreground">{metrics.ranking[2].value} vendas</div>
                </div>
              )}
            </div>
          )}

          {/* List for others or all */}
          <div className="divide-y divide-[color:var(--hairline)] max-h-[160px] overflow-auto pr-1 custom-scrollbar">
            {metrics.ranking.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground">Sem dados de vendas no período.</div>
            ) : (
              metrics.ranking.map((r, i) => (
                <div key={i} className="flex items-center gap-3 py-2 px-1 hover:bg-[color:var(--panel-2)] transition-colors rounded-lg group">
                  <div className="w-4 text-[10px] font-bold text-muted-foreground">{i + 1}º</div>
                  <InitialsAvatar name={r.name} src={r.avatar_url} className="h-7 w-7 text-[10px]" />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold truncate group-hover:text-primary transition-colors">{r.name}</div>
                    <div className="text-[10px] text-muted-foreground">{r.value} vendas</div>
                  </div>
                  <div className="text-xs font-bold tabular-nums text-primary">{r.value}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </ChartCard>
    ),
  },
  {
    id: "chart_leads_per_user",
    title: "Monitoramento do time",
    description: "Leads em atendimento em tempo real por usuário.",
    category: "Leads",
    icon: Users,
    defaultChart: "bar",
    supportedCharts: ["bar"],
    render: ({ metrics }) => (
      <ChartCard label="Leads por Atendente" Icon={Users}>
        <div className="space-y-4">
          <div className="divide-y divide-[color:var(--hairline)] max-h-[220px] overflow-auto pr-1 custom-scrollbar">
            {metrics.leadsPerUser.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground">Nenhum lead em atendimento no momento.</div>
            ) : (
              metrics.leadsPerUser.map((r, i) => (
                <div key={i} className="flex items-center gap-3 py-2 px-1 hover:bg-[color:var(--panel-2)] transition-colors rounded-lg group">
                  <div className="w-4 text-[10px] font-bold text-muted-foreground">{i + 1}º</div>
                  <InitialsAvatar name={r.name} src={r.avatar_url} className="h-7 w-7 text-[10px]" />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold truncate group-hover:text-primary transition-colors">{r.name}</div>
                    <div className="text-[10px] text-muted-foreground">Em atendimento</div>
                  </div>
                  <div className="text-xs font-bold tabular-nums text-primary">{r.value} <span className="text-[9px] font-normal text-muted-foreground">leads</span></div>
                </div>
              ))
            )}
          </div>
        </div>
      </ChartCard>
    ),
  },
  {
    id: "kpi_csat_score",
    title: "Satisfação (CSAT)",
    description: "Nota média das pesquisas respondidas.",
    category: "Satisfação",
    icon: Star,
    defaultChart: "kpi",
    supportedCharts: ["kpi"],
    render: ({ metrics, range }) => (
      <KpiBig
        label="CSAT médio"
        value={metrics.csatCount > 0 ? `${metrics.csatAvg.toFixed(1)} / 5` : "—"}
        delta={<span className="text-[11px] text-muted-foreground">{metrics.csatCount} resp.</span>}
        range={range}
        color="emerald"
        Icon={Star}
      />
    ),
  },
  {
    id: "kpi_csat_response_rate",
    title: "Taxa de resposta CSAT",
    description: "Percentual de pesquisas respondidas.",
    category: "Satisfação",
    icon: Smile,
    defaultChart: "progress",
    supportedCharts: ["progress", "kpi"],
    render: ({ chart, metrics, range }) => {
      if (chart === "kpi") {
        return <KpiBig label="Resposta CSAT" value={`${metrics.csatResponseRate}%`} delta={<span className="text-[11px] text-muted-foreground">{metrics.csatCount}/{metrics.csatSent}</span>} range={range} color="cyan" Icon={Smile} />;
      }
      return <ProgressBig value={metrics.csatResponseRate} label="Resposta CSAT" Icon={Smile} />;
    },
  },
  {
    id: "chart_csat_breakdown",
    title: "Distribuição CSAT",
    description: "Promotores, neutros e detratores.",
    category: "Satisfação",
    icon: PieIcon,
    defaultChart: "pie",
    supportedCharts: ["pie", "bar"],
    render: ({ chart, metrics }) => {
      const data = [
        { name: "Promotores (5)", value: metrics.csatPromoters },
        { name: "Neutros (4)", value: metrics.csatNeutrals },
        { name: "Detratores (1-3)", value: metrics.csatDetractors },
      ];
      return (
        <ChartCard label="CSAT — distribuição" Icon={PieIcon}>
          {chart === "bar"
            ? <BarBig data={data.map(d => ({ stage: d.name, count: d.value }))} />
            : <PieBig data={data} />}
        </ChartCard>
      );
    },
  },
  {
    id: "chart_sales_by_item",
    title: "Vendas por Item",
    description: "Distribuição de receita por produto ou serviço.",
    category: "Vendas",
    icon: PieIcon,
    defaultChart: "pie",
    supportedCharts: ["pie", "bar"],
    render: ({ chart, metrics }) => (
      <ChartCard label="Vendas por Item" Icon={PieIcon}>
        {chart === "bar"
          ? <BarBig data={metrics.salesByItem.map(s => ({ stage: s.name, count: s.value }))} />
          : <PieBig data={metrics.salesByItem} />}
      </ChartCard>
    ),
  },
  ...ATENDIMENTO_WIDGETS,
  ...OPS_WIDGETS,
  ...TEAM_WIDGETS,
];


export function getWidget(id: string): WidgetMeta | undefined {
  return WIDGETS_V2.find((w) => w.id === id);
}
