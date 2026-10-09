// Helpers de período do módulo Comercial (client + server safe).

export type Range = { from: string; to: string };

export function monthRange(d = new Date()): Range {
  const from = new Date(d.getFullYear(), d.getMonth(), 1);
  const to = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  return { from: from.toISOString(), to: to.toISOString() };
}

export function prevMonthRange(d = new Date()): Range {
  const from = new Date(d.getFullYear(), d.getMonth() - 1, 1);
  const to = new Date(d.getFullYear(), d.getMonth(), 1);
  return { from: from.toISOString(), to: to.toISOString() };
}

export function lastDaysRange(days: number): Range {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - days);
  return { from: from.toISOString(), to: to.toISOString() };
}

/** Converte "YYYY-MM-DD" (input date) para um Range inclusivo. */
export function customRange(fromDay: string, toDay: string): Range {
  const from = new Date(`${fromDay}T00:00:00`);
  const to = new Date(`${toDay}T00:00:00`);
  to.setDate(to.getDate() + 1);
  return { from: from.toISOString(), to: to.toISOString() };
}

/** Deslocamento equivalente ao período anterior (mesma duração). */
export function previousOf(range: Range): Range {
  const from = new Date(range.from).getTime();
  const to = new Date(range.to).getTime();
  const span = Math.max(1, to - from);
  return { from: new Date(from - span).toISOString(), to: new Date(from).toISOString() };
}

export function labelOf(range: Range): string {
  const f = new Date(range.from);
  const t = new Date(new Date(range.to).getTime() - 1);
  const fmt = (d: Date) => d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
  return `${fmt(f)} — ${fmt(t)}`;
}
