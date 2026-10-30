// src/lib/automations/events.server.ts
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { DomainEvent } from "./types";
import type { WorkflowGraph } from "./schema";
import { randomUUID } from "node:crypto";

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

  // 1. Verificar si hay ejecuciones esperando respuesta en este mismo hilo de conversación
  if (name === "messaging.inbound_received.v1" && payload?.externalConversationId) {
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

        // BLOQUEO CRÍTICO: SOLO despertar si el nodo es explícitamente "messaging.wait_for_reply"
        // NUNCA despertar si el nodo es "control.wait_duration" (espera de tiempo)
        if (currentNode?.type !== "messaging.wait_for_reply") {
          continue;
        }

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
              p_context_patch: { lastReply: payload },
              p_require_due: false,
            });
          if (wakeErr) throw wakeErr;
          if (woke) wokeCount++;
        }
      }
      if (wokeCount > 0) return { triggered: wokeCount };
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
    return { triggered: 0 };
  }

  const activeVersionIds = workflows
    .map((w: any) => w.active_version_id)
    .filter(Boolean);

  if (activeVersionIds.length === 0) {
    return { triggered: 0 };
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

  let triggeredCount = 0;

  for (const wf of workflows) {
    const graph = versionMap.get(wf.active_version_id);
    if (!graph || !graph.nodes) continue;

    const triggerNode = graph.nodes.find(
      (n) => n.type === "messaging.inbound_received" || n.type.startsWith("crm.card")
    );
    if (!triggerNode) continue;

    // Comprobar coincidencia del evento
    let matches = false;

    if (name === "messaging.inbound_received.v1" && triggerNode.type === "messaging.inbound_received") {
      const cfg = (triggerNode.config || {}) as any;
      // Validar canal
      const chOk = !cfg.channels || cfg.channels.length === 0 || (payload.channel && cfg.channels.includes(payload.channel));
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
        const text = String(payload.text || "").toLowerCase();
        kwOk = cfg.keywords.some((k: string) => text.includes(String(k).toLowerCase().trim()));
      }

      matches = Boolean(chOk && instOk && convOk && kwOk);
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
      const subjectId = payload.cardId || payload.phone || payload.externalConversationId;
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

      const firstEdge = graph.edges.find((e) => e.source === triggerNode.id);
      if (!firstEdge) continue;

      // Cargar datos de tarjeta con aislamiento estricto de empresa
      const { data: cardRow } = payload.cardId
        ? await (supabaseAdmin as any)
            .from("crm_cards")
            .select("id, company_id, nome, numero, pipeline_id, stage_id, owner_id, tags, valor, email, campos_extras")
            .eq("company_id", companyId)
            .eq("id", payload.cardId)
            .maybeSingle()
        : { data: null };

      const initialContext = {
        trigger: payload,
        card: cardRow || null,
      };

      const { data: started, error: startErr } = await (supabaseAdmin as any)
        .rpc("automation_start_execution", {
          p_company_id: companyId, p_workflow_id: wf.id,
          p_version_id: wf.active_version_id, p_event_id: event.id,
          p_subject_type: payload.cardId ? "crm_card" : "contact",
          p_subject_id: String(subjectId || ""), p_channel: payload.channel || null,
          p_instance_id: payload.instanceId || null,
          p_conversation_id: payload.externalConversationId || payload.phone || null,
          p_card_id: payload.cardId || null, p_node_id: firstEdge.target,
          p_context: initialContext,
        });
      if (startErr) throw startErr;
      if (started?.state === "started" || started?.state === "repaired") triggeredCount++;
    }
  }

  return { triggered: triggeredCount };
}
