import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveCompanyIdCached } from "./company-cache";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { lovableAiChat, type ChatMsg } from "@/lib/lovable-ai.server";
import { moveCardToStage } from "@/lib/crm-engine.server";

export interface StageAiMeta {
  criterio_ia?: string;
  bloqueada_para_ia?: boolean;
  mensagem_prompt?: string;
}

export function parseStageAiMeta(rawPrompt: string | null | undefined): StageAiMeta {
  if (!rawPrompt) return { criterio_ia: "", bloqueada_para_ia: false, mensagem_prompt: "" };
  const trimmed = rawPrompt.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed === "object" && parsed !== null) {
        return {
          criterio_ia: parsed.criterio_ia || "",
          bloqueada_para_ia: !!parsed.bloqueada_para_ia,
          mensagem_prompt: parsed.mensagem_prompt || "",
        };
      }
    } catch {
      // not JSON, fallback to raw
    }
  }
  return { criterio_ia: "", bloqueada_para_ia: false, mensagem_prompt: rawPrompt };
}

export function formatStageAiMeta(meta: StageAiMeta): string {
  if (!meta.criterio_ia && !meta.bloqueada_para_ia) {
    return meta.mensagem_prompt || "";
  }
  return JSON.stringify({
    criterio_ia: meta.criterio_ia || "",
    bloqueada_para_ia: !!meta.bloqueada_para_ia,
    mensagem_prompt: meta.mensagem_prompt || "",
  });
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

/**
 * Prompt Maestro Base predeterminado para el Bot Analista de Leads CRM.
 */
const DEFAULT_CRM_MASTER_PROMPT = `
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
 * Función central de análisis profundo de un lead (lee hasta 100 mensajes).
 */
export async function analyzeLeadInternal(
  companyId: string,
  cardId: string,
): Promise<{
  ok: boolean;
  result: LeadAnalysisResult | null;
  currentStage: { id: string; nome: string } | null;
  suggestedStageBlocked: boolean;
  error?: string;
}> {
  // 1. Obtener datos del lead card
  const { data: card, error: cardError } = await supabaseAdmin
    .from("crm_cards")
    .select("id, company_id, pipeline_id, stage_id, numero, nome, valor, campos_extras, canal_chat")
    .eq("id", cardId)
    .eq("company_id", companyId)
    .maybeSingle();

  if (cardError || !card) {
    return { ok: false, result: null, currentStage: null, suggestedStageBlocked: false, error: "Lead no encontrado" };
  }

  // 2. Obtener historial extenso de mensajes (hasta 100 mensajes)
  const { data: messages } = await supabaseAdmin
    .from("mensagens")
    .select("id, direcao, autor, texto, created_at, midia_tipo")
    .eq("company_id", companyId)
    .eq("numero", card.numero)
    .order("created_at", { ascending: true })
    .limit(100);

  if (!messages || messages.length === 0) {
    return {
      ok: false,
      result: null,
      currentStage: null,
      suggestedStageBlocked: false,
      error: "No hay mensajes registrados en esta conversación para analizar.",
    };
  }

  // 3. Obtener el embudo y las etapas disponibles
  let pipelineId = card.pipeline_id;
  if (!pipelineId) {
    const { data: firstPipe } = await supabaseAdmin
      .from("crm_pipeline")
      .select("id")
      .eq("company_id", companyId)
      .order("ordem", { ascending: true })
      .limit(1)
      .maybeSingle();
    pipelineId = firstPipe?.id;
  }

  const [{ data: pipeline }, { data: rawStages }] = await Promise.all([
    pipelineId
      ? supabaseAdmin.from("crm_pipeline").select("id, nome, agent_id").eq("id", pipelineId).maybeSingle()
      : Promise.resolve({ data: null }),
    pipelineId
      ? supabaseAdmin
          .from("crm_stage")
          .select("id, nome, cor, tipo, ordem, mensagem_prompt, agent_id")
          .eq("pipeline_id", pipelineId)
          .order("ordem", { ascending: true })
      : Promise.resolve({ data: [] }),
  ]);

  const stages = (rawStages || []).map((st: any) => {
    const meta = parseStageAiMeta(st.mensagem_prompt);
    return {
      id: st.id,
      nome: st.nome,
      tipo: st.tipo,
      criterio_ia: meta.criterio_ia,
      bloqueada_para_ia: meta.bloqueada_para_ia,
    };
  });

  const currentStage = stages.find((s) => s.id === card.stage_id) || null;

  // 4. Formatear la transcripción de la conversación (80-100 mensajes)
  const formattedTranscript = messages
    .map((m: any) => {
      const fecha = m.created_at ? new Date(m.created_at).toLocaleString("es-ES", { timeZone: "America/Caracas" }) : "";
      const emisor = m.direcao === "entrada" ? `Cliente (${card.nome || card.numero})` : `Asesor / Sistema`;
      const contenido = m.texto || (m.midia_tipo ? `[Archivo adjunto: ${m.midia_tipo}]` : "[Mensaje sin texto]");
      return `[${fecha}] ${emisor}: ${contenido}`;
    })
    .join("\n");

  // 5. Construir el catálogo de etapas para el prompt
  const stagesPromptBlock = stages
    .map((s, idx) => {
      const criterio = s.criterio_ia ? `\n   Criterio de clasificación: ${s.criterio_ia}` : "";
      const bloqueo = s.bloqueada_para_ia ? `\n   [ATENCIÓN: Etapa Bloqueada para IA - Requiere confirmación humana]` : "";
      return `${idx + 1}. Etapa: "${s.nome}" (ID: ${s.id}, Tipo: ${s.tipo})${criterio}${bloqueo}`;
    })
    .join("\n\n");

  // 6. Preparar el Master Prompt analítico
  const { data: defaultAgent } = await supabaseAdmin
    .from("agent_config")
    .select("idioma")
    .eq("company_id", companyId)
    .eq("is_default", true)
    .maybeSingle();

  const langCode = (defaultAgent?.idioma || "es").toLowerCase();
  const langLabel = langCode.startsWith("pt") ? "Português" : langCode.startsWith("en") ? "English" : "Español";
  const systemPrompt = `
${DEFAULT_CRM_MASTER_PROMPT}

EMBUDO DE VENTAS ACTIVO: "${pipeline?.nome || 'Comercial'}"
ETAPAS CONFIGURADAS Y SUS CRITERIOS:
${stagesPromptBlock}

IDIOMA DE RESPUESTA OBLIGATORIO:
Emite los campos de texto ("resumo", "justificativa", "sugestao_treinamento") estrictamente en \${langLabel}.

INSTRUCCIONES DE SALIDA:
Analiza la conversación que se adjunta y responde OBLIGATORIAMENTE con un único bloque JSON válido con el siguiente formato:
{
  "resumo": "Resumen ejecutivo en 2 oraciones del estado de la negociación",
  "intencao": "POSITIVA" | "NEGATIVA" | "NEUTRA" | "DUDOSA",
  "etapa_sugerida_id": "ID exacto de la etapa correspondiente a la lista de arriba",
  "etapa_sugerida_nome": "Nombre exacto de la etapa sugerida",
  "justificativa": "Explicación concisa de por qué el lead debe estar en esta etapa según los criterios",
  "calificado": true o false,
  "sugestao_treinamento": "Opcional: Si detectas que falta un criterio o hay una duda en las etapas, explica qué regla añadir (o null si todo está claro)"
}
`.trim();

  // 7. Llamar al motor de IA
  const chatMessages: ChatMsg[] = [
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: `A continuación tienes la transcripción completa de los últimos ${messages.length} mensajes con el cliente:\n\n${formattedTranscript}\n\nEmite tu diagnóstico y clasificación en formato JSON:`,
    },
  ];

  let rawAiOutput = "";
  try {
    rawAiOutput = await lovableAiChat(chatMessages, {
      provider: "gemini",
      model: "google/gemini-2.5-flash",
    });
  } catch (err: any) {
    return {
      ok: false,
      result: null,
      currentStage: currentStage ? { id: currentStage.id, nome: currentStage.nome } : null,
      suggestedStageBlocked: false,
      error: `Error al consultar la IA: ${err?.message || String(err)}`,
    };
  }

  // 8. Parsear JSON de salida
  let parsedResult: LeadAnalysisResult | null = null;
  try {
    const jsonMatch = rawAiOutput.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      parsedResult = JSON.parse(jsonMatch[0]) as LeadAnalysisResult;
    }
  } catch (e: any) {
    console.warn("[crm-lead-analyzer] Fallo al parsear JSON:", rawAiOutput);
  }

  if (!parsedResult || !parsedResult.etapa_sugerida_id) {
    return {
      ok: false,
      result: null,
      currentStage: currentStage ? { id: currentStage.id, nome: currentStage.nome } : null,
      suggestedStageBlocked: false,
      error: "La IA no generó una clasificación válida en JSON.",
    };
  }

  // Validar si la etapa sugerida existe
  const targetStage = stages.find((s) => s.id === parsedResult?.etapa_sugerida_id || s.nome.toLowerCase() === parsedResult?.etapa_sugerida_nome?.toLowerCase());
  if (targetStage) {
    parsedResult.etapa_sugerida_id = targetStage.id;
    parsedResult.etapa_sugerida_nome = targetStage.nome;
  }

  const suggestedStageBlocked = Boolean(targetStage?.bloqueada_para_ia);

  // 9. Persistir diagnóstico en campos_extras del lead sin romper nada
  try {
    const prevExtras = (card.campos_extras as Record<string, any>) || {};
    await supabaseAdmin
      .from("crm_cards")
      .update({
        campos_extras: {
          ...prevExtras,
          ultimo_analise_ia_em: new Date().toISOString(),
          ultimo_diagnostico_ia: parsedResult,
        },
      } as any)
      .eq("id", card.id);
  } catch (e) {
    console.warn("[crm-lead-analyzer] Error al guardar diagnostico en campos_extras:", e);
  }

  return {
    ok: true,
    result: parsedResult,
    currentStage: currentStage ? { id: currentStage.id, nome: currentStage.nome } : null,
    suggestedStageBlocked,
  };
}

/**
 * Server Function: Botón bajo demanda desde el Lead Drawer.
 */
export const analyzeLeadNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { cardId: string }) => {
    if (!d?.cardId) throw new Error("cardId requerido");
    return { cardId: d.cardId };
  })
  .handler(async ({ context, data }) => {
    const companyId = await resolveCompanyIdCached(context.supabase, context.userId);
    return analyzeLeadInternal(companyId, data.cardId);
  });

/**
 * Server Function: Mover etapa del lead en 1 clic tras el análisis.
 */
export const applyStageMovement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { cardId: string; stageId: string }) => {
    if (!d?.cardId || !d?.stageId) throw new Error("cardId y stageId son requeridos");
    return { cardId: d.cardId, stageId: d.stageId };
  })
  .handler(async ({ context, data }) => {
    const companyId = await resolveCompanyIdCached(context.supabase, context.userId);
    await moveCardToStage(supabaseAdmin, data.cardId, data.stageId);

    try {
      await supabaseAdmin.from("lead_evento").insert({
        company_id: companyId,
        card_id: data.cardId,
        tipo: "mudanca_etapa",
        descricao: "Etapa actualizada por recomendación del Bot Analista de CRM",
      });
    } catch {
      // best-effort
    }

    return { ok: true, stageId: data.stageId };
  });

/**
 * Función de análisis en segundo plano con Cooldown de 30 minutos.
 * Llamada desde el webhook/inbound automation tras nuevos mensajes.
 */
export async function checkAndAnalyzeLeadCooldown(
  companyId: string,
  numero: string,
): Promise<{ triggered: boolean; reason?: string }> {
  try {
    const { data: card } = await supabaseAdmin
      .from("crm_cards")
      .select("id, stage_id, campos_extras, updated_at")
      .eq("company_id", companyId)
      .eq("numero", numero)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!card) return { triggered: false, reason: "card_not_found" };

    const extras = (card.campos_extras as Record<string, any>) || {};
    const ultimoAnalise = extras.ultimo_analise_ia_em ? new Date(extras.ultimo_analise_ia_em).getTime() : 0;
    const now = Date.now();
    const treintaMinutosMs = 30 * 60 * 1000;

    // Regla de los 30 minutos: solo corre si han pasado al menos 30 min del último análisis
    if (ultimoAnalise && now - ultimoAnalise < treintaMinutosMs) {
      const restantesMin = Math.round((treintaMinutosMs - (now - ultimoAnalise)) / 60000);
      return { triggered: false, reason: `cooldown_active_${restantesMin}m_left` };
    }

    // Ejecutar el análisis profundo en segundo plano
    const analysis = await analyzeLeadInternal(companyId, card.id);
    if (analysis.ok && analysis.result && analysis.result.etapa_sugerida_id !== card.stage_id) {
      // Si la etapa recomendada NO está bloqueada para la IA, moverla automáticamente
      if (!analysis.suggestedStageBlocked) {
        console.log(`[crm-lead-analyzer] Auto-moving lead ${numero} to ${analysis.result.etapa_sugerida_nome}`);
        await moveCardToStage(supabaseAdmin, card.id, analysis.result.etapa_sugerida_id);
      } else {
        console.log(`[crm-lead-analyzer] Stage ${analysis.result.etapa_sugerida_nome} is blocked for AI. Retaining diagnostic.`);
      }
    }

    return { triggered: true };
  } catch (err: any) {
    console.warn("[crm-lead-analyzer] checkAndAnalyzeLeadCooldown failed:", err?.message);
    return { triggered: false, reason: err?.message };
  }
}
