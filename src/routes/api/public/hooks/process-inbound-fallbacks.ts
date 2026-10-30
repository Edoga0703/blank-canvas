import { createFileRoute } from "@tanstack/react-router";
import { assertCronRequest } from "@/lib/cron-auth.server";
import { processInboundFallbackJobs } from "@/lib/automations/fallback.server";

export const Route = createFileRoute("/api/public/hooks/process-inbound-fallbacks")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = assertCronRequest(request);
        if (denied) return denied;
        try {
          const processed = await processInboundFallbackJobs(1);
          return Response.json({ ok: true, processed });
        } catch (error: any) {
          console.error("[process-inbound-fallbacks]", error?.message);
          return Response.json({ ok: false, error: error?.message }, { status: 500 });
        }
      },
    },
  },
});
