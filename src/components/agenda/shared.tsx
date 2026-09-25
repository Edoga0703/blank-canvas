import { Badge } from "@/components/ui/badge";
import type { LucideIcon } from "lucide-react";
import {
  CalendarClock, Check, CheckCheck, Clock, AlertCircle, Ban, UserX, Loader2, Send,
} from "lucide-react";

export type Item = {
  id: string;
  tipo: "mensagem" | "compromisso";
  titulo: string | null;
  mensagem: string;
  numero: string;
  nome_lead: string | null;
  empresa_nome: string | null;
  card_id: string | null;
  tipo_id: string | null;
  servico_id: string | null;
  profissional_id: string | null;
  agendado_para: string;
  fim_em: string | null;
  duracao_min: number | null;
  modalidade: string | null;
  local: string | null;
  link_reuniao: string | null;
  observacoes_internas: string | null;
  tags: string[] | null;
  status: string;
  presenca: string | null;
  erro: string | null;
  motivo_falha: string | null;
  enviado_em: string | null;
  canal: string | null;
  appointment_id: string | null;
  recorrencia_id: string | null;
  lembrete_min_antes: number | null;
  created_at?: string;
};

export type Bloqueio = {
  id: string;
  user_id: string | null;
  inicio: string;
  fim: string;
  motivo: string | null;
  tipo: string;
};

export type Profissional = {
  user_id: string;
  nome: string;
  avatar_url: string | null;
  role: string;
  horarios: any | null;
};

export type Servico = { id: string; nome: string; duracao_min: number; cor: string | null; ativo: boolean };
export type Local = { id: string; nome: string; endereco: string; padrao: boolean };
export type TipoAgendamento = {
  id: string; nome: string; cor: string; duracao_padrao_min: number; ativo: boolean;
};

/* ---------------- Status ---------------- */

export const STATUS_COMPROMISSO: Record<string, { label: string; cls: string; dot: string; icon: LucideIcon }> = {
  agendado: { label: "Agendado", cls: "bg-blue-500/10 text-blue-600 border-blue-500/25", dot: "bg-blue-500", icon: CalendarClock },
  aguardando: { label: "Aguardando confirmação", cls: "bg-amber-500/10 text-amber-600 border-amber-500/25", dot: "bg-amber-500", icon: Clock },
  confirmado: { label: "Confirmado", cls: "bg-emerald-500/10 text-emerald-600 border-emerald-500/25", dot: "bg-emerald-500", icon: Check },
  em_atendimento: { label: "Em atendimento", cls: "bg-indigo-500/10 text-indigo-600 border-indigo-500/25", dot: "bg-indigo-500", icon: Loader2 },
  concluido: { label: "Concluído", cls: "bg-emerald-500/10 text-emerald-700 border-emerald-500/25", dot: "bg-emerald-600", icon: CheckCheck },
  reagendado: { label: "Reagendado", cls: "bg-sky-500/10 text-sky-600 border-sky-500/25", dot: "bg-sky-500", icon: CalendarClock },
  cancelado: { label: "Cancelado", cls: "bg-red-500/10 text-red-600 border-red-500/25", dot: "bg-red-500", icon: Ban },
  falta: { label: "Falta", cls: "bg-red-500/10 text-red-600 border-red-500/25", dot: "bg-red-500", icon: UserX },
};

export const STATUS_MENSAGEM: Record<string, { label: string; cls: string; dot: string; icon: LucideIcon }> = {
  rascunho: { label: "Rascunho", cls: "bg-muted text-muted-foreground border-border", dot: "bg-muted-foreground", icon: Clock },
  pendente: { label: "Programada", cls: "bg-violet-500/10 text-violet-600 border-violet-500/25", dot: "bg-violet-500", icon: Clock },
  processando: { label: "Processando", cls: "bg-amber-500/10 text-amber-600 border-amber-500/25", dot: "bg-amber-500", icon: Loader2 },
  enviado: { label: "Enviada", cls: "bg-emerald-500/10 text-emerald-600 border-emerald-500/25", dot: "bg-emerald-500", icon: Send },
  entregue: { label: "Entregue", cls: "bg-emerald-500/10 text-emerald-600 border-emerald-500/25", dot: "bg-emerald-500", icon: CheckCheck },
  lida: { label: "Lida", cls: "bg-emerald-500/10 text-emerald-700 border-emerald-500/25", dot: "bg-emerald-600", icon: CheckCheck },
  erro: { label: "Falhou", cls: "bg-red-500/10 text-red-600 border-red-500/25", dot: "bg-red-500", icon: AlertCircle },
  cancelado: { label: "Cancelada", cls: "bg-muted text-muted-foreground border-border", dot: "bg-muted-foreground", icon: Ban },
};

