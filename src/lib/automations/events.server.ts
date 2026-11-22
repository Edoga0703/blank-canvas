// src/lib/automations/events.server.ts
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { DomainEvent } from "./types";
import type { WorkflowGraph } from "./schema";
import { randomUUID } from "node:crypto";
import { matchesKeywords, isChannelMatch, normalizeKeywordText } from "./arbitration.server";
import { matchInteractiveOption, validateAndParseCollectedInput } from "./registry.server";

/**
 * Procesa eventos pendientes acumulados en automation_events por el trigger de crm_cards u otras fuentes.
 * Reclama eventos de forma atómica para que múltiples workers no los procesen dos veces.
 */
export async function processPendingAutomationEvents(batchLimit = 15): Promise<number> {
  const now = new Date();
  const nowIso = now.toISOString();
  const leaseUntilIso = new Date(now.getTime() + 60_000).toISOString();

  // Reclamar eventos pending o eventos processing cuyo lease venció (recuperación de caídas)
  const { data: pendingEvents } = await (supabaseAdmin as any)
    .from("automation_events")
    .select("*")
    .or(`processing_state.eq.pending,and(processing_state.eq.processing,lease_until.lt.${nowIso})`)
    .order("created_at", { ascending: true })
    .limit(batchLimit);

  if (!pendingEvents || pendingEvents.length === 0) return 0;

  let processed = 0;

  for (const ev of pendingEvents) {
    const leaseOwner = randomUUID();
    // 1. Reclamo atómico (CAS)
    const { data: claimed } = await (supabaseAdmin as any)
      .from("automation_events")
      .update({
        processing_state: "processing",
        lease_owner: leaseOwner,
        lease_until: leaseUntilIso,
        attempts: (ev.attempts || 0) + 1,
      })
      .eq("id", ev.id)
      .or(`processing_state.eq.pending,and(processing_state.eq.processing,lease_until.lt.${nowIso})`)
      .select("id")
      .maybeSingle();

    if (!claimed) continue; // Otro worker lo reclamó

    try {
      const domainEvent: DomainEvent = {
        id: ev.id,
        companyId: ev.company_id,
        name: ev.event_name as any,
        occurredAt: ev.occurred_at,
        actorId: ev.actor_id,
        entity: { type: ev.entity_type, id: ev.entity_id || "" },
        source: ev.source,
        idempotencyKey: ev.idempotency_key,
        payload: ev.payload,
      };

      const dispatchResult = await dispatchDomainEvent(domainEvent);
      if (domainEvent.name === "messaging.inbound_received.v1" && dispatchResult.triggered === 0) {
        const { enqueueInboundFallback } = await import("./fallback.server");
        await enqueueInboundFallback(domainEvent);
      }

      const { data: closed, error: closeErr } = await (supabaseAdmin as any)
        .from("automation_events")
        .update({ processing_state: "processed", lease_owner: null, lease_until: null })
        .eq("id", ev.id).eq("lease_owner", leaseOwner)
        .select("id").maybeSingle();
      if (closeErr || !closed) throw closeErr || new Error("Lease de evento perdido");
      processed++;
    } catch (err: any) {
      console.error(`[processPendingAutomationEvents] Error procesando evento ${ev.id}:`, err?.message);
      const isExhausted = (ev.attempts || 0) + 1 >= 3;
      await (supabaseAdmin as any)
        .from("automation_events")
        .update({
          processing_state: isExhausted ? "failed" : "pending",
          last_error: String(err?.message || err).slice(0, 500),
          lease_owner: null,
          lease_until: null,
        })
        .eq("id", ev.id).eq("lease_owner", leaseOwner);
    }
  }

  return processed;
}

/**
 * Recibe un evento del dominio (CRM o Mensajería) e inicia o despierta flujos coincidentes.
 */
