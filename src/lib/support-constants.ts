export const SUPPORT_CATEGORIAS = [
  "Geral",
  "Financeiro",
  "WhatsApp / Conexão",
  "IA / Agentes",
  "CRM",
  "Campanhas",
  "Bug",
  "Sugestão",
] as const;

export const SUPPORT_PRIORIDADES = [
  { value: "baixa", label: "Baixa", color: "#64748b" },
  { value: "normal", label: "Normal", color: "#214AC4" },
  { value: "alta", label: "Alta", color: "#f59e0b" },
  { value: "urgente", label: "Urgente", color: "#ef4444" },
] as const;

/** Prazo (SLA) de primeira resposta, em minutos, por prioridade */
export const SLA_MINUTOS: Record<string, number> = {
  urgente: 30,
  alta: 120,
  normal: 480,
  baixa: 1440,
};
