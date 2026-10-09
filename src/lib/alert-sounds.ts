/** Sons de notificação do painel master (WebAudio, sem assets externos). */
let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = (window as any).AudioContext || (window as any).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) ctx = new Ctor();
  if (ctx?.state === "suspended") void ctx.resume();
  return ctx;
}

function tone(freq: number, startAt: number, duration: number, gain = 0.12, type: OscillatorType = "sine") {
  const ac = getCtx();
  if (!ac) return;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ac.currentTime + startAt);
  g.gain.setValueAtTime(0.0001, ac.currentTime + startAt);
  g.gain.exponentialRampToValueAtTime(gain, ac.currentTime + startAt + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + startAt + duration);
  osc.connect(g).connect(ac.destination);
  osc.start(ac.currentTime + startAt);
  osc.stop(ac.currentTime + startAt + duration + 0.05);
}

/** Alerta de urgência: sirene curta de 3 toques graves/agudos. */
export function playUrgentSound() {
  tone(880, 0, 0.18, 0.18, "square");
  tone(620, 0.22, 0.18, 0.18, "square");
  tone(880, 0.44, 0.26, 0.2, "square");
}

/** Notificação leve: dois toques suaves ascendentes. */
export function playInfoSound() {
  tone(660, 0, 0.12, 0.08, "sine");
  tone(990, 0.13, 0.18, 0.07, "sine");
}

/** Lead novo: acorde ascendente de 3 notas (mais "festivo"). */
export function playNewLeadSound() {
  tone(523, 0, 0.14, 0.12, "triangle");
  tone(659, 0.13, 0.14, 0.12, "triangle");
  tone(784, 0.26, 0.28, 0.14, "triangle");
}

/** Mensagem nova: um "pop" curto e discreto. */
export function playNewMessageSound() {
  tone(1046, 0, 0.09, 0.09, "sine");
  tone(1318, 0.07, 0.12, 0.06, "sine");
}
