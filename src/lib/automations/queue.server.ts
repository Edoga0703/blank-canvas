// src/lib/automations/queue.server.ts
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getNodeDefinition } from "./registry.server";
import type { WorkflowGraph } from "./schema";
import type { AutomationExecutionContext } from "./types";
import { releaseWorkflowControl } from "./conversation-control.server";

/**
 * Reclama y procesa un trabajo pendiente de la cola.
 * Utiliza CAS (Compare-And-Swap) para garantizar ejecución única ante workers concurrentes.
 */
export async function runOneAutomationJob(params: {
  workerId: string;
  leaseSeconds?: number;
}): Promise<boolean> {
  const { workerId, leaseSeconds = 60 } = params;
  const now = new Date();
  const nowIso = now.toISOString();
  const leaseUntilIso = new Date(now.getTime() + leaseSeconds * 1000).toISOString();

  // 1. Encontrar el próximo job listo (pending o lease vencido)
  const { data: jobs } = await (supabaseAdmin as any)
    .from("automation_jobs")
    .select("id, company_id, execution_id, node_id, attempts, max_attempts")
    .or(`status.eq.pending,and(status.eq.leased,lease_until.lt.${nowIso})`)
    .lte("run_after", nowIso)
    .order("run_after", { ascending: true })
    .limit(1);

  const job = jobs?.[0];
  if (!job) return false;

  // 2. Reclamo atómico (CAS): solo tiene éxito si el estado sigue pending o el lease sigue vencido
  const { data: claimed } = await (supabaseAdmin as any)
    .from("automation_jobs")
    .update({
      status: "leased",
      lease_owner: workerId,
      lease_until: leaseUntilIso,
      attempts: (job.attempts || 0) + 1,
    })
    .eq("id", job.id)
    .or(`status.eq.pending,and(status.eq.leased,lease_until.lt.${nowIso})`)
    .select("id")
    .maybeSingle();

  if (!claimed) return false; // Otro worker concurrente lo reclamó primero

  // 3. Cargar ejecución y versión de flujo
  const { data: exec } = await (supabaseAdmin as any)
    .from("automation_executions")
    .select("*")
    .eq("id", job.execution_id)
    .eq("company_id", job.company_id)
    .maybeSingle();

  if (!exec || exec.status !== "running" || exec.current_node_id !== job.node_id) {
    await (supabaseAdmin as any)
      .from("automation_jobs")
      .update({ status: "done" })
      .eq("id", job.id);
    return true;
  }

  const { data: versionRow } = await (supabaseAdmin as any)
    .from("automation_workflow_versions")
    .select("graph")
    .eq("id", exec.workflow_version_id)
    .eq("company_id", job.company_id)
    .maybeSingle();

  const graph = versionRow?.graph as WorkflowGraph | undefined;
  const node = graph?.nodes?.find((n) => n.id === job.node_id);

  if (!node) {
    await (supabaseAdmin as any)
      .from("automation_executions")
      .update({
        status: "failed",
        error_code: "NODE_NOT_FOUND",
        error_summary: `Nodo "${job.node_id}" no encontrado en el grafo`,
        finished_at: nowIso,
      })
      .eq("id", exec.id);

    await (supabaseAdmin as any)
      .from("automation_jobs")
      .update({ status: "dead", last_error: `Node ${job.node_id} not found` })
      .eq("id", job.id);
    return true;
  }

  // 3a. Control de presupuesto de pasos y tiempo para evitar bucles infinitos
  const maxSteps = graph?.settings?.maxSteps || 100;
  const currentStepCount = Number(exec.context?.stepCount || 0);
  if (currentStepCount >= maxSteps) {
    await (supabaseAdmin as any)
      .from("automation_executions")
      .update({
        status: "failed",
        error_code: "MAX_STEPS_EXCEEDED",
        error_summary: `Se superó el límite de pasos permitido (${maxSteps}). Posible bucle infinito detectado.`,
        finished_at: nowIso,
      })
      .eq("id", exec.id);

    await (supabaseAdmin as any)
      .from("automation_jobs")
      .update({ status: "dead", last_error: "Max steps exceeded" })
      .eq("id", job.id);

    if (exec.external_conversation_id) {
      await releaseWorkflowControl({
        companyId: job.company_id,
        externalConversationId: exec.external_conversation_id,
        executionId: exec.id,
        instanceId: exec.source_instance_id,
      });
    }
    return true;
  }

  const maxRuntimeSec = graph?.settings?.maxRuntimeSeconds || 86400;
  const elapsedSec = (Date.now() - new Date(exec.started_at || exec.created_at).getTime()) / 1000;
  if (elapsedSec > maxRuntimeSec) {
    await (supabaseAdmin as any)
      .from("automation_executions")
      .update({
        status: "failed",
        error_code: "MAX_RUNTIME_EXCEEDED",
        error_summary: `La ejecución superó el tiempo máximo permitido (${maxRuntimeSec}s).`,
        finished_at: nowIso,
      })
      .eq("id", exec.id);

    await (supabaseAdmin as any)
      .from("automation_jobs")
      .update({ status: "dead", last_error: "Max runtime exceeded" })
      .eq("id", job.id);

    if (exec.external_conversation_id) {
      await releaseWorkflowControl({
        companyId: job.company_id,
        externalConversationId: exec.external_conversation_id,
        executionId: exec.id,
        instanceId: exec.source_instance_id,
      });
    }
    return true;
  }

  const handler = getNodeDefinition(node.type, node.version);
  if (!handler) {
    await (supabaseAdmin as any)
      .from("automation_executions")
      .update({
        status: "failed",
        error_code: "HANDLER_NOT_REGISTERED",
        error_summary: `Manejador para el nodo "${node.type}" no está registrado`,
        finished_at: nowIso,
      })
      .eq("id", exec.id);

    await (supabaseAdmin as any)
      .from("automation_jobs")
      .update({ status: "dead", last_error: `Handler ${node.type} not found` })
      .eq("id", job.id);
    return true;
  }

  // 4. Ejecutar el nodo
  const startTime = Date.now();
  const execContext: AutomationExecutionContext = {
    companyId: job.company_id,
    executionId: exec.id,
    workflowId: exec.workflow_id,
    versionId: exec.workflow_version_id,
    nodeId: node.id,
    context: exec.context || {},
    subject: exec.subject_id ? { type: exec.subject_type || "lead", id: exec.subject_id } : undefined,
    sourceChannel: exec.source_channel as any,
    sourceInstanceId: exec.source_instance_id,
    externalConversationId: exec.external_conversation_id,
  };

  try {
    const parsedConfig = handler.configSchema.parse(node.config || {});
    const result = await handler.execute(execContext, parsedConfig);
    const durationMs = Date.now() - startTime;

    // Registrar paso ejecutado
    await (supabaseAdmin as any).from("automation_step_runs").insert({
      company_id: job.company_id,
      execution_id: exec.id,
      node_id: node.id,
      attempt: job.attempts + 1,
      status: result.kind === "wait" ? "waiting" : "succeeded",
      input_redacted: { configKeys: Object.keys(node.config || {}) },
      output_redacted: { outputKeys: Object.keys(result.output || {}) },
      selected_port: (result as any).port || null,
      started_at: nowIso,
      finished_at: new Date().toISOString(),
      duration_ms: durationMs,
    });

    if (result.kind === "finish") {
      await (supabaseAdmin as any)
        .from("automation_executions")
        .update({
          status: "succeeded",
          finished_at: new Date().toISOString(),
          current_node_id: node.id,
        })
        .eq("id", exec.id);

      await (supabaseAdmin as any)
        .from("automation_jobs")
        .update({ status: "done" })
        .eq("id", job.id);

      if (exec.external_conversation_id) {
        await releaseWorkflowControl({
          companyId: job.company_id,
          externalConversationId: exec.external_conversation_id,
          executionId: exec.id,
          instanceId: exec.source_instance_id,
        });
      }
    } else if (result.kind === "wait") {
      await (supabaseAdmin as any)
        .from("automation_executions")
        .update({
          status: "waiting",
          wake_at: result.resumeAt,
          current_node_id: node.id,
        })
        .eq("id", exec.id);

      await (supabaseAdmin as any)
        .from("automation_jobs")
        .update({ status: "done" })
        .eq("id", job.id);
    } else if (result.kind === "next") {
      const selectedPort = result.port || "next";
      const edge = graph?.edges.find(
        (e) => e.source === node.id && (e.sourcePort === selectedPort || (!result.port && e.sourcePort === "next"))
      );

      if (edge?.target) {
        const nextStepCount = currentStepCount + 1;
        const jobKey = `job_${exec.id}_${edge.target}_s${nextStepCount}_${Date.now()}`;

        // Encolar job primero
        const { error: jobErr } = await (supabaseAdmin as any).from("automation_jobs").insert({
          company_id: job.company_id,
          execution_id: exec.id,
          node_id: edge.target,
          status: "pending",
          run_after: new Date().toISOString(),
          idempotency_key: jobKey,
        });

        if (jobErr) {
          console.error(`[runOneAutomationJob] Fallo al encolar job siguiente:`, jobErr.message);
          throw new Error(`Fallo al encolar job siguiente: ${jobErr.message}`);
        }

        await (supabaseAdmin as any)
          .from("automation_executions")
          .update({
            current_node_id: edge.target,
            context: {
              ...(exec.context || {}),
              stepCount: nextStepCount,
              ...(result.output ? { [node.id]: result.output } : {}),
            },
          })
          .eq("id", exec.id);
      } else {
        // Fin natural del flujo
        await (supabaseAdmin as any)
          .from("automation_executions")
          .update({
            status: "succeeded",
            finished_at: new Date().toISOString(),
          })
          .eq("id", exec.id);

        if (exec.external_conversation_id) {
          await releaseWorkflowControl({
            companyId: job.company_id,
            externalConversationId: exec.external_conversation_id,
            executionId: exec.id,
            instanceId: exec.source_instance_id,
          });
        }
      }

      await (supabaseAdmin as any)
        .from("automation_jobs")
        .update({ status: "done" })
        .eq("id", job.id);
    }

    return true;
  } catch (err: any) {
    const durationMs = Date.now() - startTime;
    console.error(`[runOneAutomationJob] Error en nodo ${node.id}:`, err?.message);

    await (supabaseAdmin as any).from("automation_step_runs").insert({
      company_id: job.company_id,
      execution_id: exec.id,
      node_id: node.id,
      attempt: job.attempts + 1,
      status: "failed",
      error_code: "EXECUTION_ERROR",
      error_summary: String(err?.message || err).slice(0, 500),
      started_at: nowIso,
      finished_at: new Date().toISOString(),
      duration_ms: durationMs,
    });

    if (job.attempts + 1 >= (job.max_attempts || 5)) {
      await (supabaseAdmin as any)
        .from("automation_executions")
        .update({
          status: "failed",
          error_code: "MAX_ATTEMPTS_EXCEEDED",
          error_summary: String(err?.message || err).slice(0, 500),
          finished_at: new Date().toISOString(),
        })
        .eq("id", exec.id);

      await (supabaseAdmin as any)
        .from("automation_jobs")
        .update({ status: "dead", last_error: String(err?.message || err) })
        .eq("id", job.id);

      if (exec.external_conversation_id) {
        await releaseWorkflowControl({
          companyId: job.company_id,
          externalConversationId: exec.external_conversation_id,
          executionId: exec.id,
          instanceId: exec.source_instance_id,
        });
      }
    } else {
      // Reintentar con backoff exponencial
      const delayMs = Math.min(300_000, Math.pow(2, job.attempts) * 5_000);
      const nextRunAfter = new Date(Date.now() + delayMs).toISOString();

      await (supabaseAdmin as any)
        .from("automation_jobs")
        .update({
          status: "pending",
          run_after: nextRunAfter,
          last_error: String(err?.message || err),
          lease_owner: null,
          lease_until: null,
        })
        .eq("id", job.id);
    }

    return true;
  }
}

