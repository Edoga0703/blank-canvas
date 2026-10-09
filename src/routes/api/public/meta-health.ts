import { createFileRoute } from "@tanstack/react-router";

// Job de saúde dos canais Meta: revalida os tokens e marca conexões expiradas.
// Protegido pelo mesmo token de verificação usado nos webhooks Meta.
export const Route = createFileRoute("/api/public/meta-health")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env["META_WEBHOOK_VERIFY_TOKEN"];
        const provided =
          request.headers.get("x-cron-token") || new URL(request.url).searchParams.get("token");
        if (!expected || provided !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { isTokenValid } = await import("@/lib/meta-oauth.server");

        const { data: rows } = await (supabaseAdmin as any)
          .from("whatsapp_instances")
          .select("id,instance_token,status")
          .like("provider", "meta%")
          .limit(500);

        let expired = 0;
        for (const r of rows ?? []) {
          const ok = r.instance_token ? await isTokenValid(r.instance_token) : false;
          if (!ok) expired += 1;
          if ((r.status === "connected") !== ok) {
            await (supabaseAdmin as any)
              .from("whatsapp_instances")
              .update({ status: ok ? "connected" : "expired", last_state_at: new Date().toISOString() })
              .eq("id", r.id);
          }
        }

        // limpeza de sessões OAuth vencidas
        await (supabaseAdmin as any)
          .from("meta_oauth_session")
          .delete()
          .lt("expires_at", new Date().toISOString());

        return Response.json({ ok: true, checked: (rows ?? []).length, expired });
      },
    },
  },
});
