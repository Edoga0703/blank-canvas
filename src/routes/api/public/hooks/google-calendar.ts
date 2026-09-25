import { createFileRoute } from "@tanstack/react-router";

/**
 * Webhook de notificação do Google Calendar (push channel).
 * O Google envia apenas cabeçalhos; identificamos a empresa pelo channel_id
 * e validamos o token secreto do canal antes de sincronizar.
 */
export const Route = createFileRoute("/api/public/hooks/google-calendar")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const channelId = request.headers.get("x-goog-channel-id");
        const token = request.headers.get("x-goog-channel-token");
        const state = request.headers.get("x-goog-resource-state");
        if (!channelId) return new Response("missing channel", { status: 400 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: gi } = await (supabaseAdmin as any)
          .from("google_integration")
          .select("company_id, channel_token")
          .eq("channel_id", channelId)
          .maybeSingle();
        if (!gi) return new Response("unknown channel", { status: 404 });
        if (gi.channel_token && gi.channel_token !== token) {
          return new Response("invalid token", { status: 401 });
        }
        // "sync" é apenas o handshake inicial do canal.
        if (state === "sync") return new Response("ok");

        try {
          const { pullCalendarChanges } = await import("@/lib/google.server");
          const r = await pullCalendarChanges(supabaseAdmin as any, gi.company_id);
          return Response.json(r);
        } catch (e: any) {
          console.error("[gcal webhook]", e?.message || e);
          return new Response("error", { status: 500 });
        }
      },
    },
  },
});
