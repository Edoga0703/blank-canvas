import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Plus, MessageSquare, Clock, User, Check, Ban } from "lucide-react";
import {
  corDoItem, fimItem, fmtHora, mesmoDia, StatusBadge,
  type Bloqueio, type Item, type Profissional, type Servico, type TipoAgendamento,
} from "./shared";

type Props = {
  dias: Date[];
  itens: Item[];
  servicos: Servico[];
  tipos: TipoAgendamento[];
  profissionais: Profissional[];
  bloqueios?: Bloqueio[];
  onAbrirItem: (i: Item) => void;
  onCriar: (d: Date) => void;
  onStatus?: (i: Item, status: string) => void;
};

/** Agenda cronológica (dia ou semana), em cartões — mais legível que a grade de horas. */
export function DayAgenda({ dias, itens, servicos, tipos, profissionais, bloqueios = [], onAbrirItem, onCriar, onStatus }: Props) {
  const hoje = new Date();

  const grupos = useMemo(() => dias.map((d) => ({
    dia: d,
    lista: itens
      .filter((i) => mesmoDia(new Date(i.agendado_para), d))
      .sort((a, b) => a.agendado_para.localeCompare(b.agendado_para)),
    blocos: bloqueios
      .filter((b) => {
        const ini = new Date(b.inicio);
        const fim = new Date(b.fim);
        const diaIni = new Date(d.getFullYear(), d.getMonth(), d.getDate());
        const diaFim = new Date(diaIni.getTime() + 86_400_000);
        return ini < diaFim && fim > diaIni;
      })
      .sort((a, b) => a.inicio.localeCompare(b.inicio)),
  })), [dias, itens, bloqueios]);

  return (
    <div className="space-y-3">
      {grupos.map(({ dia, lista, blocos }) => (
        <section key={dia.toISOString()} className="rounded-xl border bg-card overflow-hidden">
          <header className="flex items-center gap-2 border-b bg-muted/30 px-3 py-2">
            <span className={`grid h-8 w-8 place-items-center rounded-lg text-sm font-bold ${mesmoDia(dia, hoje) ? "bg-primary text-primary-foreground" : "bg-background border"}`}>
              {dia.getDate()}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold capitalize truncate">
                {dia.toLocaleDateString("pt-BR", { weekday: "long" })}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {dia.toLocaleDateString("pt-BR", { day: "2-digit", month: "long" })} · {lista.length} item(ns)
              </p>
            </div>
            <Button
              variant="ghost" size="sm" className="ml-auto h-8 text-xs"
              onClick={() => onCriar(dia)}
            >
              <Plus className="w-4 h-4 mr-1" /> Adicionar
            </Button>
          </header>

          {blocos.length > 0 && (
            <ul className="space-y-1.5 border-b bg-[repeating-linear-gradient(45deg,transparent,transparent_6px,hsl(var(--muted))_6px,hsl(var(--muted))_12px)] p-3">
              {blocos.map((b) => (
                <li key={b.id} className="flex items-center gap-2 rounded-lg border border-dashed bg-card/90 px-3 py-2">
                  <Ban className="w-3.5 h-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="text-xs font-medium">{b.motivo || "Horário bloqueado"}</span>
                  <span className="ml-auto shrink-0 text-[11px] tabular-nums text-muted-foreground">
                    {fmtHora(b.inicio)} – {fmtHora(b.fim)}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {lista.length === 0 ? (
            <button
              type="button"
              onClick={() => onCriar(dia)}
              className="w-full px-3 py-6 text-sm text-muted-foreground hover:bg-muted/40"
            >
              Sem compromissos neste dia. Clique para agendar.
            </button>
          ) : (
            <ul className="space-y-2 p-3">
              {lista.map((i) => {
                const prof = profissionais.find((p) => p.user_id === i.profissional_id);
                const cor = corDoItem(i, servicos, tipos);
                const servico = servicos.find((s) => s.id === i.servico_id)?.nome;
                const concluido = i.status === "concluido" || i.status === "cancelado";
                return (
                  <li key={i.id} className="flex items-start gap-3">
                    <div className="w-14 shrink-0 pt-3 text-right">
                      <p className="text-sm font-semibold tabular-nums">{fmtHora(i.agendado_para)}</p>
                      {i.tipo === "compromisso" && (
                        <p className="text-[11px] text-muted-foreground tabular-nums">{fmtHora(fimItem(i))}</p>
                      )}
                    </div>

                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => onAbrirItem(i)}
                      onKeyDown={(e) => { if (e.key === "Enter") onAbrirItem(i); }}
                      className={`group flex flex-1 cursor-pointer items-center gap-3 rounded-lg border bg-card p-3 transition-all hover:border-primary/40 hover:shadow-sm ${concluido ? "opacity-70" : ""}`}
                    >
                      <span className="h-9 w-1 shrink-0 rounded-full" style={{ background: cor }} aria-hidden="true" />
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1.5 truncate text-sm font-semibold">
                          {i.tipo === "mensagem" && (
                            <MessageSquare className="w-3.5 h-3.5 shrink-0 text-violet-600" aria-hidden="true" />
                          )}
                          {i.titulo || i.nome_lead || (i.tipo === "mensagem" ? "Mensagem programada" : "Compromisso")}
                        </p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                          {i.nome_lead && <span className="truncate">{i.nome_lead}</span>}
                          {servico && <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" />{servico}</span>}
                          {prof && <span className="inline-flex items-center gap-1"><User className="w-3 h-3" />{prof.nome}</span>}
                        </p>
                      </div>

                      {onStatus && i.tipo === "compromisso" && !concluido && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 shrink-0 px-2 text-[11px] opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                          onClick={(e) => { e.stopPropagation(); onStatus(i, "concluido"); }}
                        >
                          <Check className="mr-1 w-3.5 h-3.5" /> Concluir
                        </Button>
                      )}
                      <StatusBadge item={i} className="shrink-0 text-[10px]" />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

        </section>
      ))}
    </div>
  );
}
