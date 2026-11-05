// src/lib/crm-stage-meta.ts

export interface StageAiMeta {
  criterio_ia: string;
  bloqueada_para_ia: boolean;
  mensagem_prompt: string;
  meta_conversion_event?: string;
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
  proxima_acao_sugerida?: string | null;
  alerta_sla?: string | null;
}

export const DEFAULT_CRM_MASTER_PROMPT = `
Eres el Auditor Comercial y Analista de Ventas de CuentasTuPana, empresa especializada en suscripciones digitales y streaming (Disney+, Max, Paramount+, Prime Video, Crunchyroll, Canva Pro, Gemini Pro + 5TB).

TU MISIÓN:
Evaluar el estado real de cada cliente analizando la conversación completa de WhatsApp/Instagram/Messenger, las notas del equipo, los comprobantes de pago enviados y los productos solicitados según el catálogo oficial.

CATÁLOGO BASE Y PRECIOS REFERENCIALES (USD):
• Paramount+: $1.00 / mes
• Max (HBO): $1.50 - $2.00 / mes
• Prime Video: $1.50 / mes
• Crunchyroll Mega Fan: $1.50 / mes | Trimestral: $4.00 | Anual: $9.00
• Disney+ Estándar: $1.50 / mes | Disney+ Premium: $2.00 / mes
• Gemini Pro + 5TB (18 meses): $6.00
• Canva Pro Anual: $8.00

REGLAS ESENCIALES DE CLASIFICACIÓN:
1. VALORES Y MONEDA: Las cotizaciones pueden darse en USD o en Bolívares (Bs) a tasa del día, o en divisas digitales (USDT). El campo "valor_sugerido" debe reflejar el valor monetario en USD de la lista de productos (ej: si pide Crunchyroll trimestral, valor_sugerido es 4; si pide Gemini Pro, es 6). NUNCA coloques miles (ej. 6000) a menos que esté expresamente tasado en bolívares y se aclare la moneda.
2. FLUJO DE COMPROBANTES: Si el cliente envía una captura de transferencia, pago móvil o hash de pago, la etapa de destino es "Pago Enviado – Verificando". NO lo muevas a "Ganado" hasta que el asesor haya confirmado la entrega de credenciales.
3. CLIENTE CON FALLA TÉCNICA: Si el cliente ya tiene una cuenta previa y reporta que no puede entrar, clave caída o perfil ocupado, debe clasificarse en "SOPORTE" de inmediato, sin importar su etapa anterior.
4. RENOVACIONES: Si un cliente activo paga su siguiente mes del mismo producto, su flujo de renovación es: Pago Enviado → Ganado → Cliente Activo. Si pide un servicio distinto al que tiene, clasifícalo en "Cliente Recurrente – Nueva Cotización".
5. ETAPAS BLOQUEADAS: Si una etapa está bloqueada para IA (como Ganado o Atención humana), evalúa el cumplimiento de los requisitos pero ten en cuenta que un humano confirmará el movimiento.

Emite tu diagnóstico en JSON estricto con: resumo, intencao, etapa_sugerida_id, etapa_sugerida_nome, justificativa, calificado, valor_sugerido, produto_sugerido, proxima_acao_sugerida, alerta_sla, sugestao_treinamento.
`.trim();

/**
 * Extrae de forma segura criterio_ia, bloqueada_para_ia, meta_conversion_event y el prompt limpio de la régua,
 * priorizando las columnas nativas de crm_stage y manteniendo retrocompatibilidad
 * con etapas que hayan guardado JSON serializado(s) dentro de mensagem_prompt.
 */
export function resolveStageAiMeta(stage: {
  criterio_ia?: string | null;
  bloqueada_para_ia?: boolean | null;
  meta_conversion_event?: string | null;
  mensagem_prompt?: string | null;
} | null | undefined): StageAiMeta {
  if (!stage) {
    return { criterio_ia: "", bloqueada_para_ia: false, mensagem_prompt: "", meta_conversion_event: "" };
  }

  let rawPrompt = String(stage.mensagem_prompt ?? "").trim();
  let legacyCriterio = "";
  let legacyBloqueada = false;
  let legacyMetaEvent = "";

  // Desempacar recursivamente hasta 5 niveles por si hubo doble serialización previa
  for (let depth = 0; depth < 5; depth++) {
    if (rawPrompt.startsWith("{") && rawPrompt.endsWith("}")) {
      try {
        const parsed = JSON.parse(rawPrompt);
        if (typeof parsed === "object" && parsed !== null && ("criterio_ia" in parsed || "bloqueada_para_ia" in parsed || "mensagem_prompt" in parsed || "meta_conversion_event" in parsed)) {
          if (parsed.criterio_ia && !legacyCriterio) legacyCriterio = String(parsed.criterio_ia);
          if (typeof parsed.bloqueada_para_ia === "boolean") legacyBloqueada = legacyBloqueada || parsed.bloqueada_para_ia;
          if (parsed.meta_conversion_event && !legacyMetaEvent) legacyMetaEvent = String(parsed.meta_conversion_event);
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
  const hasNativeMetaEvent = typeof (stage as any).meta_conversion_event === "string" && (stage as any).meta_conversion_event.trim().length > 0;

  return {
    criterio_ia: hasNativeCriterio ? stage.criterio_ia!.trim() : legacyCriterio,
    bloqueada_para_ia: hasNativeBloqueada ? Boolean(stage.bloqueada_para_ia || legacyBloqueada) : legacyBloqueada,
    meta_conversion_event: hasNativeMetaEvent ? (stage as any).meta_conversion_event!.trim() : legacyMetaEvent,
    mensagem_prompt: rawPrompt,
  };
}

/**
 * Empaqueta de forma retrocompatible criterio_ia, bloqueada_para_ia y meta_conversion_event
 * dentro del campo mensagem_prompt si no se cuenta con columnas nativas.
 */
export function packStageAiMeta(meta: {
  criterio_ia?: string | null;
  bloqueada_para_ia?: boolean | null;
  meta_conversion_event?: string | null;
  mensagem_prompt?: string | null;
}): string {
  const criterio = (meta.criterio_ia || "").trim();
  const bloqueada = !!meta.bloqueada_para_ia;
  const metaEvent = (meta.meta_conversion_event || "").trim();
  const prompt = (meta.mensagem_prompt || "").trim();

  // Si no hay metadatos especiales, devolver el prompt tal cual
  if (!criterio && !bloqueada && !metaEvent) {
    return prompt;
  }

  return JSON.stringify({
    criterio_ia: criterio || undefined,
    bloqueada_para_ia: bloqueada ? true : undefined,
    meta_conversion_event: metaEvent || undefined,
    mensagem_prompt: prompt || undefined,
  });
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
