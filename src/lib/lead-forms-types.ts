// Tipos compartilhados (client-safe) do módulo de Formulários de Captura.

export type FormFieldType =
  | "texto"
  | "email"
  | "telefone"
  | "numero"
  | "data"
  | "select"
  | "checkbox"
  | "textarea";

export type FormField = {
  id: string;
  tipo: FormFieldType;
  label: string;
  placeholder?: string;
  obrigatorio: boolean;
  opcoes?: string[];
  /** campos-chave do CRM: nome | numero | email */
  mapeia?: "nome" | "numero" | "email" | null;
};

export type FormTheme = {
  layout: "centralizado" | "dividido";
  corPrimaria: string;
  corFundo: string;
  corTexto: string;
  imagemFundo?: string | null;
  imagemLateral?: string | null;
  logoUrl?: string | null;
  titulo: string;
  subtitulo?: string;
  bullets?: string[];
  textoBotao: string;
  arredondamento: "suave" | "medio" | "pill";
  rodape?: string;
};

export type LeadFormRow = {
  id: string;
  company_id: string;
  slug: string;
  nome: string;
  ativo: boolean;
  pipeline_id: string | null;
  stage_id: string | null;
  owner_mode: "fila" | "fixo";
  owner_id: string | null;
  distribution_queue_id: string | null;
  tags: string[];
  valor_padrao: number | null;
  pos_envio: "mensagem" | "redirect";
  redirect_url: string | null;
  mensagem_sucesso: string;
  wa_auto_enviar: boolean;
  wa_mensagem: string | null;
  theme: FormTheme;
  campos: FormField[];
  views: number;
  submits: number;
  created_at: string;
  updated_at: string;
};

export const DEFAULT_THEME: FormTheme = {
  layout: "centralizado",
  corPrimaria: "#0B22FE",
  corFundo: "#F4F5F9",
  corTexto: "#0F172A",
  imagemFundo: null,
  imagemLateral: null,
  logoUrl: null,
  titulo: "Fale com a nossa equipe",
  subtitulo: "Preencha seus dados e retornamos em instantes.",
  bullets: ["Atendimento rápido", "Sem compromisso"],
  textoBotao: "Quero falar agora",
  arredondamento: "medio",
  rodape: "Seus dados estão seguros e não serão compartilhados.",
};

export const DEFAULT_FIELDS: FormField[] = [
  { id: "nome", tipo: "texto", label: "Seu nome", placeholder: "Nome completo", obrigatorio: true, mapeia: "nome" },
  { id: "numero", tipo: "telefone", label: "WhatsApp", placeholder: "(11) 99999-9999", obrigatorio: true, mapeia: "numero" },
];

export function slugifyForm(s: string): string {
  return (
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 48) || "formulario"
  );
}
