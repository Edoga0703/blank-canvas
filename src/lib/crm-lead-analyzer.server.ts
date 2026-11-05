// src/lib/crm-lead-analyzer.server.ts
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { lovableAiChat, type ChatMsg } from "@/lib/lovable-ai.server";
import { globalAiLimiter } from "./ai-limiter.server";
import { moveCardToStage, pickLeadOwner } from "@/lib/crm-engine.server";
import {
  resolveStageAiMeta,
  DEFAULT_CRM_MASTER_PROMPT,
  type StageAiMeta,
  type LeadAnalysisResult,
} from "./crm-stage-meta";
import {
  gatherLeadComprehensiveContext,
  formatComprehensiveContextForPrompt,
} from "./crm-lead-context.server";

export { resolveStageAiMeta, DEFAULT_CRM_MASTER_PROMPT, type StageAiMeta, type LeadAnalysisResult };

export const parseStageAiMeta = (rawPrompt: string | null | undefined) =>
  resolveStageAiMeta({ mensagem_prompt: rawPrompt });
export const formatStageAiMeta = (meta: Partial<StageAiMeta>) =>
  String(meta.mensagem_prompt ?? "").trim();

export { analyzeLeadNow, applyStageMovement } from "./crm-lead-analyzer.functions";

// Mapa en memoria para encolar re-análisis cuando llegan mensajes dentro de la ventana de cooldown
const pendingCooldownTimers = new Map<string, ReturnType<typeof setTimeout>>();
const runningLeadLocks = new Set<string>();

export const INACTIVITY_WINDOW_MS = 30 * 60 * 1000; // 30 minutos de inactividad de conversación

export function isLeadEligibleForInactivityAnalysis(
  card: {
    ultima_em?: string | null;
    campos_extras?: any;
    ultimo_analise_ia_em?: string | null;
    created_at?: string | null;
    updated_at?: string | null;
  },
  nowMs: number = Date.now(),
): boolean {
  const timestamp = card.ultima_em || (card as any).updated_at || (card as any).created_at;
  if (!timestamp) return false;
  const ultimaEmMs = new Date(timestamp).getTime();
  if (isNaN(ultimaEmMs)) return false;

  // 1. Debe haber al menos 30 minutos de silencio continuo
  const silenceElapsedMs = nowMs - ultimaEmMs;
  if (silenceElapsedMs < INACTIVITY_WINDOW_MS) {
    return false; // Chat activo o interacción reciente
  }

  // 2. Verificar cuándo fue el último análisis realizado
  const extras = card.campos_extras && typeof card.campos_extras === "object" ? card.campos_extras : {};
  const lastAnaliseStr = (card as any).ultimo_analise_ia_em || extras.ultimo_analise_ia_em;
  if (!lastAnaliseStr) {
    return true; // Nunca analizado y ya tiene >= 30m inactivo -> Elegible
  }

  const lastAnaliseMs = new Date(lastAnaliseStr).getTime();
  if (isNaN(lastAnaliseMs)) return true;

  // 3. Hubo interacción posterior al último análisis
  return ultimaEmMs > lastAnaliseMs;
}

