import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/google-marketing-callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        if (!code || !state) return new Response("missing params", { status: 400 });

        const { lerStateMarketing, trocarCodigo, conectarConta } = await import(
          "@/lib/google-marketing.server"
        );
        const v = lerStateMarketing(state);
        if (!v) return new Response("invalid state", { status: 400 });

        const origin = url.host.includes("metrixcrm.com.br")
          ? "https://metrixcrm.com.br"
          : `${url.protocol}//${url.host}`;

        try {
          const tok = await trocarCodigo(code, `${origin}/api/public/google-marketing-callback`);
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          await conectarConta(supabaseAdmin as any, v.companyId, v.servico, tok);
        } catch (e: any) {
          return new Response(String(e?.message ?? e), { status: 400 });
        }

        const nome = v.servico === "google-ads" ? "Google Ads" : "Google Analytics";
        return new Response(
          `<!doctype html><meta charset="utf-8"><title>${nome} conectado</title>
<body style="font-family:system-ui;background:#0B1020;color:#eef2ff;display:grid;place-items:center;min-height:100vh;margin:0">
<div style="text-align:center;padding:24px">
<h1>✅ ${nome} conectado</h1>
<p>Pode voltar para o Metrix CRM.</p>
<script>setTimeout(()=>{ if(window.opener){window.close()} else {location.href="/app/plugins"} },1500)</script>
</div></body>`,
          { status: 200, headers: { "content-type": "text/html; charset=utf-8" } },
        );
      },
    },
  },
});
