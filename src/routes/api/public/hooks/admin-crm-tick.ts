import { createFileRoute } from "@tanstack/react-router";
import { assertCronRequest } from "@/lib/cron-auth.server";

// Cron: gatilhos do CRM interno do admin (boas-vindas, trial, inadimplência, inatividade).
export const Route = createFileRoute("/api/public/hooks/admin-crm-tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const _cronDeny = assertCronRequest(request);
        if (_cronDeny) return _cronDeny;
        try {
          const { syncAdminContacts, runAdminAutomations } = await import("@/lib/admin-crm.server");
          const sync = await syncAdminContacts().catch((e: Error) => ({ erro: e.message }));
          const run = await runAdminAutomations();
          return new Response(JSON.stringify({ ok: true, sync, run }), {
            headers: { "Content-Type": "application/json" },
          });
        } catch (e) {
          return new Response(JSON.stringify({ ok: false, error: (e as Error)?.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