export async function analyzeLeadInternal(
  companyId: string,
  cardId: string,
  priority: 1 | 2 | 3 = 1,
): Promise<{
  ok: boolean;
  result: LeadAnalysisResult | null;
  currentStage: { id: string; nome: string } | null;
  suggestedStageBlocked: boolean;
  analyzedAt?: string;
  error?: string;
}> {
  const { data: card, error: cardError } = await supabaseAdmin
    .from("crm_cards")
    .select("*")
    .eq("id", cardId)
    .eq("company_id", companyId)
    .maybeSingle();

  if (cardError || !card) {
    return { ok: false, result: null, currentStage: null, suggestedStageBlocked: false, error: "Lead no encontrado" };
  }

  const { data: messages } = await supabaseAdmin
    .from("mensagens")
    .select("id, direcao, autor, texto, created_at, midia_tipo")
    .eq("company_id", companyId)
    .eq("numero", card.numero)
    .order("created_at", { ascending: false })
    .limit(100);

  const orderedMessages = (messages || []).slice().reverse();

  let pipelineId = card.pipeline_id;
  if (!pipelineId && card.stage_id) {
    const { data: stPipe } = await supabaseAdmin
      .from("crm_stage")
      .select("pipeline_id")
      .eq("id", card.stage_id)
      .maybeSingle();
    pipelineId = stPipe?.pipeline_id ?? null;
  }
  if (!pipelineId) {
    const { data: firstPipe } = await supabaseAdmin
      .from("crm_pipeline")
      .select("id")
      .eq("company_id", companyId)
      .order("ordem", { ascending: true })
      .limit(1)
      .maybeSingle();
    pipelineId = firstPipe?.id ?? null;
  }

  const [{ data: pipeline }, { data: rawStages }, comprehensiveLeadCtx] = await Promise.all([
    pipelineId
      ? supabaseAdmin
          .from("crm_pipeline")
          .select("*")
          .eq("id", pipelineId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    pipelineId
      ? supabaseAdmin
          .from("crm_stage")
          .select("*")
          .eq("pipeline_id", pipelineId)
          .order("ordem", { ascending: true })
      : Promise.resolve({ data: [] }),
    gatherLeadComprehensiveContext(supabaseAdmin, companyId, card),
  ]);

  let finalStages = rawStages || [];
  if (finalStages.length === 0) {
    const { data: anyStages } = await supabaseAdmin
      .from("crm_stage")
      .select("*")
      .eq("company_id", companyId)
      .order("ordem", { ascending: true });
    finalStages = anyStages || [];
  }

  const stages = finalStages.map((st: any) => {
    const meta = resolveStageAiMeta(st);
    return {
      id: st.id,
      nome: st.nome,
      tipo: st.tipo,
      modo_atendimento: st.modo_atendimento,
      criterio_ia: meta.criterio_ia,
      bloqueada_para_ia: meta.bloqueada_para_ia,
    };
  });

  if (stages.length === 0) {
    return {
      ok: false,
      result: null,
      currentStage: null,
      suggestedStageBlocked: false,
      error: "El embudo no tiene etapas configuradas.",
    };
  }

  const currentStage = stages.find((s) => s.id === card.stage_id) || null;

  // Si aún no hay filas en `mensagens`, verificar si el lead tiene contexto de formulario, notas, citas o mensaje inicial
  const hasAlternativeContext = Boolean(
    card.ultima_mensagem ||
      card.observacao ||
      (Array.isArray((card.campos_extras as any)?.respostas) && (card.campos_extras as any).respostas.length > 0) ||
      (comprehensiveLeadCtx?.formSubmissions && comprehensiveLeadCtx.formSubmissions.length > 0) ||
      (comprehensiveLeadCtx?.notas && comprehensiveLeadCtx.notas.length > 0) ||
      (comprehensiveLeadCtx?.agendamentos && comprehensiveLeadCtx.agendamentos.length > 0),
  );

  if (orderedMessages.length === 0 && !hasAlternativeContext) {
    return {
      ok: false,
      result: null,
      currentStage: currentStage ? { id: currentStage.id, nome: currentStage.nome } : null,
      suggestedStageBlocked: false,
      error: "No hay mensajes ni datos de formulario registrados para analizar.",
    };
  }

  // Resolver el agente del embudo o el predeterminado de la empresa para idioma y proveedor IA
  let agentQuery = supabaseAdmin
    .from("agent_config")
    .select("idioma, ai_provider, ai_model")
    .eq("company_id", companyId);

  if (pipeline?.agent_id) {
    agentQuery = agentQuery.eq("id", pipeline.agent_id);
  } else {
    agentQuery = agentQuery.order("is_default", { ascending: false }).order("updated_at", { ascending: true });
  }
  const { data: agentRows } = await agentQuery.limit(1);
  const activeAgent = agentRows?.[0] || null;

  const langCode = String(activeAgent?.idioma || "es").toLowerCase();
  const langLabel = langCode.startsWith("pt") ? "Português" : langCode.startsWith("en") ? "English" : "Español";
  const localeForDates = langCode.startsWith("pt") ? "pt-BR" : langCode.startsWith("en") ? "en-US" : "es-ES";

  const formattedTranscript =
    orderedMessages.length > 0
      ? orderedMessages
          .map((m: any) => {
            const fecha = m.created_at ? new Date(m.created_at).toLocaleString(localeForDates) : "";
            const emisor = m.direcao === "entrada" ? `Cliente (${card.nome || card.numero})` : `Asesor / Sistema (${m.autor || "empresa"})`;
            const contenido = m.texto || (m.midia_tipo ? `[Archivo adjunto: ${m.midia_tipo}]` : "[Mensaje sin texto]");
            return `[${fecha}] ${emisor}: ${contenido}`;
          })
          .join("\n")
      : `[Captura de Lead (${card.canal_entrada || card.origem || "CRM"})]: ${card.ultima_mensagem || "Lead registrado en el embudo"}`;

  const stagesPromptBlock = stages
    .map((s, idx) => {
      const criterio = s.criterio_ia ? `\n   Criterio de clasificación: ${s.criterio_ia}` : "";
      const bloqueo = s.bloqueada_para_ia ? `\n   [ATENCIÓN: Etapa Bloqueada para IA - Requiere confirmación humana]` : "";
      return `${idx + 1}. Etapa: "${s.nome}" (ID: ${s.id}, Tipo: ${s.tipo})${criterio}${bloqueo}`;
    })
    .join("\n\n");

  const rawPipePrompt = (pipeline as any)?.crm_master_prompt;
  const masterPrompt =
    rawPipePrompt && String(rawPipePrompt).trim().length > 0
      ? String(rawPipePrompt).trim()
      : DEFAULT_CRM_MASTER_PROMPT;

  const formattedComprehensiveContext = comprehensiveLeadCtx
    ? formatComprehensiveContextForPrompt(comprehensiveLeadCtx, localeForDates)
    : `FICHA BÁSICA DEL LEAD:\n- Nombre / Teléfono: ${card.nome || card.numero}\n- Valor: ${card.valor || 0}`;

  const systemPrompt = `
${masterPrompt}

EMBUDO DE VENTAS ACTIVO: "${pipeline?.nome || "Atención y ventas"}"
ETAPA ACTUAL DEL LEAD: "${currentStage?.nome || "Sin etapa"}" (ID: ${currentStage?.id || "N/A"})

ETAPAS CONFIGURADAS Y SUS CRITERIOS:
${stagesPromptBlock}

INFORMACIÓN COMERCIAL INTEGRAL DEL LEAD, CATÁLOGO Y OPERACIONES:
${formattedComprehensiveContext}

IDIOMA DE RESPUESTA OBLIGATORIO:
Emite los campos de texto ("resumo", "justificativa", "sugestao_treinamento", "alerta_sla", "produto_sugerido", "proxima_acao_sugerida") estrictamente en ${langLabel}.

INSTRUCCIONES DE SALIDA:
Analiza la conversación y todos los datos del lead (ficha, catálogo, notas del equipo, citas, formularios y ventas previas).
Responde OBLIGATORIAMENTE con un único bloque JSON válido con el siguiente formato:
{
  "resumo": "Resumen ejecutivo en 2 oraciones del estado de la negociación",
  "intencao": "POSITIVA" | "NEGATIVA" | "NEUTRA" | "DUDOSA",
  "etapa_sugerida_id": "ID exacto de la etapa correspondiente a la lista de arriba",
  "etapa_sugerida_nome": "Nombre exacto de la etapa sugerida",
  "justificativa": "Explicación concisa contrastando la conversación, notas, agenda y catálogo contra los criterios de la etapa",
  "calificado": true o false,
  "valor_sugerido": número con el valor monetario sugerido del negocio según el catálogo si aplica (ej: 1200) o null,
  "produto_sugerido": "Nombre exacto del producto del catálogo si aplica o null",
  "proxima_acao_sugerida": "Siguiente paso comercial concreto que debe ejecutar el asesor o null",
  "alerta_sla": "Aviso breve si detectas estancamiento en la etapa según el tiempo transcurrido o null",
  "sugestao_treinamento": "Opcional: Si detectas que falta un criterio o hay una duda en las etapas, explica qué regla añadir (o null si todo está claro)"
}
`.trim();

  const chatMessages: ChatMsg[] = [
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: `A continuación tienes el registro de interacción del cliente:\n\n${formattedTranscript}\n\nEmite tu diagnóstico y clasificación en formato JSON:`,
    },
  ];

  let rawAiOutput = "";
  try {
    rawAiOutput = await globalAiLimiter.schedule(
      () =>
        lovableAiChat(chatMessages, {
          provider: activeAgent?.ai_provider || "gemini",
          model: activeAgent?.ai_model || "google/gemini-2.5-flash",
        }),
      priority,
    );
  } catch (err: any) {
    return {
      ok: false,
      result: null,
      currentStage: currentStage ? { id: currentStage.id, nome: currentStage.nome } : null,
      suggestedStageBlocked: false,
      error: `Error al consultar la IA: ${err?.message || String(err)}`,
    };
  }

  let parsedResult: LeadAnalysisResult | null = null;
  try {
    const jsonMatch = rawAiOutput.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      parsedResult = JSON.parse(jsonMatch[0]) as LeadAnalysisResult;
    }
  } catch {
    console.warn("[crm-lead-analyzer] Fallo al parsear JSON:", rawAiOutput);
  }

  if (!parsedResult || (!parsedResult.etapa_sugerida_id && !parsedResult.etapa_sugerida_nome)) {
    return {
      ok: false,
      result: null,
      currentStage: currentStage ? { id: currentStage.id, nome: currentStage.nome } : null,
      suggestedStageBlocked: false,
      error: "La IA no generó una clasificación válida en JSON.",
    };
  }

  const targetStage =
    stages.find((s) => s.id === parsedResult?.etapa_sugerida_id) ||
    stages.find((s) => s.nome.toLowerCase() === String(parsedResult?.etapa_sugerida_nome || "").toLowerCase());

  if (!targetStage) {
    return {
      ok: false,
      result: null,
      currentStage: currentStage ? { id: currentStage.id, nome: currentStage.nome } : null,
      suggestedStageBlocked: false,
      error: `La etapa sugerida ("${parsedResult.etapa_sugerida_nome}") no pertenece a este embudo.`,
    };
  }

  parsedResult.etapa_sugerida_id = targetStage.id;
  parsedResult.etapa_sugerida_nome = targetStage.nome;
  const suggestedStageBlocked = Boolean(targetStage.bloqueada_para_ia);
  const nowIso = new Date().toISOString();

  try {
    const { data: freshCard } = await supabaseAdmin
      .from("crm_cards")
      .select("campos_extras, valor, item_nome")
      .eq("id", card.id)
      .maybeSingle();
    const prevExtras =
      freshCard?.campos_extras && typeof freshCard.campos_extras === "object"
        ? (freshCard.campos_extras as Record<string, any>)
        : {};

    const updates: Record<string, any> = {
      campos_extras: {
        ...prevExtras,
        ultimo_analise_ia_em: nowIso,
        ultimo_diagnostico_ia: parsedResult,
      },
      updated_at: nowIso,
    };

    if (parsedResult.valor_sugerido && typeof parsedResult.valor_sugerido === "number" && (!freshCard?.valor || Number(freshCard.valor) === 0)) {
      updates.valor = parsedResult.valor_sugerido;
    }

    if (parsedResult.produto_sugerido && typeof parsedResult.produto_sugerido === "string" && !freshCard?.item_nome) {
      updates.item_nome = parsedResult.produto_sugerido;
    }

    if (parsedResult.proxima_acao_sugerida && typeof parsedResult.proxima_acao_sugerida === "string") {
      updates.proxima_acao = parsedResult.proxima_acao_sugerida.trim().slice(0, 240);
    }

    await supabaseAdmin
      .from("crm_cards")
      .update(updates as any)
      .eq("id", card.id);
  } catch (e) {
    console.warn("[crm-lead-analyzer] Error al guardar diagnóstico:", e);
  }

  return {
    ok: true,
    result: parsedResult,
    currentStage: currentStage ? { id: currentStage.id, nome: currentStage.nome } : null,
    suggestedStageBlocked,
    analyzedAt: nowIso,
  };
}

