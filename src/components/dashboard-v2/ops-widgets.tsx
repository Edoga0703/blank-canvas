import type React from "react";
import type { LucideIcon } from "lucide-react";
import {
  Inbox, Timer, Clock, Users, Building2, UserX, Shuffle, AlarmClock,
  CalendarClock, PauseCircle, Layers, Activity, Hourglass, FileClock,
  Landmark, CheckCircle2, RotateCcw, Smile, UserMinus, ListChecks,
} from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
  Cell, Pie, PieChart,
} from "recharts";
import { useOpsMetrics } from "./ops-data";
import type { OpsCard } from "@/lib/dashboard-ops.functions";
import type { Range } from "./widget-data";
import type { WidgetMeta } from "./widgets-registry";

/* ---------- blocos visuais ---------- */

function Shell({ title, Icon, children, footer }: { title: string; Icon: LucideIcon; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
     <div className="h-full flex flex-col p-3.5 sm:p-5 bg-card border border-border rounded-2xl min-h-0 shadow-sm">
      <div className="flex items-start justify-between gap-1.5 mb-1">
         <div className="text-[11px] uppercase text-foreground/75 font-bold leading-tight break-words min-w-0 flex-1">
          {title}
        </div>
        <Icon className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0 mt-0.5" />
      </div>
      <div className="flex-1 min-h-0 flex flex-col justify-center">{children}</div>
      {footer ? <div className="text-[11px] text-muted-foreground mt-2 truncate">{footer}</div> : null}
    </div>
  );
}

function Num({ value, tone = "primary" }: { value: string; tone?: "primary" | "amber" | "emerald" | "red" }) {
  const cls = {
    primary: "text-primary",
    amber: "text-amber-500 dark:text-amber-400",
    emerald: "text-emerald-500 dark:text-emerald-400",
    red: "text-red-500 dark:text-red-400",
  }[tone];
  return (
    <div className={`font-bold leading-none tracking-tight ${cls}`} style={{ fontSize: "clamp(1.3rem, 2.6vw, 2.375rem)" }}>
      {value}
    </div>
  );
}

function Empty({ text = "Sem dados no período." }: { text?: string }) {
  return <div className="py-6 text-center text-xs text-muted-foreground">{text}</div>;
}

