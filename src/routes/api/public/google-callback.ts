import { createFileRoute } from "@tanstack/react-router";
import { verifyState } from "@/lib/google.server";

export const Route = createFileRoute("/api/public/google-callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        if (!code || !state) return new Response("missing params", { status: 400 });
        const v = verifyState(state);
        if (!v) return new Response("invalid state", { status: 400 });

        const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
        const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET;
        if (!clientId || !clientSecret) return new Response("oauth not configured", { status: 500 });

        const envUrl = process.env.PUBLIC_APP_URL || process.env.APP_URL;
        const origin = envUrl
          ? envUrl.replace(/\/+$/, "")
          : url.host.includes("metrixcrm.com.br")
          ? "https://metrixcrm.com.br"
          : `${request.headers.get("x-forwarded-proto") || url.protocol.replace(":", "")}://${request.headers.get("x-forwarded-host") || url.host}`;
        const redirectUri = `${origin}/api/public/google-callback`;
        const tokRes = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            code, client_id: clientId, client_secret: clientSecret,
            redirect_uri: redirectUri, grant_type: "authorization_code",
          }),
        });
        const tok = await tokRes.json();
        if (!tok.access_token) {
          return new Response(`token exchange failed: ${JSON.stringify(tok)}`, { status: 400 });
        }

        // Get email
        let email: string | null = null;
        try {
          const infoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
            headers: { Authorization: `Bearer ${tok.access_token}` },
          });
          const info = await infoRes.json();
          email = info?.email ?? null;
        } catch {}

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        await supabaseAdmin.from("google_integration").upsert({
          company_id: v.companyId,
          email,
          access_token: tok.access_token,
          refresh_token: tok.refresh_token ?? null,
          expiry: new Date(Date.now() + (tok.expires_in ?? 3600) * 1000).toISOString(),
          calendar_id: "primary",
          conectado: true,
          precisa_reconectar: false,
          sync_token: null,
        } as any, { onConflict: "company_id" });

        // Abre o canal de notificações (Google -> CRM). Não bloqueia o login.
        try {
          const { startCalendarWatch } = await import("@/lib/google.server");
          await startCalendarWatch(supabaseAdmin as any, v.companyId, `${origin}/api/public/hooks/google-calendar`);
        } catch (e: any) {
          console.error("[gcal] watch inicial falhou:", e?.message || e);
        }


        const redirectTarget = v.redirectTo || "/app/agendamentos";
        return new Response(
          `<!doctype html><meta charset="utf-8"><title>Google Conectado</title>
<body style="font-family:system-ui;background:#081410;color:#e5f3ea;display:grid;place-items:center;min-height:100vh;margin:0">
<div style="text-align:center;padding:24px">
<h1>✅ Google conectado${email ? ` (${email})` : ""}</h1>
<p>Cuenta conectada exitosamente. Redirigiendo...</p>
<script>
  setTimeout(() => {
    if (window.opener) {
      window.opener.postMessage({ type: "GOOGLE_AUTH_SUCCESS" }, "*");
      window.close();
    } else {
      location.href = "${redirectTarget}";
    }
  }, 1200);
</script>
</div></body>`,
          { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } },
        );
      },
    },
  },
});
