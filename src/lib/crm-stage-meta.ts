// src/lib/crm-stage-meta.ts

export interface StageAiMeta {
  criterio_ia: string;
  bloqueada_para_ia: boolean;
  mensagem_prompt: string;
}

export interface LeadAnalysisResult {
  resumo: string;
  intencao: "POSITIVA" | "NEGATIVA" | "NEUTRA" | "DUDOSA";
  etapa_sugerida_id: string;
  etapa_sugerida_nome: string;
  justificativa: string;
  calificado: boolean;
  sugestao_treinamento?: string | null;
  valor_sugerido?: number | null;
  produto_sugerido?: string | null;
  alerta_sla?: string | null;
}

export const DEFAULT_CRM_MASTER_PROMPT = `
Eres el Auditor Comercial y Analista de Inteligencia de Negocios del CRM.
Tu misión es evaluar la negociación completa entre el cliente y la empresa analizando de manera integral:
1. El historial cronológico de la conversación por mensajería.
2. Los datos y ficha completa del lead (etiquetas, tiempo en la etapa, formularios completados, notas de asesores).
3. El catálogo de productos y servicios de la empresa (precios de lista, si requieren agendamiento).
4. El estado de citas y agendamientos en el calendario (Google Meet / visitas).
5. El historial comercial de compras anteriores y cobros registrados.
6. Las políticas de venta, formas de pago y cupones de la empresa.

REGLAS DE AUDITORÍA:
1. Evalúa el estado real de la negociación contrastando todos los hechos contra los criterios específicos de cada etapa del embudo.
2. Si el lead ya tiene una cita confirmada en el calendario, NO sugieras enviarlo a una etapa de "Agendar", sino a la etapa correspondiente a "Cita Agendada" o "En Espera de Reunión".
3. Si el lead muestra interés en un producto específico del catálogo, identifica el producto oficial y sugiere el valor monetario correspondiente.
4. Si una etapa está marcada como "BLOQUEADA PARA IA", puedes sugerirla si cumple los requisitos pero ten en cuenta que un humano confirmará el movimiento.
5. Si el lead lleva demasiado tiempo en una etapa sin avances, señala el estancamiento (alerta SLA).
6. Detecta inconsistencias o dudas en los criterios para proponer sugerencias de mejora al entrenamiento del embudo.
7. Responde estrictamente con un único objeto JSON válido con los campos solicitados.
`.trim();

/**
 * Extrae de forma segura criterio_ia, bloqueada_para_ia y el prompt limpio de la régua,
 * priorizando las columnas nativas de crm_stage y manteniendo retrocompatibilidad
 * con etapas que hayan guardado JSON serializado(s) dentro de mensagem_prompt.
 */
export function resolveStageAiMeta(stage: {
  criterio_ia?: string | null;
  bloqueada_para_ia?: boolean | null;
  mensagem_prompt?: string | null;
} | null | undefined): StageAiMeta {
  if (!stage) {
    return { criterio_ia: "", bloqueada_para_ia: false, mensagem_prompt: "" };
  }

  let rawPrompt = String(stage.mensagem_prompt ?? "").trim();
  let legacyCriterio = "";
  let legacyBloqueada = false;

  // Desempacar recursivamente hasta 5 niveles por si hubo doble serialización previa
  for (let depth = 0; depth < 5; depth++) {
    if (rawPrompt.startsWith("{") && rawPrompt.endsWith("}")) {
      try {
        const parsed = JSON.parse(rawPrompt);
        if (typeof parsed === "object" && parsed !== null && ("criterio_ia" in parsed || "bloqueada_para_ia" in parsed || "mensagem_prompt" in parsed)) {
          if (parsed.criterio_ia && !legacyCriterio) legacyCriterio = String(parsed.criterio_ia);
          if (typeof parsed.bloqueada_para_ia === "boolean") legacyBloqueada = legacyBloqueada || parsed.bloqueada_para_ia;
          rawPrompt = String(parsed.mensagem_prompt ?? "").trim();
          continue;
        }
      } catch {
        break;
      }
    }
    break;
  }

  const hasNativeCriterio = typeof stage.criterio_ia === "string" && stage.criterio_ia.trim().length > 0;
  const hasNativeBloqueada = typeof stage.bloqueada_para_ia === "boolean";

  return {
    criterio_ia: hasNativeCriterio ? stage.criterio_ia!.trim() : legacyCriterio,
    bloqueada_para_ia: hasNativeBloqueada ? Boolean(stage.bloqueada_para_ia || legacyBloqueada) : legacyBloqueada,
    mensagem_prompt: rawPrompt,
  };
}

/**
 * Limpia y normaliza el texto de un nombre de etapa eliminando prefijos y comillas.
 */
export function cleanStageNameString(raw: string): string {
  let s = String(raw || "").trim();
  if (!s) return "";

  // 1. Si contiene texto entre comillas: '...', "...", “...”
  const quoteMatch = s.match(/['"“]([^'"“”]+)['"”]/);
  if (quoteMatch && quoteMatch[1].trim()) {
    return quoteMatch[1].trim();
  }

  // 2. Remover prefijos como "Crear Etapa:", "Nueva Etapa -", "Create stage:"
  s = s.replace(/^(?:crear|nueva|nova|adicionar|create|new|add)\s+(?:etapa|stage|phase)\s*[:\-–]?\s*/i, "").trim();

  // 3. Remover sufijos de tipo " (normal)" o similares
  s = s.replace(/\s*\((?:normal|ganho|perda|etapa|stage)\)$/i, "").trim();

  return s;
}

/**
 * Extrae y limpia el nombre de la etapa desde cualquier estructura de acción del Copilot,
 * tolerando nombres en español, inglés o portugués, y extrayendo de comillas o títulos.
 */
export function extractCleanStageName(item: any): string {
  if (!item) return "Nueva Etapa";
  const payload = item.payload && typeof item.payload === "object" ? item.payload : {};

  const candidates = [
    payload.nome,
    payload.name,
    payload.stageName,
    payload.stage_name,
    payload.nombre,
    payload.stage,
    payload.etapa,
    payload.title,
    item.nome,
    item.name,
    item.stageName,
    item.stage_name,
    item.nombre,
    item.stage,
    item.etapa,
    item.title,
    item.description,
  ];

  for (const c of candidates) {
    if (typeof c === "string" && c.trim().length > 0) {
      const clean = cleanStageNameString(c);
      if (clean) return clean;
    }
  }

  return "Nueva Etapa";
}
