import { createFileRoute } from "@tanstack/react-router";
import { assertCronRequest } from "@/lib/cron-auth.server";

// Cron: dispara lembretes de agendamentos e mensagens programadas.
export const Route = createFileRoute("/api/public/hooks/process-agendamentos")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const _cronDeny = assertCronRequest(request);
        if (_cronDeny) return _cronDeny;
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          
          // Reutiliza a lógica existente de dispatch
          // Isso garante que tanto o endpoint antigo quanto o novo funcionem.
          const url = new URL(request.url);
          const publicOrigin = url.origin;
          
          const response = await fetch(`${publicOrigin}/api/public/hooks/agendamentos-dispatch`, {
            method: 'POST',
            headers: {
              'Authorization': request.headers.get('Authorization') || '',
              'Content-Type': 'application/json'
            }
          });
          
          const data = await response.json();
          
          return new Response(JSON.stringify(data), {
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