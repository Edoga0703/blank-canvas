import { createFileRoute } from "@tanstack/react-router";
import { assertCronRequest } from "@/lib/cron-auth.server";
import { processMetaLeadDeliveries } from "@/lib/meta-lead-deliveries.server";

export const Route = createFileRoute("/api/public/hooks/process-meta-leads")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = assertCronRequest(request);
        if (denied) return denied;
        try {
          const processed = await processMetaLeadDeliveries(3);
          return Response.json({ ok: true, processed });
        } catch (error: any) {
          console.error("[process-meta-leads]", error?.message);
          return Response.json({ ok: false, error: error?.message }, { status: 500 });
        }
      },
    },
  },
});
