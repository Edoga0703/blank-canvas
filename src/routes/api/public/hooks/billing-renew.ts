import { createFileRoute } from "@tanstack/react-router";
import { assertCronRequest } from "@/lib/cron-auth.server";

// Cron diário: gera as cobranças do próximo ciclo (plano + adicionais ativos).
export const Route = createFileRoute("/api/public/hooks/billing-renew")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const deny = assertCronRequest(request);
        if (deny) return deny;
        try {
          const { runBillingRenewals } = await import("@/lib/billing/charges.server");
          const res = await runBillingRenewals({ diasAntes: 3 });
          return Response.json({ ok: true, ...res });
        } catch (e) {
          return Response.json({ ok: false, error: (e as Error)?.message }, { status: 500 });
        }
      },
    },
  },
});