/**
 * Ejecuta el análisis de un lead e impacta el movimiento automático si corresponde.
 */
async function executeAutoLeadAnalysisAndMove(
  companyId: string,
  cardId: string,
  priority: 1 | 2 | 3 = 2,
): Promise<{ triggered: boolean; reason?: string }> {
  const lockKey = `${companyId}:${cardId}`;
  if (runningLeadLocks.has(lockKey)) {
    return { triggered: false, reason: "already_running" };
  }
  runningLeadLocks.add(lockKey);

  try {
    const { data: card } = await supabaseAdmin
      .from("crm_cards")
      .select("id, stage_id, owner_id")
      .eq("id", cardId)
      .eq("company_id", companyId)
      .maybeSingle();

    if (!card) return { triggered: false, reason: "card_not_found" };

    const analysis = await analyzeLeadInternal(companyId, card.id, priority);
    if (analysis.ok && analysis.result && analysis.result.etapa_sugerida_id !== card.stage_id) {
      if (!analysis.suggestedStageBlocked) {
        const { data: destStage } = await supabaseAdmin
          .from("crm_stage")
          .select("id, nome, modo_atendimento")
          .eq("id", analysis.result.etapa_sugerida_id)
          .maybeSingle();

        const extra: Record<string, any> = {};
        if (!card.owner_id && destStage?.modo_atendimento === "manual") {
          const assignedOwner = await pickLeadOwner(supabaseAdmin, companyId, analysis.result.etapa_sugerida_id);
          if (assignedOwner) extra.owner_id = assignedOwner;
        }

        await moveCardToStage(supabaseAdmin, card.id, analysis.result.etapa_sugerida_id, extra);

        try {
          await supabaseAdmin.from("lead_evento").insert({
            company_id: companyId,
            card_id: card.id,
            tipo: "mudanca_etapa",
            descricao: `Movido automáticamente a "${analysis.result.etapa_sugerida_nome}" por el Analista de IA (${analysis.result.justificativa.slice(0, 140)})`,
          });
        } catch {
          // best-effort
        }
      } else {
        try {
          await supabaseAdmin.from("lead_evento").insert({
            company_id: companyId,
            card_id: card.id,
            tipo: "atualizacao",
            descricao: `IA sugiere mover a etapa protegida "${analysis.result.etapa_sugerida_nome}" (requiere confirmación humana)`,
          });
        } catch {
          // best-effort
        }
      }
    }

    return { triggered: true };
  } finally {
    runningLeadLocks.delete(lockKey);
  }
}

