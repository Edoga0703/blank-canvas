import { createFileRoute } from "@tanstack/react-router";

// Redirect de retorno do "login da empresa" no Instagram/Meta.
// Recebe ?code=... (ou ?error=...) e devolve o usuário ao app.
export const Route = createFileRoute("/api/public/meta-callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const error = url.searchParams.get("error_message") || url.searchParams.get("error");
        const code = url.searchParams.get("code") ?? "";

        const target = new URL("/app/conexao", url.origin);
        target.searchParams.set("meta", error ? "erro" : "ok");
        if (error) target.searchParams.set("msg", error);
        else if (code) target.searchParams.set("code", code);

        return new Response(null, { status: 302, headers: { Location: target.toString() } });
      },
    },
  },
});
