import { createFileRoute } from "@tanstack/react-router";
import { assertCronRequest } from "@/lib/cron-auth.server";
import { processContentTargetsBatch } from "@/lib/content/queue.server";

/**
 * Worker seguro de processamento de publicações agendadas (Omnichannel Content Hub).
 * Executado periodicamente via cron ou pg_cron.
 * Reclama publicações agendadas e alvos pendentes com trava atômica (evita dupla execução)
 * e orquestra a publicação nos canais cadastrados.
 */
export const Route = createFileRoute("/api/public/hooks/process-scheduled-posts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const _cronDeny = assertCronRequest(request);
        if (_cronDeny) return _cronDeny;

        try {
          const workerId = `sched-${crypto.randomUUID().slice(0, 8)}`;
          const { processedCount, results } = await processContentTargetsBatch(workerId, 10);

          return new Response(
            JSON.stringify({
              ok: true,
              workerId,
              processed: processedCount,
              results,
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            }
          );
        } catch (error: any) {
          console.error("[process-scheduled-posts] Erro fatal no worker:", error);
          return new Response(
            JSON.stringify({
              ok: false,
              error: error?.message || "Erro interno ao processar posts agendados.",
            }),
            {
              status: 500,
              headers: { "Content-Type": "application/json" },
            }
          );
        }
      },
    },
  },
});
