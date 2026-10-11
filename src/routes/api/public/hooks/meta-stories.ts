import { createFileRoute } from "@tanstack/react-router";
import { assertCronRequest } from "@/lib/cron-auth.server";

/**
 * Captura periódica de Stories do Instagram antes que expirem (24h).
 * Protegido por x-cron-secret; uma execução por vez; processa por lotes.
 */
export const Route = createFileRoute("/api/public/hooks/meta-stories")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = assertCronRequest(request);
        if (denied) return denied;
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const url = new URL(request.url);
          const batchSize = Math.min(Math.max(Number(url.searchParams.get("batch") ?? 25) || 25, 1), 100);
          const { runStoriesCron } = await import("@/lib/meta-content-sync.server");
          return Response.json(await runStoriesCron(supabaseAdmin, { batchSize }));
        } catch (error) {
          console.error("[meta-stories]", error);
          return Response.json({ ok: false, error: error instanceof Error ? error.message : "Falha na captura de Stories" }, { status: 500 });
        }
      },
    },
  },
});
