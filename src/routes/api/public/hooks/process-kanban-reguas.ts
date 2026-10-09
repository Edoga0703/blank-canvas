import { createFileRoute } from "@tanstack/react-router";
import { assertCronRequest } from "@/lib/cron-auth.server";

// Cron: processa a régua de automação do Kanban (follow-up / pós-venda / comercial).
export const Route = createFileRoute("/api/public/hooks/process-kanban-reguas")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const _cronDeny = assertCronRequest(request);
        if (_cronDeny) return _cronDeny;
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { processKanbanReguas } = await import("@/lib/kanban-engine.server");
          const r = await processKanbanReguas(supabaseAdmin);
          return new Response(JSON.stringify({ ok: true, ...r }), {
            headers: { "Content-Type": "application/json" },
          });
        } catch (e: any) {
          return new Response(JSON.stringify({ ok: false, error: e?.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