/**
 * Reanuda ejecuciones vencidas con CAS atómico.
 */
export async function resumeExpiredWaitingExecutions(limit = 20): Promise<number> {
  const nowIso = new Date().toISOString();

  const { data: waitingList } = await (supabaseAdmin as any)
    .from("automation_executions")
    .select("id, company_id, workflow_version_id, current_node_id, context, external_conversation_id, source_instance_id")
    .eq("status", "waiting")
    .lte("wake_at", nowIso)
    .limit(limit);

  if (!waitingList || waitingList.length === 0) return 0;

  let resumed = 0;
  for (const exec of waitingList) {
    const { data: ver } = await (supabaseAdmin as any)
      .from("automation_workflow_versions")
      .select("graph")
      .eq("id", exec.workflow_version_id)
      .eq("company_id", exec.company_id)
      .maybeSingle();

    const graph = ver?.graph as WorkflowGraph | undefined;
    const currentNode = graph?.nodes?.find((n) => n.id === exec.current_node_id);

    let targetPort = "next";
    if (currentNode?.type === "messaging.wait_for_reply") {
      targetPort = "timeout";
    }

    const outEdge = graph?.edges?.find(
      (e) => e.source === exec.current_node_id && (e.sourcePort === targetPort || (!e.sourcePort && targetPort === "next"))
    );

    if (outEdge?.target) {
      const { data: woke, error: wakeErr } = await (supabaseAdmin as any)
        .rpc("automation_resume_waiting", {
          p_company_id: exec.company_id,
          p_execution_id: exec.id,
          p_expected_node: exec.current_node_id,
          p_target_node: outEdge.target,
          p_job_key: "job_" + exec.id + "_" + outEdge.target + "_wake_" + targetPort,
          p_context_patch: {},
          p_require_due: true,
        });
      if (wakeErr) throw wakeErr;
      if (woke) resumed++;
    } else {
      const { data: claimedEnd } = await (supabaseAdmin as any)
        .from("automation_executions")
        .update({
          status: "succeeded",
          wake_at: null,
          finished_at: nowIso,
        })
        .eq("id", exec.id)
        .eq("status", "waiting")
        .select("id")
        .maybeSingle();

      if (!claimedEnd) continue;

      if (exec.external_conversation_id) {
        await releaseWorkflowControl({
          companyId: exec.company_id,
          externalConversationId: exec.external_conversation_id,
          executionId: exec.id,
          instanceId: exec.source_instance_id,
        });
      }
      resumed++;
    }
  }

  return resumed;
}

