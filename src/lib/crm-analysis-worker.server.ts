// src/lib/crm-analysis-worker.server.ts
/**
 * Worker Autónomo de Segundo Plano para Reanálisis Masivo y Auditoría Continua en Servidor.
 * Características de Resiliencia:
 * 1. Desacoplado 100% del navegador: el cliente envía la orden y puede cerrar la ventana.
 * 2. Cerrojo Distribuido (Distributed Mutex Lock) en PostgreSQL con TTL de 75s para evitar ejecuciones concurrentes.
 * 3. Optimistic Timestamp Guard: Si un cliente escribe en WhatsApp mientras la IA piensa, aborta el movimiento de inmediato.
 * 4. Stage Version Lock: Si un asesor humano arrastra la tarjeta, la IA cede el paso y cancela su sugerencia.
 * 5. Concurrencia gobernada por globalAiLimiter (Prioridad 3 - Baja, máx 2 slots) protegiendo a Drael de errores 429.
 */

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { globalAiLimiter } from "./ai-limiter.server";
import {
  analyzeLeadInternal,
  isLeadEligibleForInactivityAnalysis,
} from "./crm-lead-analyzer.server";
import { moveCardToStage, pickLeadOwner } from "./crm-engine.server";

export interface BackgroundReanalysisStatus {
  status: "idle" | "running" | "paused" | "completed" | "error";
  companyId: string;
  scope: "all" | "stage";
  stageId?: string | null;
  stageName?: string | null;
  total: number;
  processed: number;
  moved: number;
  metaSent: number;
  errors: number;
  startedAt: string;
  updatedAt: string;
  lastError?: string;
}

const SETTING_KEY_STATUS = "crm_background_reanalysis_status";
const SETTING_KEY_LOCK = "crm_background_worker_lock";

// En memoria por si el proceso permanece activo en el mismo contenedor
let activeAbortController: AbortController | null = null;

/**
 * Adquiere el cerrojo distribuido en base de datos con TTL.
 */
async function acquireDistributedLock(companyId: string, ttlSeconds = 75): Promise<boolean> {
  const now = Date.now();
  const expiresAt = now + ttlSeconds * 1000;

  try {
    const { data: currentLock } = await (supabaseAdmin as any)
      .from("master_settings")
      .select("value")
      .eq("key", `${SETTING_KEY_LOCK}_${companyId}`)
      .maybeSingle();

    const lockVal = currentLock?.value as any;
    if (lockVal?.locked && lockVal.expiresAt > now) {
      // Cerrojo activo y no expirado
      return false;
    }

    // Adquirir o renovar cerrojo
    await (supabaseAdmin as any)
      .from("master_settings")
      .upsert(
        {
          key: `${SETTING_KEY_LOCK}_${companyId}`,
          value: { locked: true, expiresAt, acquiredAt: now },
          updated_at: new Date().toISOString(),
        },
        { onConflict: "key" },
      );

    return true;
  } catch (err: any) {
    console.warn("[WorkerLock] Error adquiriendo cerrojo:", err?.message);
    return false;
  }
}

/**
 * Renueva el cerrojo durante la ejecución activa.
 */
async function refreshDistributedLock(companyId: string, ttlSeconds = 75): Promise<void> {
  const now = Date.now();
  const expiresAt = now + ttlSeconds * 1000;
  try {
    await (supabaseAdmin as any)
      .from("master_settings")
      .upsert(
        {
          key: `${SETTING_KEY_LOCK}_${companyId}`,
          value: { locked: true, expiresAt, refreshedAt: now },
          updated_at: new Date().toISOString(),
        },
        { onConflict: "key" },
      );
  } catch {}
}

/**
 * Libera el cerrojo distribuido.
 */
async function releaseDistributedLock(companyId: string): Promise<void> {
  try {
    await (supabaseAdmin as any)
      .from("master_settings")
      .upsert(
        {
          key: `${SETTING_KEY_LOCK}_${companyId}`,
          value: { locked: false, releasedAt: Date.now() },
          updated_at: new Date().toISOString(),
        },
        { onConflict: "key" },
      );
  } catch {}
}

/**
 * Guarda el progreso en la base de datos para consulta de clientes / Kanban.
 */