function BarList({ data, suffix = "" }: { data: { name: string; value: number }[]; suffix?: string }) {
  if (!data.length) return <Empty />;
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="space-y-1.5 overflow-auto pr-1 custom-scrollbar max-h-full">
      {data.map((d) => (
        <div key={d.name} className="space-y-0.5">
          <div className="flex items-center justify-between gap-2 text-[11px]">
            <span className="truncate">{d.name}</span>
            <span className="font-semibold tabular-nums shrink-0">{d.value}{suffix}</span>
          </div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div className="h-full rounded-full bg-primary" style={{ width: `${(d.value / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

const DEPARTMENT_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-5)",
  "var(--chart-3)",
  "var(--chart-4)",
];

function DepartmentRadial({ data }: { data: { name: string; value: number }[] }) {
  const shown = data.filter((item) => item.value > 0);
  const total = shown.reduce((sum, item) => sum + item.value, 0);
  if (!total) return <Empty text="Nenhum atendimento aberto por departamento." />;

  return (
    <div className="grid h-full min-h-0 grid-cols-[minmax(150px,0.9fr)_minmax(180px,1.1fr)] items-center gap-4 max-sm:grid-cols-1 max-sm:gap-2">
      <div className="relative min-h-0 h-full max-h-[230px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={shown}
              dataKey="value"
              nameKey="name"
              innerRadius="63%"
              outerRadius="88%"
              paddingAngle={3}
              cornerRadius={7}
              stroke="var(--card)"
              strokeWidth={3}
            >
              {shown.map((item, index) => (
                <Cell
                  key={item.name}
                  fill={item.name === "Sem setor" ? "var(--muted-foreground)" : DEPARTMENT_COLORS[index % DEPARTMENT_COLORS.length]}
                />
              ))}
            </Pie>
            <Tooltip
              formatter={(value) => [`${Number(value)} atendimentos`, "Volume"]}
              contentStyle={{
                background: "var(--popover)",
                color: "var(--popover-foreground)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                fontSize: 12,
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 grid place-content-center text-center">
          <strong className="text-3xl font-bold leading-none tabular-nums text-foreground">{total}</strong>
          <span className="mt-1 text-[10px] uppercase text-muted-foreground">em aberto</span>
        </div>
      </div>

      <div className="min-h-0 space-y-2 overflow-auto pr-1 custom-scrollbar">
        {shown.map((item, index) => {
          const percentage = Math.round((item.value / total) * 100);
          const color = item.name === "Sem setor" ? "var(--muted-foreground)" : DEPARTMENT_COLORS[index % DEPARTMENT_COLORS.length];
          return (
            <div key={item.name} className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
                <span className="min-w-0 flex-1 truncate text-xs font-medium">{item.name}</span>
                <strong className="text-sm tabular-nums">{item.value}</strong>
                <span className="w-8 text-right text-[10px] tabular-nums text-muted-foreground">{percentage}%</span>
              </div>
              <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full" style={{ width: `${percentage}%`, backgroundColor: color }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CardList({ items, emptyText }: { items: OpsCard[]; emptyText?: string }) {
  if (!items.length) return <Empty text={emptyText ?? "Nada por aqui. 🎉"} />;
  return (
    <div className="divide-y divide-[color:var(--hairline)] overflow-auto pr-1 custom-scrollbar max-h-full">
      {items.map((c) => (
        <a key={c.id} href={`/app/conversas?numero=${encodeURIComponent(c.numero)}`} className="flex items-center gap-2 py-1.5 hover:bg-muted/50 rounded-md px-1 transition-colors">
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium truncate">{c.nome}</div>
            <div className="text-[10px] text-muted-foreground truncate">
              {c.etapa}{c.setor ? ` · ${c.setor}` : ""}{c.responsavel ? ` · ${c.responsavel}` : " · sem responsável"}
            </div>
          </div>
          <div className={`text-[11px] font-semibold tabular-nums shrink-0 ${c.atrasado ? "text-red-500" : "text-muted-foreground"}`}>
            {c.horas < 48 ? `${c.horas}h` : `${Math.round(c.horas / 24)}d`}
          </div>
        </a>
      ))}
    </div>
  );
}

function fmtDur(min: number) {
  if (!min) return "—";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h ${m}min` : `${h}h`;
}

/* ---------- widgets ---------- */

function W({ range, children }: { range: Range; children: (m: ReturnType<typeof useOpsMetrics>) => React.ReactElement }) {
  const m = useOpsMetrics(range);
  return children(m);
}

function make(
  id: string,
  title: string,
  description: string,
  icon: LucideIcon,
  defaultChart: WidgetMeta["defaultChart"],
  render: (m: ReturnType<typeof useOpsMetrics>, range: Range) => React.ReactElement,
): WidgetMeta {
  return {
    id,
    title,
    description,
    category: "Atendimento & Operação",
    icon,
    defaultChart,
    supportedCharts: [defaultChart],
    render: ({ range }) => <W range={range}>{(m) => render(m, range)}</W>,
  };
}

export const OPS_WIDGETS: WidgetMeta[] = [
  /* ----- Fila e triagem ----- */
  make("ops_fila_triagem", "Fila de triagem", "Demandas na entrada sem setor ou responsável.", Inbox, "kpi", ({ data }) => (
    <Shell title="Fila de triagem" Icon={Inbox} footer={data.filaTriagem ? `Mais antiga: ${data.filaTriagemMaisAntigaHoras}h esperando` : "Fila vazia"}>
      <Num value={String(data.filaTriagem)} tone={data.filaTriagem > 0 ? "amber" : "emerald"} />
    </Shell>
  )),
  make("ops_fila_lista", "Fila de triagem (lista)", "Demandas aguardando encaminhamento, da mais antiga.", Inbox, "bar", ({ data }) => (
    <Shell title="Aguardando triagem" Icon={Inbox}><CardList items={data.filaLista} /></Shell>
  )),
  make("ops_tempo_triagem", "Tempo médio de triagem", "Da entrada até o encaminhamento ao setor.", Timer, "kpi", ({ data }) => (
    <Shell title="Tempo médio de triagem" Icon={Timer} footer="da entrada ao encaminhamento">
      <Num value={fmtDur(data.tempoTriagemMin)} />
    </Shell>
  )),
  make("ops_pico_entrada", "Pico de entrada", "Volume de novas demandas por hora do dia.", Activity, "bar", ({ data }) => (
    <Shell title="Entradas por hora" Icon={Activity}>
      {data.entradaPorHora.length === 0 ? <Empty /> : (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data.entradaPorHora} margin={{ top: 8, right: 6, left: -22, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.25} />
            <XAxis dataKey="name" tick={{ fontSize: 9 }} interval={2} />
            <YAxis tick={{ fontSize: 9 }} allowDecimals={false} />
            <Tooltip />
            <Bar dataKey="value" fill="#0b22fe" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </Shell>
  )),
  make("ops_entrada_dia", "Entradas por dia da semana", "Distribuição das demandas ao longo da semana.", CalendarClock, "bar", ({ data }) => (
    <Shell title="Entradas por dia da semana" Icon={CalendarClock}><BarList data={data.entradaPorDiaSemana} /></Shell>
  )),
  make("ops_primeira_resposta", "Primeira resposta humana", "Tempo médio até um atendente responder.", Clock, "kpi", ({ data }) => (
    <Shell title="Primeira resposta" Icon={Clock} footer="média do período (sem contar a IA)">
      <Num value={fmtDur(data.primeiraRespostaMin)} />
    </Shell>
  )),

  /* ----- Carga e prazos ----- */
  make("ops_por_setor", "Demandas por setor", "Demandas abertas em cada setor.", Building2, "bar", ({ data }) => (
    <Shell title="Demandas abertas por setor" Icon={Building2}><BarList data={data.porSetor} /></Shell>
  )),
  make("ops_atendimentos_departamento", "Atendimentos por departamento", "Atendimentos ativos (movimentação nas últimas 48h) por departamento.", Building2, "pie", ({ data }) => (
    <Shell
      title="Atendimentos ativos por departamento"
      Icon={Building2}
      footer={data.ativosPorSetor.length ? `Maior volume: ${data.ativosPorSetor[0]?.name} · últimas 48h` : "sem atendimentos ativos nas últimas 48h"}
    >
      <DepartmentRadial data={data.ativosPorSetor} />
    </Shell>
  )),
  make("ops_carga_atendente", "Carga por atendente", "Demandas em aberto por pessoa.", Users, "bar", ({ data }) => (
    <Shell title="Carga por atendente" Icon={Users}><BarList data={data.porAtendente} /></Shell>
  )),
  make("ops_sem_responsavel_setor", "Sem responsável por setor", "Demandas sem atendente definido, por setor.", UserX, "bar", ({ data }) => (
    <Shell title="Sem responsável por setor" Icon={UserX}><BarList data={data.semResponsavelPorSetor} /></Shell>
  )),
  make("ops_reencaminhamentos", "Reencaminhamentos", "Demandas que trocaram de setor no período.", Shuffle, "kpi", ({ data }) => (
    <Shell title="Reencaminhamentos" Icon={Shuffle} footer="trocas de setor no período">
      <Num value={String(data.reencaminhamentos)} tone="amber" />
    </Shell>
  )),
  make("ops_prazo", "No prazo x atrasadas", "Situação das demandas em relação ao prazo da etapa.", AlarmClock, "bar", ({ data }) => (
    <Shell title="No prazo x atrasadas" Icon={AlarmClock} footer={data.semPrazo ? `${data.semPrazo} sem prazo configurado` : undefined}>
      {data.noPrazo + data.atrasadas === 0 ? <Empty text="Nenhuma etapa com prazo configurado." /> : (
        <BarList data={[{ name: "No prazo", value: data.noPrazo }, { name: "Atrasadas", value: data.atrasadas }]} />
      )}
    </Shell>
  )),
  make("ops_vence_24h", "Vencendo em 24h", "Demandas que vencem hoje ou nas próximas 24 horas.", Hourglass, "kpi", ({ data }) => (
    <Shell title="Vencendo em 24h" Icon={Hourglass} footer={`${data.venceHoje} vencem hoje`}>
      <Num value={String(data.vence24h)} tone={data.vence24h > 0 ? "amber" : "emerald"} />
    </Shell>
  )),
  make("ops_paradas", "Paradas há 3+ dias", "Demandas sem movimentação.", PauseCircle, "bar", ({ data }) => (
    <Shell title="Sem movimentação" Icon={PauseCircle}><CardList items={data.paradas} emptyText="Tudo em movimento. 🎉" /></Shell>
  )),
  make("ops_envelhecimento", "Envelhecimento do backlog", "Demandas abertas por faixa de idade.", Layers, "bar", ({ data }) => (
    <Shell title="Envelhecimento do backlog" Icon={Layers}><BarList data={data.envelhecimento} /></Shell>
  )),

  /* ----- Fluxo e gargalos ----- */
  make("ops_entradas_concluidas", "Entradas x concluídas", "O backlog está crescendo ou diminuindo?", Activity, "line", ({ data }) => (
    <Shell title="Entradas x concluídas" Icon={Activity} footer={`${data.entradasTotal} entraram · ${data.concluidasTotal} concluídas`}>
      {data.entradasSerie.length === 0 ? <Empty /> : (
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data.entradasSerie} margin={{ top: 8, right: 6, left: -22, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.25} />
            <XAxis dataKey="date" tick={{ fontSize: 9 }} tickFormatter={(v: string) => v.slice(8)} />
            <YAxis tick={{ fontSize: 9 }} allowDecimals={false} />
            <Tooltip />
            <Line type="monotone" dataKey="entradas" stroke="#0b22fe" strokeWidth={2} dot={false} name="Entradas" />
            <Line type="monotone" dataKey="concluidas" stroke="#10b981" strokeWidth={2} dot={false} name="Concluídas" />
          </LineChart>
        </ResponsiveContainer>
      )}
    </Shell>
  )),
  make("ops_tempo_etapa", "Tempo médio por etapa", "Onde as demandas ficam mais tempo paradas.", Hourglass, "bar", ({ data }) => (
    <Shell title="Tempo médio por etapa (h)" Icon={Hourglass}><BarList data={data.tempoPorEtapa} suffix="h" /></Shell>
  )),
  make("ops_aguardando_cliente", "Aguardando cliente/documentos", "Demandas paradas esperando o cliente.", FileClock, "bar", ({ data }) => (
    <Shell title="Aguardando cliente / documentos" Icon={FileClock}><CardList items={data.aguardandoCliente} /></Shell>
  )),
  make("ops_aguardando_orgao", "Aguardando órgão", "Protocolos em exigência ou aguardando retorno do órgão.", Landmark, "bar", ({ data }) => (
    <Shell title="Aguardando órgão" Icon={Landmark}><CardList items={data.aguardandoOrgao} /></Shell>
  )),

  /* ----- Produtividade e qualidade ----- */
  make("ops_concluidas_atendente", "Concluídas por atendente", "Produtividade individual no período.", CheckCircle2, "bar", ({ data }) => (
    <Shell title="Concluídas por atendente" Icon={CheckCircle2}><BarList data={data.concluidasPorAtendente} /></Shell>
  )),
  make("ops_concluidas_setor", "Concluídas por setor", "Entregas de cada setor no período.", CheckCircle2, "bar", ({ data }) => (
    <Shell title="Concluídas por setor" Icon={CheckCircle2}><BarList data={data.concluidasPorSetor} /></Shell>
  )),
  make("ops_retrabalho", "Retrabalho", "Demandas que voltaram para uma etapa anterior.", RotateCcw, "kpi", ({ data }) => (
    <Shell title="Retrabalho" Icon={RotateCcw} footer="voltas de etapa no período">
      <Num value={String(data.retrabalho)} tone={data.retrabalho > 0 ? "amber" : "emerald"} />
    </Shell>
  )),
  make("ops_csat_setor", "CSAT por setor", "Nota média de satisfação em cada setor.", Smile, "bar", ({ data }) => (
    <Shell title="CSAT por setor" Icon={Smile}>
      <BarList data={data.csatPorSetor.map((c) => ({ name: `${c.name} (${c.respostas})`, value: c.value }))} />
    </Shell>
  )),
  make("ops_csat_atendente", "CSAT por atendente", "Nota média de satisfação por pessoa.", Smile, "bar", ({ data }) => (
    <Shell title="CSAT por atendente" Icon={Smile}>
      <BarList data={data.csatPorAtendente.map((c) => ({ name: `${c.name} (${c.respostas})`, value: c.value }))} />
    </Shell>
  )),
  make("ops_clientes_sem_demanda", "Clientes sem demanda no mês", "Clientes sem nenhuma movimentação neste mês.", UserMinus, "bar", ({ data }) => (
    <Shell title="Clientes sem demanda no mês" Icon={UserMinus}><CardList items={data.clientesSemDemanda} emptyText="Todos com movimentação." /></Shell>
  )),
  make("ops_rotinas_mes", "Rotinas do mês", "Demandas concluídas x abertas no mês corrente.", ListChecks, "progress", ({ data }) => {
    const pct = data.rotinasMes.total ? Math.round((data.rotinasMes.feitas / data.rotinasMes.total) * 100) : 0;
    return (
      <Shell title="Rotinas do mês" Icon={ListChecks} footer={`${data.rotinasMes.feitas} de ${data.rotinasMes.total} concluídas`}>
        <div className="space-y-2">
          <Num value={`${pct}%`} tone={pct >= 80 ? "emerald" : pct >= 50 ? "amber" : "red"} />
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </Shell>
    );
  }),
];