export async function checkAndAnalyzeLeadCooldown(
  companyId: string,
  numero: string,
): Promise<{ triggered: boolean; scheduled?: boolean; reason?: string }> {
  try {
    const cleanNum = String(numero || "").replace(/\D/g, "");
    const { data: card } = await (supabaseAdmin as any)
      .from("crm_cards")
      .select("id, stage_id, owner_id, campos_extras, updated_at, ultima_em")
      .eq("company_id", companyId)
      .in("numero", cleanNum && cleanNum !== numero ? [numero, cleanNum] : [numero])
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!card) return { triggered: false, reason: "card_not_found" };

    const now = Date.now();
    const eligible = isLeadEligibleForInactivityAnalysis(card, now);
    if (!eligible) {
      // El chat está en curso; aprovechamos el pulso para drenar 1 lead histórico inactivo
      void sweepOpportunisticInactiveLeads(companyId, 1);
      return {
        triggered: false,
        scheduled: false,
        reason: "waiting_for_30m_inactivity",
      };
    }

    return await executeAutoLeadAnalysisAndMove(companyId, card.id, 2);
  } catch (err: any) {
    console.warn("[crm-lead-analyzer] checkAndAnalyzeLeadCooldown failed:", err?.message);
    return { triggered: false, reason: err?.message };
  }
}

