import { useRef, useState } from "react";
import {
  GRID_END_HOUR, GRID_HEIGHT, GRID_START_HOUR, PX_PER_MIN, alturaPx, corDoItem, duracaoItem,
  fimItem, fmtHora, minutosDoDia, snap, topPx,
  type Bloqueio, type Item, type Servico, type TipoAgendamento,
} from "./shared";
import { Lock, MessageSquare } from "lucide-react";

export type Coluna = {
  key: string;
  titulo: string;
  sub?: string;
  dia: Date;
  /** Quando a coluna representa um profissional (visão por profissional). */
  profissionalId?: string | null;
  itens: Item[];
  bloqueios: Bloqueio[];
  /** Intervalos (em minutos do dia) fora do expediente. */
  indisponiveis: [number, number][];
  destaque?: boolean;
};

type Props = {
  colunas: Coluna[];
  servicos: Servico[];
  tipos: TipoAgendamento[];
  step: number;
  podeEditar: boolean;
  onSlotClick: (col: Coluna, quando: Date) => void;
  onItemClick: (item: Item) => void;
  onMove: (item: Item, novoInicio: Date, novaDuracao: number, profissionalId?: string | null) => void;
};

const HORAS = Array.from({ length: GRID_END_HOUR - GRID_START_HOUR + 1 }, (_, i) => GRID_START_HOUR + i);

