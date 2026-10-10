import { createFileRoute } from "@tanstack/react-router";
import { assertCronRequest } from "@/lib/cron-auth.server";

/**
 * Backup periódico de Meta. O webhook continua sendo o caminho em tempo real;
 * este job recupera conversas/comentários perdidos y reconcilia el estado.
 */
export const Route = createFileRoute("/api/public/hooks/meta-sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = assertCronRequest(request);
        if (denied) return denied;
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const url = new URL(request.url);
          const full = url.searchParams.get("full") === "1";
          const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 50) || 50, 1), 50);
          const { syncMetaChannels } = await import("@/lib/meta-sync.server");
          const results = await syncMetaChannels(supabaseAdmin, { full, limit });
          return Response.json({ ok: true, full, results });
        } catch (error) {
          console.error("[meta-sync]", error);
          return Response.json({ ok: false, error: error instanceof Error ? error.message : "Falha na sincronização Meta" }, { status: 500 });
        }
      },
    },
  },
});
