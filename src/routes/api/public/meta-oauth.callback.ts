import { createFileRoute } from "@tanstack/react-router";

// Retorno do Facebook Login for Business.
// Troca o code por token de longa duração, guarda a sessão e devolve o usuário ao app.
export const Route = createFileRoute("/api/public/meta-oauth/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const rawState = url.searchParams.get("state") ?? "";
        const code = url.searchParams.get("code") ?? "";
        const error =
          url.searchParams.get("error_description") ||
          url.searchParams.get("error_message") ||
          url.searchParams.get("error");

        const { verifyState, exchangeCodeForLongLivedToken } = await import("@/lib/meta-oauth.server");
        const state = rawState ? await verifyState(rawState) : null;
        const origin = state?.o ?? url.origin;

        const back = (params: Record<string, string>) => {
          const target = new URL("/app/conexao", origin);
          for (const [k, v] of Object.entries(params)) target.searchParams.set(k, v);
          return new Response(null, { status: 302, headers: { Location: target.toString() } });
        };

        if (!state) return back({ meta: "erro", msg: "Sessão de login inválida ou expirada." });
        if (error) return back({ meta: "erro", msg: error });
        if (!code) return back({ meta: "erro", msg: "A Meta não retornou o código de autorização." });

        try {
          const userToken = await exchangeCodeForLongLivedToken(code, origin);
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { error: dbError } = await (supabaseAdmin as any).from("meta_oauth_session").insert({
            handle: state.n,
            company_id: state.c,
            user_id: state.u,
            user_token: userToken,
          });
          if (dbError) throw new Error(dbError.message);
          return back({ meta: "selecionar", session: state.n, source: "oauth" });
        } catch (e) {
          console.error("[meta-oauth] callback error", e);
          return back({ meta: "erro", msg: e instanceof Error ? e.message : "Falha ao concluir o login." });
        }
      },
    },
  },
});