export async function dispatchDomainEvent(event: DomainEvent): Promise<{ triggered: number }> {
  const { companyId, name, payload } = event;
  let triggeredCount = 0;

  // P1-1: Garantizar persistencia duradera del evento en automation_events para que
  // automation_start_execution siempre encuentre un p_event_id válido y no aborte la ejecución.
  let validEventId = event.id;
  const idempotencyKey = event.idempotencyKey || `ev_${name}_${event.entity?.id || ""}_${Date.now()}`;

  try {
    const { data: storedEvent } = await (supabaseAdmin as any)
      .from("automation_events")
      .upsert(
        {
          id: validEventId || undefined,
          company_id: companyId,
          event_name: name,
          entity_type: event.entity?.type || "domain",
          entity_id: event.entity?.id ? String(event.entity.id) : null,
          actor_id: event.actorId || null,
          source: event.source || "system",
          occurred_at: event.occurredAt || new Date().toISOString(),
          idempotency_key: idempotencyKey,
          payload: payload || {},
          processing_state: "processing",
        },
        { onConflict: "company_id,idempotency_key" }
      )
      .select("id")
      .maybeSingle();

    if (storedEvent?.id) {
      validEventId = storedEvent.id;
    }
  } catch (persistErr) {
    console.warn("[dispatchDomainEvent] Aviso asegurando persistencia de evento en automation_events:", persistErr);
  }

  // 1. Verificar si hay ejecuciones esperando respuesta en este mismo hilo de conversación
  if (
    (name === "messaging.inbound_received.v1" || name === "telegram.business_message_received.v1") &&
    payload?.externalConversationId
  ) {
    let query = (supabaseAdmin as any)
      .from("automation_executions")
      .select("id, workflow_version_id, current_node_id, context, source_instance_id")
      .eq("company_id", companyId)
      .eq("external_conversation_id", payload.externalConversationId)
      .eq("status", "waiting")
      .limit(5);

    const { data: waitingExecs, error: waitErr } = await query;
    if (waitErr) throw waitErr;
    let wokeCount = 0;
    if (waitingExecs && waitingExecs.length > 0) {
      for (const exec of waitingExecs) {
        // Verificar coincidencia de conexión/instancia si estaba especificada
        if (
          exec.source_instance_id &&
          payload.instanceId &&
          exec.source_instance_id !== payload.instanceId
        ) {
          continue;
        }

        const { data: ver } = await (supabaseAdmin as any)
          .from("automation_workflow_versions")
          .select("graph")
          .eq("id", exec.workflow_version_id)
          .maybeSingle();

        const graph = ver?.graph as WorkflowGraph | undefined;
        const currentNode = graph?.nodes?.find((n) => n.id === exec.current_node_id);

        // Despertar según el tipo de nodo de espera conversacional (wait_for_reply, send_interactive, collect_input)
        if (
          currentNode?.type !== "messaging.wait_for_reply" &&
          currentNode?.type !== "messaging.send_interactive" &&
          currentNode?.type !== "messaging.collect_input"
        ) {
          continue; // NUNCA despertar nodos de espera de tiempo ("control.wait_duration")
        }

        const replyPayload = {
          ...payload,
          occurredAt: event.occurredAt,
          messageId: payload.messageId || null,
        };

        if (currentNode.type === "messaging.wait_for_reply") {
          const outEdge = graph?.edges?.find(
            (e) => e.source === exec.current_node_id && (e.sourcePort === "reply" || e.sourcePort === "next")
          );

          if (outEdge?.target) {
            const { data: woke, error: wakeErr } = await (supabaseAdmin as any)
              .rpc("automation_resume_waiting", {
                p_company_id: companyId,
                p_execution_id: exec.id,
                p_expected_node: exec.current_node_id,
                p_target_node: outEdge.target,
                p_job_key: "job_" + exec.id + "_" + outEdge.target + "_reply",
                p_context_patch: { lastReply: replyPayload },
                p_require_due: false,
              });
            if (wakeErr) throw wakeErr;
            if (woke) wokeCount++;
          }
        } else if (currentNode.type === "messaging.send_interactive") {
          const cfg = (currentNode.config || {}) as any;
          const matched = matchInteractiveOption(payload.text || "", cfg.options || []);

          if (matched) {
            const outEdge = graph?.edges?.find(
              (e) => e.source === exec.current_node_id && e.sourcePort === matched.id
            );
            if (outEdge?.target) {
              const { data: woke, error: wakeErr } = await (supabaseAdmin as any)
                .rpc("automation_resume_waiting", {
                  p_company_id: companyId,
                  p_execution_id: exec.id,
                  p_expected_node: exec.current_node_id,
                  p_target_node: outEdge.target,
                  p_job_key: "job_" + exec.id + "_" + outEdge.target + "_" + matched.id,
                  p_context_patch: {
                    lastReply: replyPayload,
                    [exec.current_node_id]: {
                      selectedOptionId: matched.id,
                      selectedLabel: matched.label,
                      rawText: payload.text,
                    },
                  },
                  p_require_due: false,
                });
              if (wakeErr) throw wakeErr;
              if (woke) wokeCount++;
            }
          } else {
            // Opción inválida: evaluar reintentos o fallback
            const retries = Number(exec.context?._retries?.[exec.current_node_id] || 0);
            const maxRetries = Number(cfg.maxInvalidRetries ?? 1);

            if (retries < maxRetries && cfg.invalidReplyText) {
              try {
                const { resolveMessagingTarget } = await import("./registry.server");
                const target = await resolveMessagingTarget({
                  companyId,
                  executionId: exec.id,
                  workflowId: (exec as any).workflow_id,
                  versionId: exec.workflow_version_id,
                  nodeId: exec.current_node_id,
                  context: exec.context || {},
                  sourceInstanceId: exec.source_instance_id,
                  externalConversationId: payload.externalConversationId,
                });
                const { waSendText } = await import("@/lib/wa-dispatch.server");
                await waSendText(target.instanceRow, target.destination, cfg.invalidReplyText);
              } catch (e: any) {
                console.warn("[dispatchDomainEvent] Error enviando reprompt de menú interactivo:", e?.message);
              }

              const updatedRetries = { ...(exec.context?._retries || {}), [exec.current_node_id]: retries + 1 };
              await (supabaseAdmin as any)
                .from("automation_executions")
                .update({ context: { ...(exec.context || {}), _retries: updatedRetries } })
                .eq("id", exec.id);

              wokeCount++; // Bloquea el fallback de IA
            } else {
              // Agotó reintentos: buscar salida "fallback"
              const fallbackEdge = graph?.edges?.find(
                (e) => e.source === exec.current_node_id && e.sourcePort === "fallback"
              );
              if (fallbackEdge?.target) {
                const { data: woke, error: wakeErr } = await (supabaseAdmin as any)
                  .rpc("automation_resume_waiting", {
                    p_company_id: companyId,
                    p_execution_id: exec.id,
                    p_expected_node: exec.current_node_id,
                    p_target_node: fallbackEdge.target,
                    p_job_key: "job_" + exec.id + "_" + fallbackEdge.target + "_fallback",
                    p_context_patch: {
                      lastReply: replyPayload,
                      [exec.current_node_id]: { fallback: true, rawText: payload.text },
                    },
                    p_require_due: false,
                  });
                if (wakeErr) throw wakeErr;
                if (woke) wokeCount++;
              } else {
                // Sin rama fallback: cerrar limpio y liberar control
                await (supabaseAdmin as any)
                  .from("automation_executions")
                  .update({ status: "succeeded", finished_at: new Date().toISOString() })
                  .eq("id", exec.id);
                const { releaseWorkflowControl } = await import("./conversation-control.server");
                await releaseWorkflowControl({
                  companyId,
                  externalConversationId: payload.externalConversationId,
                  executionId: exec.id,
                  instanceId: exec.source_instance_id,
                }).catch(() => null);
                wokeCount++;
              }
            }
          }
        } else if (currentNode.type === "messaging.collect_input") {
          const cfg = (currentNode.config || {}) as any;
          const parsed = validateAndParseCollectedInput(payload.text || "", cfg.validationType || "text");

          if (parsed.valid) {
            const cardId = exec.card_id || exec.context?.card?.id || payload.cardId;
            const fieldName = cfg.targetField === "custom" ? (cfg.customFieldKey || "custom_field") : cfg.targetField;
            if (cardId) {
              try {
                if (cfg.targetField === "nome") {
                  await (supabaseAdmin as any)
                    .from("crm_cards")
                    .update({ nome: String(parsed.value), updated_at: new Date().toISOString() })
                    .eq("id", cardId)
                    .eq("company_id", companyId);
                } else if (cfg.targetField === "email") {
                  await (supabaseAdmin as any)
                    .from("crm_cards")
                    .update({ email: String(parsed.value), updated_at: new Date().toISOString() })
                    .eq("id", cardId)
                    .eq("company_id", companyId);
                } else if (cfg.targetField === "valor") {
                  await (supabaseAdmin as any)
                    .from("crm_cards")
                    .update({ valor: Number(parsed.value) || 0, updated_at: new Date().toISOString() })
                    .eq("id", cardId)
                    .eq("company_id", companyId);
                } else if (cfg.targetField === "custom" && cfg.customFieldKey) {
                  const { data: curCard } = await (supabaseAdmin as any)
                    .from("crm_cards")
                    .select("campos_extras")
                    .eq("id", cardId)
                    .eq("company_id", companyId)
                    .maybeSingle();
                  const mergedExtras = { ...(curCard?.campos_extras || {}), [cfg.customFieldKey]: parsed.value };
                  await (supabaseAdmin as any)
                    .from("crm_cards")
                    .update({ campos_extras: mergedExtras, updated_at: new Date().toISOString() })
                    .eq("id", cardId)
                    .eq("company_id", companyId);
                }
              } catch (e: any) {
                console.warn("[dispatchDomainEvent] Error persistiendo dato capturado en crm_cards:", e?.message);
              }
            }

            const validEdge = graph?.edges?.find(
              (e) => e.source === exec.current_node_id && (e.sourcePort === "valid" || e.sourcePort === "next")
            );
            if (validEdge?.target) {
              const { data: woke, error: wakeErr } = await (supabaseAdmin as any)
                .rpc("automation_resume_waiting", {
                  p_company_id: companyId,
                  p_execution_id: exec.id,
                  p_expected_node: exec.current_node_id,
                  p_target_node: validEdge.target,
                  p_job_key: "job_" + exec.id + "_" + validEdge.target + "_valid",
                  p_context_patch: {
                    lastReply: replyPayload,
                    collected: { ...(exec.context?.collected || {}), [fieldName]: parsed.value },
                  },
                  p_require_due: false,
                });
              if (wakeErr) throw wakeErr;
              if (woke) wokeCount++;
            }
          } else {
            // Formato inválido: reintentos o rama invalid
            const retries = Number(exec.context?._retries?.[exec.current_node_id] || 0);
            const maxRetries = Number(cfg.maxRetries ?? 2);

            if (retries < maxRetries && cfg.invalidMessage) {
              try {
                const { resolveMessagingTarget } = await import("./registry.server");
                const target = await resolveMessagingTarget({
                  companyId,
                  executionId: exec.id,
                  workflowId: (exec as any).workflow_id,
                  versionId: exec.workflow_version_id,
                  nodeId: exec.current_node_id,
                  context: exec.context || {},
                  sourceInstanceId: exec.source_instance_id,
                  externalConversationId: payload.externalConversationId,
                });
                const { waSendText } = await import("@/lib/wa-dispatch.server");
                await waSendText(target.instanceRow, target.destination, cfg.invalidMessage);
              } catch (e: any) {
                console.warn("[dispatchDomainEvent] Error enviando mensaje de formato inválido:", e?.message);
              }

              const updatedRetries = { ...(exec.context?._retries || {}), [exec.current_node_id]: retries + 1 };
              await (supabaseAdmin as any)
                .from("automation_executions")
                .update({ context: { ...(exec.context || {}), _retries: updatedRetries } })
                .eq("id", exec.id);

              wokeCount++;
            } else {
              // Agotó reintentos: buscar salida "invalid"
              const invalidEdge = graph?.edges?.find(
                (e) => e.source === exec.current_node_id && e.sourcePort === "invalid"
              );
              if (invalidEdge?.target) {
                const { data: woke, error: wakeErr } = await (supabaseAdmin as any)
                  .rpc("automation_resume_waiting", {
                    p_company_id: companyId,
                    p_execution_id: exec.id,
                    p_expected_node: exec.current_node_id,
                    p_target_node: invalidEdge.target,
                    p_job_key: "job_" + exec.id + "_" + invalidEdge.target + "_invalid",
                    p_context_patch: {
                      lastReply: replyPayload,
                      [exec.current_node_id]: { invalid: true, rawText: payload.text },
                    },
                    p_require_due: false,
                  });
                if (wakeErr) throw wakeErr;
                if (woke) wokeCount++;
              } else {
                await (supabaseAdmin as any)
                  .from("automation_executions")
                  .update({ status: "succeeded", finished_at: new Date().toISOString() })
                  .eq("id", exec.id);
                const { releaseWorkflowControl } = await import("./conversation-control.server");
                await releaseWorkflowControl({
                  companyId,
                  externalConversationId: payload.externalConversationId,
                  executionId: exec.id,
                  instanceId: exec.source_instance_id,
                }).catch(() => null);
                wokeCount++;
              }
            }
          }
        }
      }
      if (wokeCount > 0) {
        triggeredCount += wokeCount;
      }
    }
  }

  // 2. Buscar flujos publicados activos para esta empresa (dos consultas separadas para evitar error PGRST201 por doble FK)
  const { data: workflows, error: wfErr } = await (supabaseAdmin as any)
    .from("automation_workflows")
    .select("id, active_version_id")
    .eq("company_id", companyId)
    .eq("status", "published");

  if (wfErr) {
    console.error("[dispatchDomainEvent] Error consultando flujos:", wfErr.message);
    throw new Error(`Error consultando flujos: ${wfErr.message}`);
  }

  if (!workflows || workflows.length === 0) {
    return { triggered: triggeredCount };
  }

  const activeVersionIds = workflows
    .map((w: any) => w.active_version_id)
    .filter(Boolean);

  if (activeVersionIds.length === 0) {
    return { triggered: triggeredCount };
  }

  const { data: versions, error: verErr } = await (supabaseAdmin as any)
    .from("automation_workflow_versions")
    .select("id, workflow_id, graph")
    .eq("company_id", companyId).in("id", activeVersionIds);

  if (verErr) {
    console.error("[dispatchDomainEvent] Error consultando versiones de flujos:", verErr.message);
    throw new Error(`Error consultando versiones de flujos: ${verErr.message}`);
  }

  const versionMap = new Map<string, WorkflowGraph>();
  for (const v of versions || []) {
    if (v.id && v.graph) versionMap.set(v.id, v.graph as WorkflowGraph);
  }

  // triggeredCount já foi inicializado no topo (acumula wakes + novos starts)

  for (const wf of workflows) {
    const graph = versionMap.get(wf.active_version_id);
    if (!graph || !graph.nodes) continue;

    const triggerNodes = graph.nodes.filter(
      (n) =>
        n.type === "messaging.inbound_received" ||
        n.type.startsWith("crm.card") ||
        n.type === "telegram.business_message_received" ||
        n.type === "telegram.channel_post_published" ||
        n.type === "telegram.channel_comment_received" ||
        n.type === "meta.comment_received"
    );
    if (triggerNodes.length === 0) continue;

    for (const triggerNode of triggerNodes) {
      // Comprobar coincidencia del evento
      let matches = false;

      if (name === "messaging.inbound_received.v1" && triggerNode.type === "messaging.inbound_received") {
        const cfg = (triggerNode.config || {}) as any;
        // Validar canal
        const chOk = isChannelMatch(cfg.channels, payload.channel);
        // Validar conexión
        const instOk =
          cfg.connectionMode !== "selected" ||
          (Array.isArray(cfg.instanceIds) && cfg.instanceIds.includes(payload.instanceId));

        // Validar tipo de conversación (direct, group, all)
        const convType = cfg.conversationType || "direct";
        const isGroup = Boolean(payload.isGroup || (payload.externalConversationId && String(payload.externalConversationId).includes("@g.us")));
        let convOk = true;
        if (convType === "direct") {
          convOk = !isGroup;
        } else if (convType === "group") {
          convOk = isGroup;
        } else if (convType === "all") {
          convOk = true;
        }

        let kwOk = true;
        if (Array.isArray(cfg.keywords) && cfg.keywords.length > 0) {
          kwOk = matchesKeywords(payload.text || "", cfg.keywords);
        }

        matches = Boolean(chOk && instOk && convOk && kwOk);
      } else if (
        (name === "telegram.business_message_received.v1" || (name === "messaging.inbound_received.v1" && payload.channel === "telegram")) &&
        triggerNode.type === "telegram.business_message_received"
      ) {
        const cfg = (triggerNode.config || {}) as any;
        const instOk =
          cfg.connectionMode !== "selected" ||
          (Array.isArray(cfg.instanceIds) && cfg.instanceIds.includes(payload.instanceId));

        const convType = cfg.conversationType || "direct";
        const isGroup = Boolean(payload.isGroup || (payload.externalConversationId && String(payload.externalConversationId).includes("@g.us")));
        let convOk = true;
        if (convType === "direct") convOk = !isGroup;
        else if (convType === "group") convOk = isGroup;

        let kwOk = true;
        if (Array.isArray(cfg.keywords) && cfg.keywords.length > 0) {
          kwOk = matchesKeywords(payload.text || "", cfg.keywords);
        }

        matches = Boolean(instOk && convOk && kwOk);
      } else if (name === "telegram.channel_post_published.v1" && triggerNode.type === "telegram.channel_post_published") {
        const cfg = (triggerNode.config || {}) as any;
        const chOk = !cfg.channelId || String(cfg.channelId).trim() === String(payload.channelId).trim();
        const formatOk = !cfg.postFormat || cfg.postFormat === "all" || cfg.postFormat === payload.format;
        matches = Boolean(chOk && formatOk);
      } else if (name === "telegram.channel_comment_received.v1" && triggerNode.type === "telegram.channel_comment_received") {
        const cfg = (triggerNode.config || {}) as any;
        const chOk = !cfg.channelId || String(cfg.channelId).trim() === String(payload.channelId).trim();
        let kwOk = true;
        if (Array.isArray(cfg.keywords) && cfg.keywords.length > 0) {
          kwOk = matchesKeywords(payload.text || "", cfg.keywords);
        }
        matches = Boolean(chOk && kwOk);
      } else if (name === "meta.comment_received.v1" && triggerNode.type === "meta.comment_received") {
        const cfg = (triggerNode.config || {}) as any;
        // Validar post específico si se configuró ("all" o vacío significa cualquier post)
        const targetPostId = String(cfg.postId || "").trim();
        const postOk = !targetPostId || targetPostId.toLowerCase() === "all" || targetPostId === String(payload.postId || "").trim();

        // Validar si ignora respuestas anidadas a otros comentarios
        const ignoreNested = Boolean(cfg.ignoreReplies ?? cfg.ignoreNestedReplies ?? false);
        const nestOk = !ignoreNested || !payload.isNestedReply;

        // Validar canal
        const chOk = isChannelMatch(cfg.channels, payload.channel || payload.rawChannel);

        // Validar conexión / instancia específica
        const instOk =
          cfg.connectionMode !== "selected" ||
          (Array.isArray(cfg.instanceIds) && cfg.instanceIds.includes(payload.instanceId));

        // Validar palabras clave con normalización semántica
        let kwOk = true;
        if (Array.isArray(cfg.keywords) && cfg.keywords.length > 0) {
          kwOk = matchesKeywords(payload.text || "", cfg.keywords);
        }

        // Validar cooldown por (workflow_id, sender_id, post_id) (once_per_user_per_post)
        let cooldownOk = true;
        const oncePerUser = Boolean(cfg.oncePerUserPerPost ?? true);
        if (oncePerUser && payload.senderId && payload.postId) {
          const { data: priorExec } = await (supabaseAdmin as any)
            .from("automation_executions")
            .select("id")
            .eq("company_id", companyId)
            .eq("workflow_id", wf.id)
            .filter("context->trigger->>senderId", "eq", String(payload.senderId))
            .filter("context->trigger->>postId", "eq", String(payload.postId))
            .limit(1)
            .maybeSingle();

          if (priorExec?.id) {
            cooldownOk = false;
          }
        }

        matches = Boolean(postOk && nestOk && chOk && instOk && kwOk && cooldownOk);
      } else if (name === "crm.card.stage_changed.v1" && triggerNode.type === "crm.card_stage_changed") {
        const cfg = (triggerNode.config || {}) as any;
        const pipeOk = !cfg.pipelineId || cfg.pipelineId === payload.pipelineId;
        const fromOk = !cfg.fromStageId || cfg.fromStageId === payload.fromStageId;
        const toOk = !cfg.toStageId || cfg.toStageId === payload.toStageId;
        matches = Boolean(pipeOk && fromOk && toOk);
      } else if (name === "crm.card.created.v1" && triggerNode.type === "crm.card_created") {
        const cfg = (triggerNode.config || {}) as any;
        const pipeOk = !cfg.pipelineId || cfg.pipelineId === payload.pipelineId;
        const stOk = !cfg.stageId || cfg.stageId === payload.stageId;
        matches = Boolean(pipeOk && stOk);
      } else if (name === "crm.card.owner_changed.v1" && triggerNode.type === "crm.card_owner_changed") {
        const cfg = (triggerNode.config || {}) as any;
        const ownerOk = !cfg.toOwnerId || cfg.toOwnerId === payload.toOwnerId;
        matches = Boolean(ownerOk);
      } else if (name === "crm.card.tags_changed.v1" && triggerNode.type === "crm.card_tags_changed") {
        const cfg = (triggerNode.config || {}) as any;
        const targetTag = String(cfg.tag || "").trim().toLowerCase();
        const tagsAfter = Array.isArray(payload.tagsAfter) ? payload.tagsAfter : [];
        const tagOk = !targetTag || tagsAfter.some((t: string) => String(t).toLowerCase() === targetTag);
        matches = Boolean(tagOk);
      }

      if (matches) {
        // Reentrada
        const subjectId = payload.cardId || payload.phone || payload.externalConversationId || payload.senderId || payload.commentId;
        if (graph.settings?.reentry === "deny_while_active" && subjectId) {
          const { data: activeExec } = await (supabaseAdmin as any)
            .from("automation_executions")
            .select("id, event_id")
            .eq("company_id", companyId)
            .eq("workflow_id", wf.id)
            .eq("subject_id", String(subjectId))
            .in("status", ["queued", "running", "waiting"])
            .limit(1)
            .maybeSingle();

          if (activeExec && activeExec.event_id !== event.id) continue;
        }

        if (graph.settings?.reentry === "replace_active" && subjectId) {
          try {
            await (supabaseAdmin as any)
              .from("automation_executions")
              .update({
                status: "cancelled",
                finished_at: new Date().toISOString(),
                error_code: "REPLACED_BY_REENTRY",
              })
              .eq("company_id", companyId)
              .eq("workflow_id", wf.id)
              .eq("subject_id", String(subjectId))
              .in("status", ["queued", "running", "waiting"]);
          } catch (e) {
            console.warn("[dispatchDomainEvent] Error cancelando ejecuciones activas en replace_active:", e);
          }
        }

        const firstEdge = graph.edges.find((e) => e.source === triggerNode.id);
        if (!firstEdge) continue;

        // Cargar datos de tarjeta con aislamiento estricto de empresa
        const { data: cardRow } = payload.cardId
          ? await (supabaseAdmin as any)
              .from("crm_cards")
              .select("id, company_id, nome, numero, canal_chat, canal_entrada, pipeline_id, stage_id, owner_id, tags, valor, email, campos_extras")
              .eq("company_id", companyId)
              .eq("id", payload.cardId)
              .maybeSingle()
          : { data: null };

        const initialContext = {
          trigger: payload,
          card: cardRow || null,
        };

        const resolvedChannel = payload.channel || cardRow?.canal_chat || null;
        const resolvedInstanceId = payload.instanceId || cardRow?.campos_extras?.instance_id || null;

        const { data: started, error: startErr } = await (supabaseAdmin as any)
          .rpc("automation_start_execution", {
            p_company_id: companyId, p_workflow_id: wf.id,
            p_version_id: wf.active_version_id, p_event_id: validEventId,
            p_subject_type: payload.cardId ? "crm_card" : "contact",
            p_subject_id: String(subjectId || ""), p_channel: resolvedChannel,
            p_instance_id: resolvedInstanceId,
            p_conversation_id: payload.externalConversationId || payload.phone || null,
            p_card_id: payload.cardId || null, p_node_id: firstEdge.target,
            p_context: initialContext,
          });
        if (startErr) throw startErr;
        if (started?.state === "started" || started?.state === "repaired") triggeredCount++;
        break; // Respetar índice único por (company_id, workflow_id, event_id)
      }
    }
  }

  if (validEventId) {
    try {
      await (supabaseAdmin as any)
        .from("automation_events")
        .update({ processing_state: "processed" })
        .eq("id", validEventId);
    } catch {}
  }

  return { triggered: triggeredCount };
}