/**
 * Barrido automático de leads pendientes con inactividad >= 30 minutos.
 * Usa un pool con semáforo global para balancear velocidad sin saturar Drael ni generar 429.
 */
export async function analyzePendingCompanyLeads(
  companyId?: string | null,
  limit: number = 15,
): Promise<{ scanned: number; analyzed: number }> {
  try {
    let query = (supabaseAdmin as any)
      .from("crm_cards")
      .select("id, company_id, numero, ultima_em, campos_extras, stage_id")
      .or("tipo_contato.is.null,tipo_contato.neq.interno")
      .order("ultima_em", { ascending: false })
      .limit(150);

    if (companyId) {
      query = query.eq("company_id", companyId);
    }

    const { data: cards, error } = await query;
    if (error || !cards || cards.length === 0) return { scanned: 0, analyzed: 0 };

    const nowMs = Date.now();
    const candidates = cards.filter((c: any) => isLeadEligibleForInactivityAnalysis(c, nowMs));

    const batch = candidates.slice(0, Math.max(1, Math.min(limit, 25)));
    let analyzedCount = 0;

    const CHUNK_SIZE = 2;
    for (let i = 0; i < batch.length; i += CHUNK_SIZE) {
      const chunk = batch.slice(i, i + CHUNK_SIZE);
      const results = await Promise.allSettled(
        chunk.map((item: any) => executeAutoLeadAnalysisAndMove(item.company_id, item.id, 2))
      );

      for (const res of results) {
        if (res.status === "fulfilled" && res.value.triggered) {
          analyzedCount++;
        }
      }
      await new Promise((r) => setTimeout(r, 200));
    }

    return { scanned: candidates.length, analyzed: analyzedCount };
  } catch (err: any) {
    console.warn("[analyzePendingCompanyLeads] failed:", err?.message);
    return { scanned: 0, analyzed: 0 };
  }
}

