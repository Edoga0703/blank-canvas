import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function authBearerToken(request: Request): Promise<{ companyId: string } | null> {
  const authHeader = request.headers.get("authorization") || "";
  const match = authHeader.match(/^Bearer\s+([a-zA-Z0-9_-]+)$/i);
  if (!match) return null;

  const tokenStr = match[1];
  const { data, error } = await (supabaseAdmin as any)
    .from("api_token")
    .select("id, company_id, revogado")
    .eq("token", tokenStr)
    .maybeSingle();

  if (error || !data || data.revogado) return null;
  return { companyId: data.company_id as string };
}

/**
 * Consulta de estado de publicação para agentes externos e IA:
 * GET /api/public/content/status?postId=uuid
 * Permite reconciliação de status de publicações sem expor dados sensíveis.
 */
export const Route = createFileRoute("/api/public/content/status")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await authBearerToken(request);
        if (!auth) {
          return new Response(JSON.stringify({ ok: false, error: "Unauthorized: Token Bearer inválido ou revogado." }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        const url = new URL(request.url);
        const postId = url.searchParams.get("postId");

        if (!postId) {
          return new Response(JSON.stringify({ ok: false, error: "Parâmetro postId obrigatório." }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        const { data: post, error: postErr } = await (supabaseAdmin as any)
          .from("content_posts")
          .select("id, status, approval_state, source, scheduled_at, published_at, created_at, updated_at")
          .eq("id", postId)
          .eq("company_id", auth.companyId)
          .maybeSingle();

        if (postErr || !post) {
          return new Response(JSON.stringify({ ok: false, error: "Postagem não encontrada ou sem permissão." }), {
            status: 404,
            headers: { "Content-Type": "application/json" },
          });
        }

        const { data: targets } = await (supabaseAdmin as any)
          .from("content_post_targets")
          .select("id, platform, status, external_post_id, external_url, error_message, published_at")
          .eq("post_id", postId)
          .eq("company_id", auth.companyId);

        return new Response(
          JSON.stringify({
            ok: true,
            post: {
              id: post.id,
              status: post.status,
              approvalState: post.approval_state,
              source: post.source,
              scheduledAt: post.scheduled_at,
              publishedAt: post.published_at,
              createdAt: post.created_at,
              updatedAt: post.updated_at,
            },
            targets: (targets || []).map((t: any) => ({
              id: t.id,
              platform: t.platform,
              status: t.status,
              externalPostId: t.external_post_id,
              externalUrl: t.external_url,
              errorMessage: t.error_message,
              publishedAt: t.published_at,
            })),
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }
        );
      },
    },
  },
});