/**
 * Reconcilia ejecuciones que quedaron en status "running" pero no tienen ningún trabajo pendiente o leased.
 */
export async function reconcileOrphanRunningExecutions(limit = 10): Promise<number> {
  const fiveMinAgoIso = new Date(Date.now() - 5 * 60 * 1000).toISOString();

  const { data: orphans } = await (supabaseAdmin as any)
    .from("automation_executions")
    .select("id, company_id, current_node_id, status, created_at")
    .eq("status", "running")
    .lte("created_at", fiveMinAgoIso)
    .limit(limit);

  if (!orphans || orphans.length === 0) return 0;

  let reconciled = 0;
  for (const exec of orphans) {
    const { data: activeJobs } = await (supabaseAdmin as any)
      .from("automation_jobs")
      .select("id")
      .eq("execution_id", exec.id)
      .in("status", ["pending", "leased"])
      .limit(1);

    if (!activeJobs || activeJobs.length === 0) {
      // No tiene jobs vivos: marcar como needs_review para no dejar ejecución trabada
      await (supabaseAdmin as any)
        .from("automation_executions")
        .update({
          status: "needs_review",
          error_code: "ORPHAN_RUNNING_EXECUTION",
          error_summary: "La ejecución quedó sin trabajos activos tras tiempo límite.",
          finished_at: new Date().toISOString(),
        })
        .eq("id", exec.id);
      reconciled++;
    }
  }

  return reconciled;
}