/**
 * Disparador oportunista: Al llegar o salir un mensaje en ingest, audita en segundo plano 1 o 2 leads
 * que ya tengan >= 30m inactivos, manteniendo el embudo drenado continuamente sin depender de crons externos.
 */
export async function sweepOpportunisticInactiveLeads(companyId: string, limit: number = 2): Promise<void> {
  try {
    const thirtyMinAgo = new Date(Date.now() - INACTIVITY_WINDOW_MS).toISOString();
    const { data: candidates } = await (supabaseAdmin as any)
      .from("crm_cards")
      .select("id, company_id, ultima_em, campos_extras")
      .eq("company_id", companyId)
      .lte("ultima_em", thirtyMinAgo)
      .order("ultima_em", { ascending: false })
      .limit(limit * 3);

    if (!candidates || candidates.length === 0) return;

    const nowMs = Date.now();
    const eligible = candidates.filter((c: any) => isLeadEligibleForInactivityAnalysis(c, nowMs)).slice(0, limit);

    for (const item of eligible) {
      void executeAutoLeadAnalysisAndMove(item.company_id, item.id, 2).catch(() => null);
    }
  } catch {
    // Best effort en segundo plano
  }
}


export type BulkCardItem = {
  id: string;
  nome: string | null;
  numero: string;
  stage_id: string;
  stage_nome?: string;
  hasPreviousAnalysis: boolean;
};

export async function getCardsForBulkAnalysis(
  companyId: string,
  input: { stageId?: string | null; pipelineId?: string | null; forceAll?: boolean },
): Promise<{ cards: BulkCardItem[]; total: number; stageName?: string }> {
  let query = (supabaseAdmin as any)
    .from("crm_cards")
    .select("id, nome, numero, stage_id, campos_extras, ultima_em")
    .eq("company_id", companyId)
    .or("tipo_contato.is.null,tipo_contato.neq.interno");

  if (input.stageId) {
    query = query.eq("stage_id", input.stageId);
  } else if (input.pipelineId) {
    query = query.eq("pipeline_id", input.pipelineId);
  }

  query = query.order("ultima_em", { ascending: false, nullsFirst: false });

  const { data: cards, error } = await query;
  if (error || !cards) return { cards: [], total: 0 };

  let stageName: string | undefined;
  if (input.stageId) {
    const { data: st } = await (supabaseAdmin as any)
      .from("crm_stage")
      .select("nome")
      .eq("id", input.stageId)
      .maybeSingle();
    stageName = st?.nome;
  }

  const items: BulkCardItem[] = cards
    .filter((c: any) => {
      if (input.forceAll !== false) return true;
      const extras = c.campos_extras && typeof c.campos_extras === "object" ? c.campos_extras : {};
      const hasDiag = Boolean(extras.ultimo_diagnostico_ia || (c as any).ultimo_analise_ia_em);
      return !hasDiag;
    })
    .map((c: any) => {
      const extras = c.campos_extras && typeof c.campos_extras === "object" ? c.campos_extras : {};
      const hasDiag = Boolean(extras.ultimo_diagnostico_ia || (c as any).ultimo_analise_ia_em);
      return {
        id: c.id,
        nome: c.nome,
        numero: c.numero,
        stage_id: c.stage_id,
        stage_nome: stageName,
        hasPreviousAnalysis: hasDiag,
      };
    });

  return { cards: items, total: items.length, stageName };
}

