// Feature flags e catálogo canônico de módulos por plano. Client-safe (sem segredos).

export type PlanSlug = "starter" | "pro" | "business" | "cortesia" | "enterprise";

export type PlanModuleDef = {
  key: string;
  label: string;
  description: string;
  category: "canais" | "ia" | "operacao" | "controle";
};

export const PLAN_MODULES: readonly PlanModuleDef[] = [
  { key: "whatsapp_dapi", label: "WhatsApp QR (D-API)", description: "Conexão por QR Code / pareamento com custo por linha ativa.", category: "canais" },
  { key: "whatsapp_oficial", label: "WhatsApp API Oficial Meta", description: "Meta Cloud API oficial sem custo adicional de conexão.", category: "canais" },
  { key: "instagram", label: "Instagram Direct", description: "Mensagens e comentários do Instagram no CRM.", category: "canais" },
  { key: "facebook", label: "Facebook Messenger", description: "Mensagens de páginas do Facebook integradas.", category: "canais" },
  { key: "telegram", label: "Telegram MTProto", description: "Canais, grupos e atendimento direto no Telegram.", category: "canais" },
  { key: "ia", label: "Agente de IA", description: "Atendimento inteligente 24/7 com qualificação no funil.", category: "ia" },
  { key: "agente_simples", label: "Agente IA (Modo Simple)", description: "Configuração guiada de atendimento, catálogo e agenda base.", category: "ia" },
  { key: "rag_conhecimento", label: "Conhecimento RAG Indexado", description: "Indexação inteligente de documentos (PDF/DOCX) no Postgres.", category: "ia" },
  { key: "secretario_ia", label: "Secretário Executivo WhatsApp", description: "Comandos executivos por WhatsApp e aprovações Human-in-the-Loop.", category: "ia" },
  { key: "analises_ia", label: "Análises & Rayos X de IA", description: "Métricas de latência, rotas e rastreamento por turno.", category: "ia" },
  { key: "agente_avancado", label: "Agente Studio Avançado", description: "Controles granulares de prompt, canais extras e regras rígidas.", category: "ia" },
  { key: "ferramentas_verificadas", label: "Ferramentas Externas Verificadas", description: "APIs HTTP verificadas no Sandbox e Outbox real de webhooks.", category: "ia" },
  { key: "automacoes", label: "Automações & Fluxos", description: "Construtor visual de fluxos, gatilhos e webhooks.", category: "operacao" },
  { key: "campanhas", label: "Campanhas em Massa", description: "Disparos segmentados por etapa ou tag do CRM.", category: "operacao" },
  { key: "meta_publicacoes", label: "Publicações & Feed Social", description: "Agendamento e resposta de comentários Meta.", category: "operacao" },
  { key: "meta_capi", label: "Meta Conversions API (CAPI)", description: "Envio de eventos de conversão de volta ao Meta Ads.", category: "operacao" },
  { key: "api_webhooks", label: "API & Webhooks", description: "Integrações externas, tokens de API e disparos.", category: "operacao" },
  { key: "radar", label: "Radar de Prospecção B2B", description: "Captação e qualificação ativa de leads B2B.", category: "operacao" },
  { key: "r2_storage", label: "Mídia & Armazenamento", description: "Arquivamento de mídias e anexos das conversas.", category: "operacao" },
  { key: "treinamentos", label: "Capiversa Academy", description: "Acesso à trilha de treinamentos e vídeos.", category: "operacao" },
  { key: "permite_dapi_trial", label: "Permitir WhatsApp QR (D-API) no Trial", description: "Libera conexão D-API com custo já durante o teste grátis.", category: "controle" },
] as const;

export const PLAN_MODULE_MAP: Record<string, PlanModuleDef> = Object.fromEntries(
  PLAN_MODULES.map((m) => [m.key, m]),
);

const DEFAULT_MODULES_BY_SLUG: Record<PlanSlug, Record<string, boolean>> = {
  starter: {
    whatsapp_dapi: true,
    whatsapp_oficial: true,
    instagram: true,
    facebook: true,
    telegram: true,
    ia: true,
    agente_simples: true,
    rag_conhecimento: false,
    secretario_ia: false,
    analises_ia: false,
    agente_avancado: false,
    ferramentas_verificadas: false,
    automacoes: true,
    campanhas: true,
    meta_publicacoes: false,
    meta_capi: false,
    api_webhooks: false,
    radar: false,
    r2_storage: true,
    treinamentos: true,
    permite_dapi_trial: false,
  },
  pro: {
    whatsapp_dapi: true,
    whatsapp_oficial: true,
    instagram: true,
    facebook: true,
    telegram: true,
    ia: true,
    agente_simples: true,
    rag_conhecimento: true,
    secretario_ia: true,
    analises_ia: true,
    agente_avancado: false,
    ferramentas_verificadas: false,
    automacoes: true,
    campanhas: true,
    meta_publicacoes: true,
    meta_capi: false,
    api_webhooks: true,
    radar: true,
    r2_storage: true,
    treinamentos: true,
    permite_dapi_trial: false,
  },
  business: {
    whatsapp_dapi: true,
    whatsapp_oficial: true,
    instagram: true,
    facebook: true,
    telegram: true,
    ia: true,
    agente_simples: true,
    rag_conhecimento: true,
    secretario_ia: true,
    analises_ia: true,
    agente_avancado: true,
    ferramentas_verificadas: true,
    automacoes: true,
    campanhas: true,
    meta_publicacoes: true,
    meta_capi: true,
    api_webhooks: true,
    radar: true,
    r2_storage: true,
    treinamentos: true,
    permite_dapi_trial: false,
  },
  cortesia: {
    whatsapp_dapi: true,
    whatsapp_oficial: true,
    instagram: true,
    facebook: true,
    telegram: true,
    ia: true,
    agente_simples: true,
    rag_conhecimento: true,
    secretario_ia: true,
    analises_ia: true,
    agente_avancado: true,
    ferramentas_verificadas: true,
    automacoes: true,
    campanhas: true,
    meta_publicacoes: true,
    meta_capi: true,
    api_webhooks: true,
    radar: true,
    r2_storage: true,
    treinamentos: true,
    permite_dapi_trial: true,
  },
  enterprise: {
    whatsapp_dapi: true,
    whatsapp_oficial: true,
    instagram: true,
    facebook: true,
    telegram: true,
    ia: true,
    agente_simples: true,
    rag_conhecimento: true,
    secretario_ia: true,
    analises_ia: true,
    agente_avancado: true,
    ferramentas_verificadas: true,
    automacoes: true,
    campanhas: true,
    meta_publicacoes: true,
    meta_capi: true,
    api_webhooks: true,
    radar: true,
    r2_storage: true,
    treinamentos: true,
    permite_dapi_trial: true,
  },
};

