import type React from "react";
import type { LucideIcon } from "lucide-react";
import { Trophy, Activity, Star, Ticket } from "lucide-react";
import { useTeamOps } from "./ops-data";
import type { Range } from "./widget-data";
import type { WidgetMeta } from "./widgets-registry";

function Shell({ title, Icon, children, footer }: { title: string; Icon: LucideIcon; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <div className="h-full flex flex-col p-3.5 sm:p-5 bg-card border border-border/60 rounded-2xl min-h-0 shadow-sm">
      <div className="flex items-start justify-between gap-1.5 mb-1.5">
        <div className="text-[10.5px] uppercase tracking-[0.1em] text-muted-foreground/80 font-semibold leading-tight break-words min-w-0 flex-1">
          {title}
        </div>
        <Icon className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0 mt-0.5" />
      </div>
      <div className="flex-1 min-h-0 overflow-auto pr-1 custom-scrollbar">{children}</div>
      {footer ? <div className="text-[11px] text-muted-foreground mt-2 truncate">{footer}</div> : null}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="py-6 text-center text-xs text-muted-foreground">{text}</div>;
}

function Inicial({ nome, avatar, size = 6 }: { nome: string; avatar?: string | null; size?: 6 | 8 }) {
  const cls = size === 8 ? "size-8" : "size-6";
  if (avatar) {
    return (
      <img
        src={avatar}
        alt={nome}
        loading="lazy"
        className={`${cls} shrink-0 rounded-full object-cover ring-1 ring-border`}
        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
      />
    );
  }
  return (
    <span className={`grid ${cls} shrink-0 place-items-center rounded-full bg-primary/10 text-[10px] font-bold text-primary`}>
      {nome.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}

function fmtMin(min: number | null) {
  if (min === null) return "sem atividade";
  if (min < 1) return "agora";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

const ESTADO = {
  online: { cor: "bg-emerald-500", label: "Online" },
  ativo: { cor: "bg-amber-500", label: "Ativo" },
  inativo: { cor: "bg-muted-foreground/40", label: "Sem atividade" },
} as const;

function make(
  id: string,
  title: string,
  description: string,
  icon: LucideIcon,
  defaultChart: WidgetMeta["defaultChart"],
  render: (m: ReturnType<typeof useTeamOps>) => React.ReactElement,
): WidgetMeta {
  function W({ range }: { range: Range }) {
    const m = useTeamOps(range);
    return render(m);
  }
  return {
    id,
    title,
    description,
    category: "Atendimento & Operação",
    icon,
    defaultChart,
    supportedCharts: [defaultChart],
    render: ({ range }) => <W range={range} />,
  };
}

export const TEAM_WIDGETS: WidgetMeta[] = [
  make("ops_ranking_atendimento", "Ranking de atendimento", "Quem mais atendeu no período, em tempo real.", Trophy, "bar", ({ data }) => (
    <Shell title="Ranking de atendimento" Icon={Trophy} footer="atualiza em tempo real">
      {!data.ranking.length ? <Empty text="Nenhum atendimento no período." /> : (
        <div className="divide-y divide-[color:var(--hairline)]">
          {data.ranking.map((r, i) => {
            const max = data.ranking[0]!.atendimentos || 1;
            return (
              <div key={r.userId} className="py-1.5 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="w-4 text-[11px] font-bold tabular-nums text-muted-foreground">{i + 1}</span>
                  <Inicial nome={r.nome} avatar={r.avatar} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-medium">{r.nome}</div>
                    <div className="truncate text-[10px] text-muted-foreground">
                      {r.setor ? `${r.setor} · ` : ""}{r.mensagens} msgs · {r.concluidas} concluídas
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-xs font-bold tabular-nums">{r.atendimentos}</div>
                    <div className={`text-[10px] tabular-nums ${r.variacao > 0 ? "text-emerald-500" : r.variacao < 0 ? "text-red-500" : "text-muted-foreground"}`}>
                      {r.variacao > 0 ? "+" : ""}{r.variacao}%
                    </div>
                  </div>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${(r.atendimentos / max) * 100}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Shell>
  )),

  make("ops_monitor_usuarios", "Monitoramento de usuários", "Quem está ativo agora, fila e demandas atrasadas.", Activity, "bar", ({ data }) => (
    <Shell title="Monitoramento de usuários" Icon={Activity} footer="online = atividade nos últimos 10 min">
      {!data.monitor.length ? <Empty text="Nenhum usuário ativo cadastrado." /> : (
        <div className="divide-y divide-[color:var(--hairline)]">
          {data.monitor.map((u) => {
            const alerta = u.semResposta > 0 && u.esperaMaisAntigaMin >= 30;
            return (
              <div key={u.userId} className="flex items-center gap-2 py-1.5">
                <span className="relative shrink-0">
                  <Inicial nome={u.nome} avatar={u.avatar} />
                  <span
                    className={`absolute -bottom-0.5 -right-0.5 size-2 rounded-full ring-2 ring-card ${ESTADO[u.estado].cor}`}
                    title={ESTADO[u.estado].label}
                  />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-medium">{u.nome}</div>
                  <div className="truncate text-[10px] text-muted-foreground">
                    {u.setor ? `${u.setor} · ` : ""}{u.abertas} em aberto · resposta {fmtMin(u.minutosUltimaAtividade)}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className={`text-[11px] font-semibold tabular-nums ${alerta ? "text-red-500" : u.semResposta ? "text-amber-500" : "text-muted-foreground"}`}>
                    {u.semResposta} s/ resposta
                  </div>
                  <div className="text-[10px] tabular-nums text-muted-foreground">
                    {u.semResposta ? `espera ${fmtMin(u.esperaMaisAntigaMin)} · ` : ""}{u.atrasadas} atrasadas
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Shell>
  )),

  make("ops_ranking_csat", "Ranking de satisfação", "Melhores notas das pesquisas, por atendente.", Star, "bar", ({ data }) => (
    <Shell
      title="Ranking de satisfação"
      Icon={Star}
      footer={data.ultimoComentarioNegativo
        ? `⚠ ${data.ultimoComentarioNegativo.nome}: “${data.ultimoComentarioNegativo.comentario}”`
        : "sem comentários negativos no período"}
    >
      {!data.csat.length ? <Empty text="Sem respostas de pesquisa no período." /> : (
        <div className="divide-y divide-[color:var(--hairline)]">
          {data.csat.map((c, i) => (
            <div key={c.userId} className="py-1.5 space-y-1">
              <div className="flex items-center gap-2">
                <span className="w-4 text-[11px] font-bold tabular-nums text-muted-foreground">{i + 1}</span>
                <Inicial nome={c.nome} avatar={c.avatar} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-medium">{c.nome}</div>
                  <div className="truncate text-[10px] text-muted-foreground">
                    {c.respostas} respostas · {c.promotores}% satisfeitos · {c.detratores}% insatisfeitos
                  </div>
                </div>
                <div className="shrink-0 text-xs font-bold tabular-nums text-amber-500">★ {c.media.toFixed(1)}</div>
              </div>
              <div className="flex h-1.5 overflow-hidden rounded-full bg-muted">
                {c.dist.map((q, idx) => (
                  q ? (
                    <div
                      key={idx}
                      className={["bg-red-500", "bg-orange-400", "bg-amber-400", "bg-lime-500", "bg-emerald-500"][idx]}
                      style={{ width: `${(q / c.respostas) * 100}%` }}
                      title={`Nota ${idx + 1}: ${q}`}
                    />
                  ) : null
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </Shell>
  )),

  make(
    "ops_tickets_por_atendente",
    "Tickets por atendente",
    "Quantos atendimentos cada atendente tem agora, em tempo real.",
    Ticket,
    "bar",
    ({ data }) => (
      <Shell
        title="Tickets por atendente"
        Icon={Ticket}
        footer={data.semDono ? `${data.semDono} ticket(s) sem responsável` : "atualiza em tempo real"}
      >
        {!data.tickets.length ? <Empty text="Nenhum atendente com tickets." /> : (
          <div className="divide-y divide-[color:var(--hairline)]">
            {data.tickets.map((t) => (
              <div key={t.userId} className="flex items-center gap-2.5 py-2">
                <span className="relative shrink-0">
                  <Inicial nome={t.nome} avatar={t.avatar} size={8} />
                  <span
                    className={`absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full ring-2 ring-card ${ESTADO[t.estado].cor}`}
                    title={ESTADO[t.estado].label}
                  />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-medium">{t.nome}</div>
                  <div className="truncate text-[10px] text-muted-foreground">
                    {t.setor ? `${t.setor} · ` : ""}{t.emAndamento} em andamento · {t.aguardando} aguardando · {t.concluidosHoje} concluídos hoje
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-base font-bold leading-none tabular-nums">{t.abertos}</div>
                  <div className="text-[10px] text-muted-foreground">tickets</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Shell>
    ),
  ),
];
