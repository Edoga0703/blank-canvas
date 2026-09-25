import { createFileRoute } from "@tanstack/react-router";
import { assertCronRequest } from "@/lib/cron-auth.server";

/**
 * Cron: renova os canais de notificação do Google Calendar (expiram em ~7 dias)
 * e faz um pull de segurança das mudanças recentes.
 */
export const Route = createFileRoute("/api/public/hooks/google-calendar-renew")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const deny = assertCronRequest(request);
        if (deny) return deny;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { startCalendarWatch, pullCalendarChanges } = await import("@/lib/google.server");

        const origin = new URL(request.url).origin;
        const callbackUrl = `${origin}/api/public/hooks/google-calendar`;

        const { data: rows } = await (supabaseAdmin as any)
          .from("google_integration")
          .select("company_id, channel_expira_em")
          .eq("conectado", true)
          .limit(200);

        const results: any[] = [];
        for (const gi of rows ?? []) {
          try {
            const exp = gi.channel_expira_em ? new Date(gi.channel_expira_em).getTime() : 0;
            if (!exp || exp < Date.now() + 24 * 3600_000) {
              const r = await startCalendarWatch(supabaseAdmin as any, gi.company_id, callbackUrl);
              results.push({ company: gi.company_id, watch: r });
            }
            await pullCalendarChanges(supabaseAdmin as any, gi.company_id);
          } catch (e: any) {
            results.push({ company: gi.company_id, error: e?.message || String(e) });
          }
        }
        return Response.json({ ok: true, processados: (rows ?? []).length, results });
      },
    },
  },
});
