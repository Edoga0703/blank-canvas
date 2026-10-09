import type { BusinessHours } from "@/lib/business-hours";

export type Ocupado = { inicio: string; fim: string };

function hhmm(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s || "");
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** Gera os horários livres de um dia, respeitando jornada, pausa e compromissos existentes. */
export function buildSlots(
  h: BusinessHours | null | undefined,
  day: Date,
  duracaoMin: number,
  ocupados: Ocupado[],
  stepMin = 15,
): Date[] {
  const dia = h?.dias?.[String(day.getDay())] ?? null;
  const abre = dia ? hhmm(dia.abre) : 8 * 60;
  const fecha = dia ? hhmm(dia.fecha) : 18 * 60;
  if (!dia && h?.dias) return []; // dia sem atendimento configurado
  if (abre == null || fecha == null || fecha <= abre) return [];

  const pausaIni = dia?.pausa_ativa && dia.pausa_abre ? hhmm(dia.pausa_abre) : null;
  const pausaFim = dia?.pausa_ativa && dia.pausa_fecha ? hhmm(dia.pausa_fecha) : null;

  const busy = ocupados.map((o) => [new Date(o.inicio).getTime(), new Date(o.fim).getTime()] as const);
  const dur = Math.max(5, duracaoMin || 30);
  const agora = Date.now();
  const out: Date[] = [];

  for (let m = abre; m + dur <= fecha; m += stepMin) {
    if (pausaIni != null && pausaFim != null && m < pausaFim && m + dur > pausaIni) continue;
    const start = new Date(day);
    start.setHours(0, 0, 0, 0);
    start.setMinutes(m);
    const si = start.getTime();
    const sf = si + dur * 60_000;
    if (sf <= agora) continue;
    if (busy.some(([bi, bf]) => si < bf && sf > bi)) continue;
    out.push(start);
  }
  return out;
}

export function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