async function persistWorkerStatus(status: BackgroundReanalysisStatus): Promise<void> {
  try {
    await (supabaseAdmin as any)
      .from("master_settings")
      .upsert(
        {
          key: `${SETTING_KEY_STATUS}_${status.companyId}`,
          value: status,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "key" },
      );
  } catch (err: any) {
    console.warn("[WorkerStatus] Error persistiendo estado:", err?.message);
  }
}

/**
 * Obtiene el estado actual del worker para una empresa.
 */
export async function getBackgroundReanalysisStatus(
  companyId: string,
): Promise<BackgroundReanalysisStatus> {
  try {
    const { data } = await (supabaseAdmin as any)
      .from("master_settings")
      .select("value")
      .eq("key", `${SETTING_KEY_STATUS}_${companyId}`)
      .maybeSingle();

    if (data?.value) {
      return data.value as BackgroundReanalysisStatus;
    }
  } catch {}

  return {
    status: "idle",
    companyId,
    scope: "all",
    total: 0,
    processed: 0,
    moved: 0,
    metaSent: 0,
    errors: 0,
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Pausa o cancela la tarea en segundo plano.
 */
export async function pauseBackgroundReanalysis(
  companyId: string,
): Promise<{ ok: boolean; message: string }> {
  if (activeAbortController) {
    activeAbortController.abort();
    activeAbortController = null;
  }

  const current = await getBackgroundReanalysisStatus(companyId);
  current.status = "paused";
  current.updatedAt = new Date().toISOString();
  await persistWorkerStatus(current);
  await releaseDistributedLock(companyId);

  return { ok: true, message: "Tarea en segundo plano pausada con éxito." };
}

/**
 * Dispara el worker en segundo plano de forma desacoplada y no bloqueante.
 */
export async function startBackgroundReanalysis(
  companyId: string,
  options: {
    stageId?: string | null;
    pipelineId?: string | null;
    forceAll?: boolean;
    sendMetaEvents?: boolean;
    autoMove?: boolean;
    allowedMetaEvents?: string[];
  } = {},
): Promise<{ ok: boolean; started: boolean; message: string; totalCards: number }> {
  // 1. Verificar si ya hay un worker corriendo con cerrojo
  const lockAcquired = await acquireDistributedLock(companyId, 90);
  if (!lockAcquired) {
    const current = await getBackgroundReanalysisStatus(companyId);
    return {
      ok: true,
      started: false,
      message: "Ya hay una tarea de análisis en ejecución en el servidor.",
      totalCards: current.total,
    };
  }

  // 2. Cargar universo de tarjetas candidatas
  let query = (supabaseAdmin as any)
    .from("crm_cards")
    .select("id, nome, numero, stage_id, ultima_em, updated_at, created_at, campos_extras, valor")
    .eq("company_id", companyId)
    .or("tipo_contato.is.null,tipo_contato.neq.interno");

  if (options.stageId) {
    query = query.eq("stage_id", options.stageId);
  } else if (options.pipelineId) {
    query = query.eq("pipeline_id", options.pipelineId);
  }

  query = query.order("ultima_em", { ascending: false, nullsFirst: false });

  const { data: cards, error } = await query;
  if (error || !cards || cards.length === 0) {
    await releaseDistributedLock(companyId);
    return {
      ok: false,
      started: false,
      message: "No se encontraron leads para auditar en el embudo.",
      totalCards: 0,
    };
  }

  const nowMs = Date.now();
  const eligibleCards = options.forceAll
    ? cards
    : cards.filter((c: any) => isLeadEligibleForInactivityAnalysis(c, nowMs));

  if (eligibleCards.length === 0) {
    await releaseDistributedLock(companyId);
    return {
      ok: true,
      started: false,
      message: "Todos los leads se encuentran al día o en conversación activa (< 30 min).",
      totalCards: 0,
    };
  }

  // 3. Inicializar estado persistente en base de datos
  const initialStatus: BackgroundReanalysisStatus = {
    status: "running",
    companyId,
    scope: options.stageId ? "stage" : "all",
    stageId: options.stageId ?? null,
    total: eligibleCards.length,
    processed: 0,
    moved: 0,
    metaSent: 0,
    errors: 0,
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await persistWorkerStatus(initialStatus);

  // 4. Iniciar ejecución asíncrona de fondo sin esperar su finalización
  const controller = new AbortController();
  activeAbortController = controller;

  // Ejecución en background desconectada
  void (async () => {
    try {
      await runWorkerExecutionLoop(
        companyId,
        eligibleCards,
        initialStatus,
        options,
        controller.signal,
      );
    } catch (workerErr: any) {
      console.error("[BackgroundWorker] Error crítico en worker loop:", workerErr?.message);
      initialStatus.status = "error";
      initialStatus.lastError = workerErr?.message;
      initialStatus.updatedAt = new Date().toISOString();
      await persistWorkerStatus(initialStatus);
    } finally {
      activeAbortController = null;
      await releaseDistributedLock(companyId);
    }
  })();

  return {
    ok: true,
    started: true,
    message: `Worker iniciado en el servidor para ${eligibleCards.length} leads. Ya puedes cerrar el navegador con total tranquilidad.`,
    totalCards: eligibleCards.length,
  };
}

/**
 * Bucle de procesamiento por micro-lotes con semáforo y blindajes de colisión.
 */
async function runWorkerExecutionLoop(
  companyId: string,
  cards: any[],
  currentStatus: BackgroundReanalysisStatus,
  options: {
    sendMetaEvents?: boolean;
    autoMove?: boolean;
    allowedMetaEvents?: string[];
  },
  signal: AbortSignal,
): Promise<void> {
  const CHUNK_SIZE = 4; // Procesar en bloques de 4
  const CONCURRENCY = 2; // Máximo 2 llamadas a la vez (Prioridad 3 de Drael)
  const autoMove = options.autoMove !== false;
  const sendMeta = options.sendMetaEvents !== false;
  const allowedEvents = options.allowedMetaEvents || ["QualifiedLead", "Purchase"];

  for (let i = 0; i < cards.length; i += CHUNK_SIZE) {
    if (signal.aborted) break;

    // Renovar cerrojo distribuido
    await refreshDistributedLock(companyId, 90);

    // Revisar si desde la base de datos se solicitó pausar
    const checkDbStatus = await getBackgroundReanalysisStatus(companyId);
    if (checkDbStatus.status === "paused") {
      console.log(`[BackgroundWorker] Tarea pausada por usuario.`);
      break;
    }

    const chunk = cards.slice(i, i + CHUNK_SIZE);

    // Procesar el micro-lote en pares concurrentes protegidos por el semáforo
    for (let j = 0; j < chunk.length; j += CONCURRENCY) {
      if (signal.aborted) break;
      const pair = chunk.slice(j, j + CONCURRENCY);

      const pairResults = await Promise.allSettled(
        pair.map(async (card) => {
          return processSingleCardWithGuards(companyId, card, { autoMove, sendMeta, allowedEvents });
        }),
      );

      for (const res of pairResults) {
        currentStatus.processed++;
        if (res.status === "fulfilled") {
          if (res.value.moved) currentStatus.moved++;
          if (res.value.metaSent) currentStatus.metaSent++;
          if (!res.value.ok) currentStatus.errors++;
        } else {
          currentStatus.errors++;
        }
      }

      currentStatus.updatedAt = new Date().toISOString();
      await persistWorkerStatus(currentStatus);
    }

    // Micropausa de 250ms para que PostgreSQL y los buffers de Drael se liberen
    await new Promise((r) => setTimeout(r, 250));
  }

  currentStatus.status = signal.aborted ? "paused" : "completed";
  currentStatus.updatedAt = new Date().toISOString();
  await persistWorkerStatus(currentStatus);
  console.log(`[BackgroundWorker] Proceso finalizado. Total: ${currentStatus.processed}, Movidos: ${currentStatus.moved}, Errores: ${currentStatus.errors}`);
}

/**
 * Procesa un lead individual con Optimistic Timestamp Guard y Stage Version Lock.
 */
async function processSingleCardWithGuards(
  companyId: string,
  snapshotCard: any,
  options: { autoMove: boolean; sendMeta: boolean; allowedEvents: string[] },
): Promise<{ ok: boolean; moved: boolean; metaSent: boolean; error?: string }> {
  try {
    const cardId = snapshotCard.id;
    const snapshotUltimaEm = snapshotCard.ultima_em;
    const snapshotStageId = snapshotCard.stage_id;

    // 1. Invocar IA a través de analyzeLeadInternal con Prioridad 3 (Baja / Background Worker)
    const analysis = await analyzeLeadInternal(companyId, cardId, 3);
    if (!analysis.ok || !analysis.result) {
      return { ok: false, moved: false, metaSent: false, error: analysis.error || "Análisis fallido" };
    }

    let didMove = false;
    let metaSent = false;
    const suggestedStageId = analysis.result.etapa_sugerida_id;
    const suggestedStageName = analysis.result.etapa_sugerida_nome;

    if (options.autoMove && suggestedStageId !== snapshotStageId) {
      // 2. BLINDAJE 1: Optimistic Timestamp Guard (Verificar si hubo mensajes entrantes mientras la IA pensaba)
      const { data: freshCard } = await (supabaseAdmin as any)
        .from("crm_cards")
        .select("id, stage_id, ultima_em, owner_id")
        .eq("id", cardId)
        .maybeSingle();

      if (!freshCard) {
        return { ok: false, moved: false, metaSent: false, error: "Lead eliminado" };
      }

      if (freshCard.ultima_em !== snapshotUltimaEm) {
        console.log(`[Worker.Guard] Abortado movimiento para ${cardId}: mensaje nuevo recibido en curso.`);
        return { ok: true, moved: false, metaSent: false };
      }

      // 3. BLINDAJE 2: Stage Version Lock (Verificar si un asesor humano lo arrastró en el Kanban)
      if (freshCard.stage_id !== snapshotStageId) {
        console.log(`[Worker.Guard] Abortado movimiento para ${cardId}: asesor humano modificó la etapa.`);
        return { ok: true, moved: false, metaSent: false };
      }

      // 4. Si la etapa no está bloqueada para IA, realizar movimiento
      if (!analysis.suggestedStageBlocked) {
        const { data: destStage } = await (supabaseAdmin as any)
          .from("crm_stage")
          .select("id, nome, modo_atendimento")
          .eq("id", suggestedStageId)
          .maybeSingle();

        const extra: Record<string, any> = {};
        if (!freshCard.owner_id && destStage?.modo_atendimento === "manual") {
          const assignedOwner = await pickLeadOwner(supabaseAdmin, companyId, suggestedStageId);
          if (assignedOwner) extra.owner_id = assignedOwner;
        }

        await moveCardToStage(supabaseAdmin, cardId, suggestedStageId, extra);
        didMove = true;

        try {
          await (supabaseAdmin as any).from("lead_evento").insert({
            company_id: companyId,
            card_id: cardId,
            tipo: "mudanca_etapa",
            descricao: `Worker Autónomo: Movido a "${suggestedStageName}" por IA (${analysis.result.justificativa.slice(0, 140)})`,
          });
        } catch {}
      } else {
        try {
          await (supabaseAdmin as any).from("lead_evento").insert({
            company_id: companyId,
            card_id: cardId,
            tipo: "atualizacao",
            descricao: `Worker Autónomo: IA sugiere mover a "${suggestedStageName}" (etapa bloqueada para confirmación humana)`,
          });
        } catch {}
      }
    }

    // 5. Envío CAPI con deduplicación RPC
    if (options.sendMeta) {
      const destLower = (suggestedStageName || "").toLowerCase();
      let eventName = "Lead";
      if (destLower.includes("ganado") || destLower.includes("cliente activo") || destLower.includes("pago enviado")) {
        eventName = "Purchase";
      } else if (analysis.result.calificado || analysis.result.intencao === "POSITIVA" || destLower.includes("seguimiento")) {
        eventName = "QualifiedLead";
      }

      if (options.allowedEvents.includes(eventName)) {
        try {
          const { sendMetaConversionForLead } = await import("@/lib/meta-capi.server");
          const capiRes = await sendMetaConversionForLead({
            companyId,
            cardId,
            eventName,
            dedupKey: `${cardId}_${suggestedStageId}_${eventName}`,
            triggerSource: "background_worker",
          });
          if (capiRes.ok && capiRes.status === "sent") {
            metaSent = true;
          }
        } catch {}
      }
    }

    return { ok: true, moved: didMove, metaSent };
  } catch (err: any) {
    return { ok: false, moved: false, metaSent: false, error: err?.message };
  }
}