export function statusInfo(item: { tipo: string; status: string }) {
  const map = item.tipo === "mensagem" ? STATUS_MENSAGEM : STATUS_COMPROMISSO;
  return map[item.status] ?? { label: item.status, cls: "bg-muted text-muted-foreground border-border", dot: "bg-muted-foreground", icon: Clock };
}

export function StatusBadge({ item, className = "" }: { item: { tipo: string; status: string }; className?: string }) {
  const s = statusInfo(item);
  const Icon = s.icon;
  return (
    <Badge variant="outline" className={`gap-1 font-medium ${s.cls} ${className}`}>
      <Icon className="w-3 h-3" aria-hidden="true" />
      {s.label}
    </Badge>
  );
}

export const MODALIDADES = [
  { value: "presencial", label: "Presencial" },
  { value: "ligacao", label: "Ligação" },
  { value: "video", label: "Videoconferência" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "outro", label: "Outro" },
];

export const STATUS_OPCOES = [
  "agendado", "aguardando", "confirmado", "em_atendimento", "concluido", "reagendado", "cancelado", "falta",
];

/* ---------------- Datas ---------------- */

export const pad = (n: number) => String(n).padStart(2, "0");

export function dateOnly(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function parseDateOnly(s: string) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y || 2026, (m || 1) - 1, d || 1);
}
export function toLocalInput(d: Date) {
  return `${dateOnly(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function fmtHora(iso: string | Date) {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}
export function fmtData(iso: string | Date) {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}
export function fmtDataLonga(d: Date) {
  return d.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
}
export function fmtDataHora(iso: string) {
  return `${fmtData(iso)} ${fmtHora(iso)}`;
}
export function addDias(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
export function inicioSemana(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - x.getDay());
  return x;
}
export function mesmoDia(a: Date, b: Date) {
  return a.toDateString() === b.toDateString();
}
export function fimItem(i: Item) {
  const ini = new Date(i.agendado_para);
  if (i.fim_em) return new Date(i.fim_em);
  return new Date(ini.getTime() + (i.duracao_min || 30) * 60_000);
}
export function duracaoItem(i: Item) {
  return i.duracao_min || Math.max(15, Math.round((fimItem(i).getTime() - new Date(i.agendado_para).getTime()) / 60000));
}

export function iniciais(nome?: string | null) {
  if (!nome) return "?";
  return nome.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");
}

/* Cores por serviço/tipo, com fallback pelo status. */
export function corDoItem(
  item: Item,
  servicos: Servico[],
  tipos: TipoAgendamento[],
): string {
  if (item.tipo === "mensagem") return "#8b5cf6";
  const t = tipos.find((x) => x.id === item.tipo_id);
  if (t?.cor) return t.cor;
  const s = servicos.find((x) => x.id === item.servico_id);
  if (s?.cor) return s.cor;
  if (item.status === "cancelado" || item.status === "falta") return "#ef4444";
  if (item.status === "confirmado" || item.status === "concluido") return "#10b981";
  if (item.status === "aguardando") return "#f59e0b";
  return "#0B22FE";
}

/* Grade de horários da timeline */
export const GRID_START_HOUR = 6;
export const GRID_END_HOUR = 22;
export const PX_PER_MIN = 1.45;

export function minutosDoDia(d: Date) {
  return d.getHours() * 60 + d.getMinutes();
}
export function topPx(d: Date) {
  return (minutosDoDia(d) - GRID_START_HOUR * 60) * PX_PER_MIN;
}
export function alturaPx(min: number) {
  return Math.max(22, min * PX_PER_MIN);
}
export const GRID_HEIGHT = (GRID_END_HOUR - GRID_START_HOUR) * 60 * PX_PER_MIN;

export function snap(min: number, step = 15) {
  return Math.round(min / step) * step;
}
