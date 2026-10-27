// src/lib/crm-lead-analyzer.server.ts
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { lovableAiChat, type ChatMsg } from "@/lib/lovable-ai.server";
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

export async function analyzeLeadInternal(
  companyId: string,
  cardId: string,
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
    pipelineId = firstPipe?.id;
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
      (Array.isArray(card.campos_extras?.respostas) && card.campos_extras.respostas.length > 0) ||
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
    rawAiOutput = await lovableAiChat(chatMessages, {
      provider: activeAgent?.ai_provider || "gemini",
      model: activeAgent?.ai_model || "google/gemini-2.5-flash",
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

    if (parsedResult.produto_sugerida && typeof (parsedResult as any).produto_sugerida === "string" && !freshCard?.item_nome) {
      updates.item_nome = (parsedResult as any).produto_sugerida;
    } else if (parsedResult.produto_sugerido && typeof parsedResult.produto_sugerido === "string" && !freshCard?.item_nome) {
      updates.item_nome = parsedResult.produto_sugerido;
    }

    if (parsedResult.proxima_acao_sugerida && typeof parsedResult.proxima_acao_sugerida === "string") {
      updates.proxima_acao = parsedResult.proxima_acao_sugerida.trim().slice(0, 240);
    }

    await supabaseAdmin
      .from("crm_cards")
      .update(updates)
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
async function executeAutoLeadAnalysisAndMove(companyId: string, cardId: string): Promise<{ triggered: boolean; reason?: string }> {
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

    const analysis = await analyzeLeadInternal(companyId, card.id);
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
    const { data: card } = await supabaseAdmin
      .from("crm_cards")
      .select("id, stage_id, owner_id, campos_extras, updated_at")
      .eq("company_id", companyId)
      .in("numero", cleanNum && cleanNum !== numero ? [numero, cleanNum] : [numero])
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!card) return { triggered: false, reason: "card_not_found" };

    const extras = (card.campos_extras as Record<string, any>) || {};
    const rawLast = (card as any).ultimo_analise_ia_em || extras.ultimo_analise_ia_em;
    const ultimoAnalise = rawLast ? new Date(rawLast).getTime() : 0;
    const now = Date.now();
    const cooldownMs = 25 * 1000; // 25 segundos entre análisis del mismo lead

    const timerKey = `${companyId}:${card.id}`;

    if (ultimoAnalise && now - ultimoAnalise < cooldownMs) {
      const remainingMs = Math.max(2000, cooldownMs - (now - ultimoAnalise) + 500);
      // Encolar ejecución diferida para que el último mensaje de una ráfaga NUNCA se pierda
      if (!pendingCooldownTimers.has(timerKey)) {
        const timer = setTimeout(() => {
          pendingCooldownTimers.delete(timerKey);
          void executeAutoLeadAnalysisAndMove(companyId, card.id).catch((e) =>
            console.warn("[crm-lead-analyzer] deferred analysis error:", e?.message),
          );
        }, remainingMs);
        pendingCooldownTimers.set(timerKey, timer);
      }
      return {
        triggered: false,
        scheduled: true,
        reason: `cooldown_scheduled_in_${Math.round(remainingMs / 1000)}s`,
      };
    }

    // Si había un timer pendiente, limpiarlo porque vamos a ejecutar ahora mismo
    const existingTimer = pendingCooldownTimers.get(timerKey);
    if (existingTimer) {
      clearTimeout(existingTimer);
      pendingCooldownTimers.delete(timerKey);
    }

    return await executeAutoLeadAnalysisAndMove(companyId, card.id);
  } catch (err: any) {
    console.warn("[crm-lead-analyzer] checkAndAnalyzeLeadCooldown failed:", err?.message);
    return { triggered: false, reason: err?.message };
  }
}

/**
 * Barrido automático de leads pendientes de análisis o con actividad nueva posterior al último análisis.
 * Se ejecuta al abrir el Kanban y en el cron del servidor para garantizar que el 100% de los leads estén analizados.
 */
export async function analyzePendingCompanyLeads(
  companyId?: string | null,
  limit: number = 8,
): Promise<{ scanned: number; analyzed: number }> {
  try {
    let query = supabaseAdmin
      .from("crm_cards")
      .select("id, company_id, numero, ultima_em, campos_extras")
      .or("tipo_contato.is.null,tipo_contato.neq.interno")
      .order("ultima_em", { ascending: false })
      .limit(120);

    if (companyId) {
      query = query.eq("company_id", companyId);
    }

    const { data: cards } = await query;
    if (!cards || cards.length === 0) return { scanned: 0, analyzed: 0 };

    const candidates = cards.filter((c: any) => {
      const extras = c.campos_extras && typeof c.campos_extras === "object" ? c.campos_extras : {};
      const lastAnaliseStr = (c as any).ultimo_analise_ia_em || extras.ultimo_analise_ia_em;
      const hasDiag = Boolean(extras.ultimo_diagnostico_ia);
      if (!hasDiag || !lastAnaliseStr) return true;
      const lastAnaliseMs = new Date(lastAnaliseStr).getTime();
      const ultimaEmMs = c.ultima_em ? new Date(c.ultima_em).getTime() : 0;
      // Si hubo actividad más de 30 segundos después del último análisis, re-analizar
      return ultimaEmMs > lastAnaliseMs + 30_000;
    });

    const batch = candidates.slice(0, Math.max(1, Math.min(limit, 20)));
    let analyzedCount = 0;

    for (const item of batch) {
      try {
        const res = await executeAutoLeadAnalysisAndMove(item.company_id, item.id);
        if (res.triggered) analyzedCount++;
      } catch (e: any) {
        console.warn("[analyzePendingCompanyLeads] item error:", e?.message);
      }
    }

    return { scanned: candidates.length, analyzed: analyzedCount };
  } catch (err: any) {
    console.warn("[analyzePendingCompanyLeads] failed:", err?.message);
    return { scanned: 0, analyzed: 0 };
  }
}
