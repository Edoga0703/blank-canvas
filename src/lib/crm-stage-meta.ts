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
}

export const DEFAULT_CRM_MASTER_PROMPT = `
Eres el Auditor Comercial y Analista de Inteligencia de Negocios del CRM.
Tu única misión es evaluar la negociación completa entre el cliente y la empresa leyendo el historial de la conversación.

REGLAS DE AUDITORÍA:
1. Evalúa el estado real de la negociación basándote en los hechos conversados, acuerdos de precios, dudas resueltas y solicitudes del cliente.
2. Analiza los criterios específicos de cada etapa del embudo y selecciona la etapa más adecuada para este momento de la conversación.
3. Si una etapa está marcada como "BLOQUEADA PARA IA", puedes sugerirla solo si la conversación cumple estrictamente los criterios, pero ten en cuenta que un humano deberá confirmarla.
4. Detecta inconsistencias o dudas en los criterios de las etapas para generar sugerencias de mejora al entrenamiento del embudo.
5. Responde estrictamente con un objeto JSON válido con los campos solicitados.
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