export type BulkChunkResultItem = {
  cardId: string;
  leadName: string;
  ok: boolean;
  moved: boolean;
  fromStageName?: string;
  toStageName?: string;
  resumo?: string;
  intencao?: string;
  calificado?: boolean;
  metaEventSent?: string | null;
  metaEventQueued?: string | null;
  error?: string;
};

export async function executeBulkAnalyzeChunk(
  companyId: string,
  cardIds: string[],
  options: {
  sendMetaEvents?: boolean;
  autoMove?: boolean;
  includeProductNames?: boolean;
  includeValues?: boolean;
  includeCustomerNames?: boolean;
  allowedMetaEvents?: string[];
} = {},
): Promise<{
  processed: number;
  movedCount: number;
  metaSentCount: number;
  results: BulkChunkResultItem[];
}> {
  const sendMeta = options.sendMetaEvents !== false;
  const autoMove = options.autoMove !== false;
  const includeProductNames = Boolean(options.includeProductNames);
  const includeValues = options.includeValues !== false;
  const includeCustomerNames = options.includeCustomerNames !== false;
  const allowedMetaEvents = Array.isArray(options.allowedMetaEvents) && options.allowedMetaEvents.length > 0
    ? options.allowedMetaEvents
    : ["QualifiedLead", "Purchase"];

  let metaCfg: any = null;
  try {
    const { getMetaCapiConfig } = await import("@/lib/meta-capi.server");
    metaCfg = await getMetaCapiConfig(companyId);
  } catch (e) {
    console.warn("[bulkAnalyze] getMetaCapiConfig error:", e);
  }

  const results: BulkChunkResultItem[] = [];
  let movedCount = 0;
  let metaSentCount = 0;

  // Máximo 2 llamadas simultáneas para Reanálisis Masivo:
  // Garantiza que Drael (límite 4) nunca se sature y conviva pacíficamente con chats y barridos
  const CONCURRENCY = 2;
  for (let i = 0; i < cardIds.length; i += CONCURRENCY) {
    const slice = cardIds.slice(i, i + CONCURRENCY);
    const chunkPromises = slice.map(async (cid) => {
      try {
        const { data: card } = await (supabaseAdmin as any)
          .from("crm_cards")
          .select("id, nome, numero, stage_id, valor, item_nome, owner_id, campos_extras, canal_chat")
          .eq("id", cid)
          .eq("company_id", companyId)
          .maybeSingle();

        if (!card) {
          return { cardId: cid, leadName: "Desconocido", ok: false, moved: false, error: "Lead no encontrado" };
        }

        const leadDisplayName = card.nome || card.numero;

        // Se programa con prioridad 3 (Baja / Proceso masivo en lote)
        const analysis = await analyzeLeadInternal(companyId, card.id, 3);
        if (!analysis.ok || !analysis.result) {
          return {
            cardId: card.id,
            leadName: leadDisplayName,
            ok: false,
            moved: false,
            error: analysis.error || "No se pudo clasificar el lead",
          };
        }

        let didMove = false;
        let destStageName = analysis.result.etapa_sugerida_nome;
        const currentStageName = analysis.currentStage?.nome || "";

        if (autoMove && analysis.result.etapa_sugerida_id !== card.stage_id) {
          if (!analysis.suggestedStageBlocked) {
            const { data: destStage } = await (supabaseAdmin as any)
              .from("crm_stage")
              .select("id, nome, modo_atendimento")
              .eq("id", analysis.result.etapa_sugerida_id)
              .maybeSingle();

            const extra: Record<string, any> = {};
            if (!card.owner_id && destStage?.modo_atendimento === "manual") {
              const assignedOwner = await pickLeadOwner(supabaseAdmin, companyId, analysis.result.etapa_sugerida_id);
              if (assignedOwner) extra.owner_id = assignedOwner;
            }

            await moveCardToStage(supabaseAdmin, card.id, analysis.result.etapa_sugerida_id, extra);
            didMove = true;
            destStageName = destStage?.nome || destStageName;

            try {
              await (supabaseAdmin as any).from("lead_evento").insert({
                company_id: companyId,
                card_id: card.id,
                tipo: "mudanca_etapa",
                descricao: `Reanálisis Masivo: Movido a "${destStageName}" por IA (${analysis.result.justificativa.slice(0, 140)})`,
              });
            } catch {}
          } else {
            try {
              await (supabaseAdmin as any).from("lead_evento").insert({
                company_id: companyId,
                card_id: card.id,
                tipo: "atualizacao",
                descricao: `Reanálisis Masivo: IA sugiere mover a "${destStageName}" (etapa bloqueada para confirmación humana)`,
              });
            } catch {}
          }
        }

        let metaEventName: string | null = null;
        let metaSent = false;

        const destLower = (destStageName || "").toLowerCase();
        if (destLower.includes("ganado") || destLower.includes("cliente activo") || destLower.includes("pago enviado")) {
          metaEventName = "Purchase";
        } else if (analysis.result.calificado || analysis.result.intencao === "POSITIVA" || destLower.includes("seguimiento") || destLower.includes("cotización") || destLower.includes("cotizacion")) {
          metaEventName = "QualifiedLead";
        } else {
          metaEventName = "Lead";
        }

        const isEventAllowed = Boolean(metaEventName && allowedMetaEvents.includes(metaEventName));

        if (sendMeta && isEventAllowed && metaEventName) {
          if (metaCfg?.ativo && metaCfg?.access_token) {
            try {
              const { sendMetaConversionForLead } = await import("@/lib/meta-capi.server");
              const capiRes = await sendMetaConversionForLead({
                companyId,
                cardId: card.id,
                eventName: metaEventName,
                value: includeValues ? (analysis.result.valor_sugerido || card.valor || null) : null,
                currency: metaCfg.currency || "USD",
                triggerSource: "bulk_offline_reanalysis",
                forceSend: true,
                includeProductNames,
                includeValues,
                includeCustomerNames,
              });
              if (capiRes.ok) metaSent = true;
            } catch (e: any) {
              console.warn("[bulkAnalyze.metaCapi] Error:", e?.message);
            }
          }

          try {
            const freshExtras = (card.campos_extras as Record<string, any>) || {};
            await (supabaseAdmin as any).from("crm_cards").update({
              campos_extras: {
                ...freshExtras,
                meta_offline_event: {
                  event_name: metaEventName,
                  sent: metaSent,
                  at: new Date().toISOString(),
                  intencao: analysis.result.intencao,
                  calificado: analysis.result.calificado,
                  valor: analysis.result.valor_sugerido || card.valor || null,
                },
              },
            }).eq("id", card.id);
          } catch {}
        }

        return {
          cardId: card.id,
          leadName: leadDisplayName,
          ok: true,
          moved: didMove,
          fromStageName: currentStageName,
          toStageName: destStageName,
          resumo: analysis.result.resumo,
          intencao: analysis.result.intencao,
          calificado: analysis.result.calificado,
          metaEventSent: metaSent ? metaEventName : null,
          metaEventQueued: !metaSent && metaEventName ? metaEventName : null,
        };
      } catch (err: any) {
        return {
          cardId: cid,
          leadName: "Lead",
          ok: false,
          moved: false,
          error: err?.message || String(err),
        };
      }
    });

    const chunkResults = await Promise.all(chunkPromises);
    for (const r of chunkResults) {
      if (r.moved) movedCount++;
      if (r.metaEventSent) metaSentCount++;
      results.push(r);
    }
  }

  return {
    processed: results.length,
    movedCount,
    metaSentCount,
    results,
  };
}
