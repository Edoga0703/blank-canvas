import { useEffect, useMemo, useRef, useState } from "react";
import { Ban, MessageSquare } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  addDias, corDoItem, fmtHora, mesmoDia, type Bloqueio, type Item, type Servico, type TipoAgendamento,
} from "./shared";

type Props = {
  mes: Date;
  diaSelecionado: Date;
  compromissos: Item[];
  mensagens: Item[];
  servicos: Servico[];
  tipos: TipoAgendamento[];
  bloqueios?: Bloqueio[];
  onSelecionarDia: (d: Date) => void;
  onAbrirItem: (i: Item) => void;
  onCriar: (d: Date) => void;
};

const ALTURA_ITEM = 22;
const ALTURA_CABECALHO = 34;

export function MonthView({
  mes, diaSelecionado, compromissos, mensagens, servicos, tipos, bloqueios = [],
  onSelecionarDia, onAbrirItem,
}: Props) {
  const { celulas, semanas } = useMemo(() => {
    const primeiro = new Date(mes.getFullYear(), mes.getMonth(), 1);
    const inicio = addDias(primeiro, -primeiro.getDay());
    const ultimo = new Date(mes.getFullYear(), mes.getMonth() + 1, 0);
    const fim = addDias(ultimo, 6 - ultimo.getDay());
    const total = Math.round((fim.getTime() - inicio.getTime()) / 86_400_000) + 1;
    return {
      celulas: Array.from({ length: total }, (_, i) => addDias(inicio, i)),
      semanas: total / 7,
    };
  }, [mes]);

  const gradeRef = useRef<HTMLDivElement>(null);
  const [maxItens, setMaxItens] = useState(4);

  useEffect(() => {
    const el = gradeRef.current;
    if (!el) return;
    const calcular = () => {
      const alturaCelula = el.clientHeight / semanas;
      const disponivel = alturaCelula - ALTURA_CABECALHO;
      setMaxItens(Math.max(1, Math.floor(disponivel / ALTURA_ITEM) - 1));
    };
    calcular();
    const ro = new ResizeObserver(calcular);
    ro.observe(el);
    return () => ro.disconnect();
  }, [semanas]);

  const hoje = new Date();
  const todos = useMemo(() => [...compromissos, ...mensagens], [compromissos, mensagens]);
  const doDia = (d: Date) => todos
    .filter((c) => mesmoDia(new Date(c.agendado_para), d))
    .sort((a, b) => a.agendado_para.localeCompare(b.agendado_para));

  const linhaItem = (i: Item, compacto = true) => (
    <button
      key={i.id}
      type="button"
      onClick={(e) => { e.stopPropagation(); onAbrirItem(i); }}
      className={`flex w-full items-center gap-1.5 rounded-md px-1 text-left hover:bg-muted ${compacto ? "h-[20px] text-[12px]" : "py-1 text-[13px]"}`}
    >
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: corDoItem(i, servicos, tipos) }} aria-hidden="true" />
      <span className="shrink-0 tabular-nums text-muted-foreground">{fmtHora(i.agendado_para)}</span>
      <span className="truncate font-medium">{i.titulo || i.nome_lead || (i.tipo === "mensagem" ? "Mensagem" : "Compromisso")}</span>
    </button>
  );

  return (
    <div className="rounded-xl border bg-card overflow-hidden flex flex-col h-[calc(100vh-210px)] min-h-[640px]">
      <div className="grid grid-cols-7 border-b bg-muted/30 text-[11px] uppercase tracking-wide text-muted-foreground">
        {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d) => (
          <div key={d} className="px-2 py-2 text-center font-semibold">{d}</div>
        ))}
      </div>
      <div ref={gradeRef} className="grid flex-1 grid-cols-7" style={{ gridTemplateRows: `repeat(${semanas}, minmax(0, 1fr))` }}>
        {celulas.map((d) => {
          const itens = doDia(d);
          const msgs = itens.filter((i) => i.tipo === "mensagem").length;
          const diaIni = new Date(d.getFullYear(), d.getMonth(), d.getDate());
          const diaFim = new Date(diaIni.getTime() + 86_400_000);
          const blocos = bloqueios.filter((b) => new Date(b.inicio) < diaFim && new Date(b.fim) > diaIni);
          const foraMes = d.getMonth() !== mes.getMonth();
          const selecionado = mesmoDia(d, diaSelecionado);
          const ehHoje = mesmoDia(d, hoje);
          const excede = itens.length > maxItens;
          const visiveis = excede ? itens.slice(0, maxItens) : itens;
          return (
            <div
              key={d.toISOString()}
              role="button"
              tabIndex={0}
              onClick={() => onSelecionarDia(d)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelecionarDia(d); } }}
              className={`flex min-h-0 cursor-pointer flex-col overflow-hidden border-b border-r p-2 transition-colors hover:bg-muted/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${foraMes ? "bg-muted/20 text-muted-foreground" : ""} ${selecionado ? "bg-primary/5 ring-1 ring-inset ring-primary" : ""}`}
            >
              <div className="flex items-center justify-between">
                <span className={`text-sm font-semibold ${ehHoje ? "grid h-7 w-7 place-items-center rounded-full bg-primary text-primary-foreground" : ""}`}>
                  {d.getDate()}
                </span>
                <span className="flex items-center gap-1.5">
                {blocos.length > 0 && (
                  <span
                    className="flex items-center gap-0.5 text-[11px] text-muted-foreground"
                    title={blocos.map((b) => b.motivo || "Horário bloqueado").join(", ")}
                  >
                    <Ban className="w-3.5 h-3.5" aria-hidden="true" />{blocos.length}
                  </span>
                )}
                {msgs > 0 && (
                  <span className="flex items-center gap-0.5 text-[11px] text-violet-600">
                    <MessageSquare className="w-3.5 h-3.5" aria-hidden="true" />{msgs}
                  </span>
                )}
                </span>
              </div>
              <div className="mt-1.5 min-h-0 flex-1 space-y-0.5 overflow-hidden">
                {visiveis.map((i) => linhaItem(i))}
                {excede && (
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        onClick={(e) => e.stopPropagation()}
                        className="block w-full rounded-md px-1 text-left text-[11px] font-semibold text-primary hover:bg-primary/10"
                      >
                        +{itens.length - maxItens} ver todos
                      </button>
                    </PopoverTrigger>
                    <PopoverContent
                      align="start"
                      className="w-72 p-2"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <p className="px-1 pb-1.5 text-xs font-semibold">
                        {d.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}
                        <span className="ml-1 font-normal text-muted-foreground">· {itens.length} item(ns)</span>
                      </p>
                      <div className="max-h-72 space-y-0.5 overflow-y-auto overscroll-contain">
                        {itens.map((i) => linhaItem(i, false))}
                      </div>
                    </PopoverContent>
                  </Popover>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