export function TimeGrid({
  colunas, servicos, tipos, step, podeEditar, onSlotClick, onItemClick, onMove,
}: Props) {
  const [drag, setDrag] = useState<{ id: string; dyMin: number; mode: "move" | "resize" } | null>(null);
  const startY = useRef(0);
  const startX = useRef(0);
  const arrastou = useRef(false);

  function colunaEm(x: number, y: number): Coluna | null {
    if (typeof document === "undefined") return null;
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    const host = el?.closest("[data-col-key]") as HTMLElement | null;
    if (!host) return null;
    return colunas.find((c) => c.key === host.dataset['colKey']) ?? null;
  }

  function iniciarDrag(e: React.PointerEvent, item: Item, mode: "move" | "resize") {
    if (!podeEditar || item.tipo !== "compromisso") return;
    e.stopPropagation();
    e.preventDefault();
    startY.current = e.clientY;
    startX.current = e.clientX;
    arrastou.current = false;
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    setDrag({ id: item.id, dyMin: 0, mode });

    const mover = (ev: PointerEvent) => {
      const dy = ev.clientY - startY.current;
      if (Math.abs(dy) > 3 || Math.abs(ev.clientX - startX.current) > 3) arrastou.current = true;
      setDrag({ id: item.id, dyMin: snap(dy / PX_PER_MIN, step), mode });
    };
    const soltar = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", soltar);
      const dyMin = snap((ev.clientY - startY.current) / PX_PER_MIN, step);
      const destino = mode === "move" ? colunaEm(ev.clientX, ev.clientY) : null;
      setDrag(null);
      const dur = duracaoItem(item);
      if (mode === "resize") {
        if (dyMin) onMove(item, new Date(item.agendado_para), Math.max(step, dur + dyMin));
        return;
      }
      const ini = new Date(item.agendado_para);
      const mudouColuna = !!destino
        && (destino.dia.toDateString() !== ini.toDateString()
          || (destino.profissionalId != null && destino.profissionalId !== item.profissional_id));
      if (!dyMin && !mudouColuna) return;
      arrastou.current = true;
      const novo = new Date(ini.getTime() + dyMin * 60_000);
      if (destino) {
        const alvo = new Date(destino.dia);
        alvo.setHours(novo.getHours(), novo.getMinutes(), 0, 0);
        onMove(item, alvo, dur, destino.profissionalId ?? item.profissional_id);
        return;
      }
      onMove(item, novo, dur);
    };
    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", soltar);
  }

  const agora = new Date();
  const agoraTop = topPx(agora);
  const mostraAgora = minutosDoDia(agora) >= GRID_START_HOUR * 60 && minutosDoDia(agora) <= GRID_END_HOUR * 60;

  return (
    <div className="overflow-auto max-h-[calc(100vh-240px)] min-h-[420px] rounded-lg border bg-card">
      <div className="min-w-[720px]">
        {/* Cabeçalho fixo */}
        <div
          className="sticky top-0 z-20 grid bg-card/95 backdrop-blur border-b"
          style={{ gridTemplateColumns: `64px repeat(${colunas.length}, minmax(0,1fr))` }}
        >
          <div className="px-2 py-2 text-[11px] text-muted-foreground">Horário</div>
          {colunas.map((c) => (
            <div
              key={c.key}
              className={`px-2 py-2 text-center border-l ${c.destaque ? "bg-primary/5" : ""}`}
            >
              <div className={`text-[11px] uppercase tracking-wide ${c.destaque ? "text-primary" : "text-muted-foreground"}`}>
                {c.titulo}
              </div>
              {c.sub && (
                <div className={`text-sm font-semibold ${c.destaque ? "text-primary" : ""}`}>{c.sub}</div>
              )}
            </div>
          ))}
        </div>

        <div
          className="relative grid"
          style={{ gridTemplateColumns: `64px repeat(${colunas.length}, minmax(0,1fr))`, height: GRID_HEIGHT }}
        >
          {/* Coluna de horas */}
          <div className="relative border-r bg-muted/20">
            {HORAS.map((h) => (
              <div
                key={h}
                className="absolute left-0 right-0 text-[11px] text-muted-foreground px-2 -translate-y-1/2"
                style={{ top: (h - GRID_START_HOUR) * 60 * PX_PER_MIN }}
              >
                {String(h).padStart(2, "0")}:00
              </div>
            ))}
          </div>

          {colunas.map((col) => (
            <div
              key={col.key}
              data-col-key={col.key}
              className={`relative border-l ${col.destaque ? "bg-primary/[0.03]" : ""}`}
              onClick={(e) => {
                if (!podeEditar) return;
                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                const min = snap((e.clientY - rect.top) / PX_PER_MIN, step) + GRID_START_HOUR * 60;
                const quando = new Date(col.dia);
                quando.setHours(0, 0, 0, 0);
                quando.setMinutes(min);
                onSlotClick(col, quando);
              }}
            >
              {/* Linhas de hora */}
              {HORAS.map((h) => (
                <div
                  key={h}
                  className="absolute left-0 right-0 border-t border-border/60"
                  style={{ top: (h - GRID_START_HOUR) * 60 * PX_PER_MIN }}
                />
              ))}

              {/* Fora do expediente */}
              {col.indisponiveis.map(([ini, fim], idx) => (
                <div
                  key={idx}
                  className="absolute left-0 right-0 bg-muted/60"
                  style={{
                    top: (ini - GRID_START_HOUR * 60) * PX_PER_MIN,
                    height: Math.max(0, (fim - ini) * PX_PER_MIN),
                  }}
                  aria-hidden="true"
                />
              ))}

              {/* Bloqueios */}
              {col.bloqueios.map((b) => {
                const ini = new Date(b.inicio);
                const fim = new Date(b.fim);
                return (
                  <div
                    key={b.id}
                    className="absolute left-1 right-1 rounded-md border border-dashed border-muted-foreground/40 bg-muted/80 px-2 py-1 text-[11px] text-muted-foreground flex items-center gap-1"
                    style={{ top: topPx(ini), height: alturaPx((fim.getTime() - ini.getTime()) / 60000) }}
                    title={b.motivo || "Horário bloqueado"}
                  >
                    <Lock className="w-3 h-3 shrink-0" aria-hidden="true" />
                    <span className="truncate">{b.motivo || "Bloqueado"}</span>
                  </div>
                );
              })}

              {/* Compromissos */}
              {col.itens.map((item) => {
                const ini = new Date(item.agendado_para);
                const dur = duracaoItem(item);
                const arrastando = drag?.id === item.id;
                const deslocaTop = arrastando && drag?.mode === "move" ? drag.dyMin * PX_PER_MIN : 0;
                const deslocaAlt = arrastando && drag?.mode === "resize" ? drag.dyMin * PX_PER_MIN : 0;
                const cor = corDoItem(item, servicos, tipos);
                const cancelado = item.status === "cancelado";
                const ehMensagem = item.tipo === "mensagem";
                const rotulo = item.titulo || item.nome_lead || (ehMensagem ? "Mensagem programada" : "Compromisso");
                return (
                  <div
                    key={item.id}
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (arrastou.current) { arrastou.current = false; return; }
                      onItemClick(item);
                    }}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); onItemClick(item); } }}
                    onPointerDown={(e) => iniciarDrag(e, item, "move")}
                    className={`absolute left-1 right-1 rounded-[10px] border px-2 py-1 text-left shadow-sm overflow-hidden group focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${cancelado ? "opacity-60 line-through" : ""} ${arrastando ? "z-30 opacity-80" : "z-10"} ${podeEditar ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"}`}
                    style={{
                      top: topPx(ini) + deslocaTop,
                      height: alturaPx(dur) + deslocaAlt,
                      background: `${cor}14`,
                      borderColor: `${cor}55`,
                      borderLeft: `3px solid ${cor}`,
                    }}
                    title={`${fmtHora(ini)} – ${fmtHora(fimItem(item))} · ${rotulo}`}
                  >
                    <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      {ehMensagem && <MessageSquare className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />}
                      {ehMensagem ? fmtHora(ini) : `${fmtHora(ini)} – ${fmtHora(fimItem(item))}`}
                    </div>
                    <div className="text-[13px] font-semibold truncate leading-tight">{rotulo}</div>
                    {dur >= 45 && item.nome_lead && item.titulo && (
                      <div className="text-[11px] text-muted-foreground truncate">{item.nome_lead}</div>
                    )}
                    {podeEditar && (
                      <div
                        onPointerDown={(e) => iniciarDrag(e, item, "resize")}
                        className="absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize opacity-0 group-hover:opacity-100 bg-foreground/10"
                        aria-label="Alterar duração"
                      />
                    )}
                  </div>
                );
              })}

              {/* Linha do horário atual */}
              {mostraAgora && col.dia.toDateString() === agora.toDateString() && (
                <div className="absolute left-0 right-0 z-20 pointer-events-none" style={{ top: agoraTop }}>
                  <div className="h-px bg-red-500" />
                  <div className="absolute -left-1 -top-1 w-2 h-2 rounded-full bg-red-500" />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
