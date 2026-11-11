import { createFileRoute } from "@tanstack/react-router";
import { assertCronRequest } from "@/lib/cron-auth.server";
import { processContentTargetsBatch } from "@/lib/content/queue.server";

/**
 * Worker seguro de fila duradoura para publicação multicanal (Instagram, Facebook, TikTok, YouTube).
 * Disparado periodicamente por cron/pg_cron.
 * Adquire targets atomicamente via RPC claim_content_target (FOR UPDATE SKIP LOCKED)
 * e orquestra o envio isolado por tenant e plataforma.
 */
export const Route = createFileRoute("/api/public/hooks/process-content-posts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const _cronDeny = assertCronRequest(request);
        if (_cronDeny) return _cronDeny;

        try {
          const workerId = `worker-${crypto.randomUUID().slice(0, 8)}`;
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
          console.error("[process-content-posts] Erro fatal no worker:", error);
          return new Response(
            JSON.stringify({
              ok: false,
              error: error?.message || "Erro interno no processamento da fila de conteúdo.",
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
