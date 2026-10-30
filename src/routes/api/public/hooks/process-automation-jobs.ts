// src/routes/api/public/hooks/process-automation-jobs.ts
import { createFileRoute } from "@tanstack/react-router";
import { assertCronRequest } from "@/lib/cron-auth.server";
import {
  runOneAutomationJob,
  resumeExpiredWaitingExecutions,
  reconcileOrphanRunningExecutions,
} from "@/lib/automations/queue.server";
import { processPendingAutomationEvents } from "@/lib/automations/events.server";

// Cron: procesa la outbox de eventos, ejecuta trabajos pendientes, reanuda esperas y reconcilia huérfanos
export const Route = createFileRoute("/api/public/hooks/process-automation-jobs")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const deny = assertCronRequest(request);
        if (deny) return deny;

        const startedAt = Date.now();
        const maxTimeMs = 7_500; // Presupuesto estricto de 7.5s para no superar límites serverless (8-10s)
        const batchLimit = 20;

        let processedEvents = 0;
        let resumedExecutions = 0;
        let processedJobs = 0;
        let reconciledOrphans = 0;

        try {
          // Fase 1: Procesar eventos pendientes de la outbox (creación y cambios de tarjeta) si hay tiempo
          if (Date.now() - startedAt < maxTimeMs - 2000) {
            processedEvents = await processPendingAutomationEvents(10);
          }

          // Fase 2: Reanudar esperas vencidas (timeout de reply o esperas temporales) si hay tiempo
          if (Date.now() - startedAt < maxTimeMs - 1500) {
            resumedExecutions = await resumeExpiredWaitingExecutions(10);
          }

          // Fase 3: Procesar cola de trabajos con reclamo CAS
          while (processedJobs < batchLimit && Date.now() - startedAt < maxTimeMs - 500) {
            const didWork = await runOneAutomationJob({
              workerId: `worker_${process.pid || "cron"}`,
              leaseSeconds: 60,
            });
            if (!didWork) break;
            processedJobs++;
          }

          // Fase 4: Reconciliar ejecuciones huérfanas si aún sobra tiempo
          if (Date.now() - startedAt < maxTimeMs - 500) {
            reconciledOrphans = await reconcileOrphanRunningExecutions(5);
          }

          return new Response(
            JSON.stringify({
              ok: true,
              processedEvents,
              resumedExecutions,
              processedJobs,
              reconciledOrphans,
              durationMs: Date.now() - startedAt,
            }),
            { headers: { "Content-Type": "application/json" } }
          );
        } catch (e: any) {
          console.error("[process-automation-jobs] Error en ciclo cron:", e?.message);
          return new Response(
            JSON.stringify({ ok: false, error: e?.message }),
            { status: 500, headers: { "Content-Type": "application/json" } }
          );
        }
      },
    },
  },
});
