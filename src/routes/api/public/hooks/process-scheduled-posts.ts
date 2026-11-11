import { createFileRoute } from "@tanstack/react-router";
import { assertCronRequest } from "@/lib/cron-auth.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { executePostTargetsPublishing } from "@/lib/omnichannel-publish.server";

/**
 * Worker seguro de processamento de publicações agendadas (Omnichannel Content Hub).
 * Executado periodicamente via cron ou pg_cron.
 * Reclama publicações agendadas prontas para envio com trava atômica (evita dupla execução)
 * e orquestra a publicação nos canais cadastrados.
 */
export const Route = createFileRoute("/api/public/hooks/process-scheduled-posts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const _cronDeny = assertCronRequest(request);
        if (_cronDeny) return _cronDeny;

        try {
          const nowIso = new Date().toISOString();
          const tenMinutesAgoIso = new Date(Date.now() - 10 * 60 * 1000).toISOString();

          let claimedPosts: any[] = [];

          // 1. Tenta reclamar via RPC atômica com FOR UPDATE SKIP LOCKED
          const { data: rpcData, error: rpcErr } = await (supabaseAdmin as any).rpc(
            "claim_scheduled_content_posts",
            { p_limit: 10 }
          );

          if (!rpcErr && Array.isArray(rpcData)) {
            claimedPosts = rpcData;
          } else {
            // Fallback resiliente com atualização condicional atômica
            const { data: candidates } = await (supabaseAdmin as any)
              .from("content_posts")
              .select("*")
              .or(`and(status.eq.scheduled,scheduled_at.lte.${nowIso}),and(status.eq.publishing,updated_at.lt.${tenMinutesAgoIso})`)
              .order("scheduled_at", { ascending: true })
              .limit(10);

            if (candidates && candidates.length > 0) {
              for (const candidate of candidates) {
                const { data: claimed, error: claimErr } = await (supabaseAdmin as any)
                  .from("content_posts")
                  .update({
                    status: "publishing",
                    updated_at: nowIso,
                  })
                  .eq("id", candidate.id)
                  .eq("status", candidate.status)
                  .select("*")
                  .maybeSingle();

                if (!claimErr && claimed) {
                  claimedPosts.push(claimed);
                }
              }
            }
          }

          if (claimedPosts.length === 0) {
            return new Response(JSON.stringify({ ok: true, processed: 0, message: "Nenhum post agendado pendente." }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          }

          const results: Array<{ postId: string; targets: any[] }> = [];

          for (const post of claimedPosts) {
            // Busca alvos cadastrados para esta postagem
            const { data: targets, error: targetErr } = await (supabaseAdmin as any)
              .from("content_post_targets")
              .select("*")
              .eq("post_id", post.id)
              .eq("company_id", post.company_id);

            if (targetErr || !targets || targets.length === 0) {
              console.warn(`[process-scheduled-posts] Post ${post.id} sem alvos válidos.`);
              await (supabaseAdmin as any)
                .from("content_posts")
                .update({ status: "failed", updated_at: new Date().toISOString() })
                .eq("id", post.id);
              results.push({ postId: post.id, targets: [] });
              continue;
            }

            const targetItems = targets.map((t: any) => ({
              id: t.id,
              platform: t.platform,
              socialAccountId: t.social_account_id,
              customTitle: t.custom_title,
              customCaption: t.custom_caption,
              platformSettings: t.platform_settings,
            }));

            const targetResults = await executePostTargetsPublishing({
              postId: post.id,
              companyId: post.company_id,
              mediaUrl: post.media_url,
              mediaType: post.media_type,
              baseCaption: post.base_caption,
              targets: targetItems,
            });

            results.push({ postId: post.id, targets: targetResults });
          }

          return new Response(
            JSON.stringify({
              ok: true,
              processed: claimedPosts.length,
              results,
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            }
          );
        } catch (error: any) {
          console.error("[process-scheduled-posts] Erro fatal no worker:", error);
          return new Response(
            JSON.stringify({
              ok: false,
              error: error?.message || "Erro interno ao processar posts agendados.",
            }),
            {
              status: 500,
              headers: { "Content-Type": "application/json" },
            }
          );
        }
      },
    },
  },
});