export function normalizePlanFeatures(
  rawFeatures: unknown,
  slug?: string | null,
): Record<string, boolean> {
  const base: Record<string, boolean> = { ...DEFAULT_MODULES_BY_SLUG[normalizePlanSlug(slug)] };

  if (!rawFeatures) return base;

  if (typeof rawFeatures === "string") {
    try {
      const parsed = JSON.parse(rawFeatures);
      return normalizePlanFeatures(parsed, slug);
    } catch {
      return base;
    }
  }

  if (Array.isArray(rawFeatures)) {
    for (const item of rawFeatures) {
      const k = String(item || "").trim();
      if (k in base || PLAN_MODULE_MAP[k]) {
        base[k] = true;
      }
    }
    return base;
  }

  if (typeof rawFeatures === "object") {
    for (const [k, v] of Object.entries(rawFeatures as Record<string, unknown>)) {
      base[k] = Boolean(v);
    }
    return base;
  }

  return base;
}

export function extractEnabledModuleLabels(rawFeatures: unknown, slug?: string | null): string[] {
  const map = normalizePlanFeatures(rawFeatures, slug);
  return PLAN_MODULES
    .filter((m) => m.category !== "controle" && map[m.key])
    .map((m) => m.label);
}

export type PlanFeatures = {
  providersIA: Array<"gemini" | "openai" | "anthropic" | "drael">;
  googleCalendar: boolean;
  automacoes: boolean;
  apiWebhooks: boolean;
  relatoriosAvancados: boolean;
  suportePrioritario: boolean;
  financeiro: boolean;
};

export const PLAN_FEATURES: Record<PlanSlug, PlanFeatures> = {
  starter: {
    providersIA: ["gemini", "drael"],
    googleCalendar: false,
    automacoes: false,
    apiWebhooks: false,
    relatoriosAvancados: false,
    suportePrioritario: false,
    financeiro: false,
  },
  pro: {
    providersIA: ["gemini", "openai", "anthropic", "drael"],
    googleCalendar: true,
    automacoes: true,
    apiWebhooks: false,
    relatoriosAvancados: true,
    suportePrioritario: true,
    financeiro: true,
  },
  business: {
    providersIA: ["gemini", "openai", "anthropic", "drael"],
    googleCalendar: true,
    automacoes: true,
    apiWebhooks: true,
    relatoriosAvancados: true,
    suportePrioritario: true,
    financeiro: true,
  },
  cortesia: {
    providersIA: ["gemini", "openai", "anthropic", "drael"],
    googleCalendar: true,
    automacoes: true,
    apiWebhooks: true,
    relatoriosAvancados: true,
    suportePrioritario: true,
    financeiro: true,
  },
  enterprise: {
    providersIA: ["gemini", "openai", "anthropic", "drael"],
    googleCalendar: true,
    automacoes: true,
    apiWebhooks: true,
    relatoriosAvancados: true,
    suportePrioritario: true,
    financeiro: true,
  },
};

export const PLAN_LABEL: Record<PlanSlug, string> = {
  starter: "Starter",
  pro: "Pro",
  business: "Business",
  cortesia: "Cortesia Master",
  enterprise: "Enterprise / Master",
};

export function normalizePlanSlug(slug?: string | null): PlanSlug {
  const s = String(slug || "").toLowerCase();
  if (s === "enterprise" || s === "master") return "enterprise";
  if (s === "cortesia") return "cortesia";
  if (s === "pro" || s === "business" || s === "starter") return s as PlanSlug;
  return "starter";
}

export function featuresFor(slug?: string | null): PlanFeatures {
  return PLAN_FEATURES[normalizePlanSlug(slug)];
}

export function allowsProvider(slug: string | null | undefined, provider: string): boolean {
  if (
    !slug ||
    slug === "undefined" ||
    slug === "enterprise" ||
    slug === "cortesia" ||
    slug === "pro" ||
    slug === "business" ||
    slug === "master"
  ) {
    return true;
  }
  const f = featuresFor(slug);
  return f.providersIA.includes(provider as any);
}
