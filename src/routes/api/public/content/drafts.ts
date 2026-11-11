import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function authBearerToken(request: Request): Promise<{ companyId: string; userId: string | null } | null> {
  const authHeader = request.headers.get("authorization") || "";
  const match = authHeader.match(/^Bearer\s+([a-zA-Z0-9_-]+)$/i);
  if (!match) return null;

  const tokenStr = match[1];
  const { data, error } = await (supabaseAdmin as any)
    .from("api_token")
    .select("id, company_id, criado_por, revogado")
    .eq("token", tokenStr)
    .maybeSingle();

  if (error || !data || data.revogado) return null;

  // Atualiza último uso
  await (supabaseAdmin as any)
    .from("api_token")
    .update({ ultimo_uso_em: new Date().toISOString() })
    .eq("id", data.id);

  return { companyId: data.company_id as string, userId: data.criado_por as string | null };
}

/**
 * Endpoint de API pública para Agentes e IA Externa (Fase 6):
 * POST /api/public/content/drafts
 * Permite que IA crie propostas e rascunhos de postagem sem expor segredos OAuth ou chaves R2.
 * Todo conteúdo externo entra obrigatoriamente como 'awaiting_approval' para validação humana.
 */
export const Route = createFileRoute("/api/public/content/drafts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await authBearerToken(request);
        if (!auth) {
          return new Response(JSON.stringify({ ok: false, error: "Unauthorized: Token Bearer inválido ou revogado." }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        const { companyId, userId } = auth;
        const idempotencyKey = request.headers.get("Idempotency-Key") || request.headers.get("idempotency-key") || null;

        try {
          const body = (await request.json().catch(() => ({}))) as Record<string, any>;

          // 1. Verificação de idempotência por empresa
          if (idempotencyKey) {
            const { data: existingPost } = await (supabaseAdmin as any)
              .from("content_posts")
              .select("id, status, approval_state, created_at")
              .eq("company_id", companyId)
              .eq("idempotency_key", idempotencyKey)
              .maybeSingle();

            if (existingPost) {
              const { data: existingTargets } = await (supabaseAdmin as any)
                .from("content_post_targets")
                .select("id, platform, status")
                .eq("post_id", existingPost.id)
                .eq("company_id", companyId);

              return new Response(
                JSON.stringify({
                  ok: true,
                  idempotent: true,
                  postId: existingPost.id,
                  approvalState: existingPost.approval_state,
                  status: existingPost.status,
                  targets: existingTargets || [],
                }),
                {
                  status: 200,
                  headers: { "Content-Type": "application/json" },
                }
              );
            }
          }

          // 2. Validação do payload
          const masterText = String(body.masterText || body.caption || "").trim();
          const mediaType = (body.mediaType as string) || "video";
          const rawAssetIds = Array.isArray(body.assetIds) ? body.assetIds : body.assetId ? [body.assetId] : [];
          const primaryAssetId = rawAssetIds[0] || null;

          const rawTargets = Array.isArray(body.targets) && body.targets.length > 0
            ? body.targets
            : [{ platform: "instagram" }, { platform: "facebook" }];

          if (!masterText && !primaryAssetId && !rawTargets.some((t: any) => t.assetId)) {
            return new Response(
              JSON.stringify({ ok: false, error: "Texto mestre (masterText) ou ativo de mídia (assetId) obrigatório." }),
              { status: 400, headers: { "Content-Type": "application/json" } }
            );
          }

          // P1.11: Valida TODOS os ativos de mídia (primários e específicos de destinos)
          const allAssetIds = new Set<string>();
          if (primaryAssetId) allAssetIds.add(primaryAssetId);
          rawTargets.forEach((t: any) => {
            if (t.assetId) allAssetIds.add(t.assetId);
          });

          if (allAssetIds.size > 0) {
            const assetIdArray = Array.from(allAssetIds);
            const { data: assetChecks, error: assetErr } = await (supabaseAdmin as any)
              .from("content_assets")
              .select("id, state, company_id")
              .in("id", assetIdArray)
              .eq("company_id", companyId);

            if (assetErr || !assetChecks || assetChecks.length !== assetIdArray.length) {
              return new Response(
                JSON.stringify({ ok: false, error: "Um ou mais ativos de mídia informados não pertencem a esta empresa ou não existem." }),
                { status: 400, headers: { "Content-Type": "application/json" } }
              );
            }

            const notReady = assetChecks.find((a: any) => a.state !== "ready");
            if (notReady) {
              return new Response(
                JSON.stringify({ ok: false, error: `Ativo de mídia ${notReady.id} ainda não concluído (estado: ${notReady.state}).` }),
                { status: 400, headers: { "Content-Type": "application/json" } }
              );
            }
          }

          // P1.11: Valida TODAS as contas sociais contra tenant e rede
          const allSocialAccountIds = Array.from(new Set(rawTargets.map((t: any) => t.socialAccountId).filter(Boolean)));
          if (allSocialAccountIds.length > 0) {
            const { data: accChecks, error: accErr } = await (supabaseAdmin as any)
              .from("meta_social_accounts")
              .select("id, network, company_id")
              .in("id", allSocialAccountIds)
              .eq("company_id", companyId);

            if (accErr || !accChecks || accChecks.length !== allSocialAccountIds.length) {
              return new Response(
                JSON.stringify({ ok: false, error: "Uma ou mais contas sociais informadas não pertencem a esta empresa ou não existem." }),
                { status: 400, headers: { "Content-Type": "application/json" } }
              );
            }

            const accMap = new Map(accChecks.map((a: any) => [a.id, a.network]));
            for (const t of rawTargets) {
              if (t.socialAccountId) {
                const net = accMap.get(t.socialAccountId);
                if (net && net !== t.platform) {
                  return new Response(
                    JSON.stringify({ ok: false, error: `A conta ${t.socialAccountId} pertence à rede ${net}, incompatível com o destino ${t.platform}.` }),
                    { status: 400, headers: { "Content-Type": "application/json" } }
                  );
                }
              }
            }
          }

          // 3. Processamento do agendamento
          let scheduledUtc: string | null = null;
          const reqSchedule = body.requestedSchedule;
          if (reqSchedule) {
            if (typeof reqSchedule === "string") {
              const d = new Date(reqSchedule);
              if (!isNaN(d.getTime())) scheduledUtc = d.toISOString();
            } else if (typeof reqSchedule === "object") {
              const dateStr = reqSchedule.utc || reqSchedule.local;
              if (dateStr) {
                const d = new Date(dateStr);
                if (!isNaN(d.getTime())) scheduledUtc = d.toISOString();
              }
            }
          }

          // 4. Criação do post mestre
          const { data: post, error: postErr } = await (supabaseAdmin as any)
            .from("content_posts")
            .insert({
              company_id: companyId,
              user_id: userId,
              source: "external_ai",
              approval_state: "awaiting_approval", // Sempre requer aprovação humana
              status: "draft",
              base_caption: masterText,
              media_type: mediaType,
              scheduled_at: scheduledUtc,
              timezone: reqSchedule?.timezone || "America/Sao_Paulo",
              idempotency_key: idempotencyKey,
            })
            .select("id, approval_state, status, created_at")
            .single();

          if (postErr || !post) {
            // P1.11: Tratamento elegante de corrida idempotente (código 23505)
            if (postErr?.code === "23505" && idempotencyKey) {
              const { data: existing } = await (supabaseAdmin as any)
                .from("content_posts")
                .select("id, approval_state, status, created_at, content_post_targets(id, platform, status)")
                .eq("idempotency_key", idempotencyKey)
                .eq("company_id", companyId)
                .maybeSingle();

              if (existing) {
                return new Response(
                  JSON.stringify({
                    ok: true,
                    postId: existing.id,
                    state: existing.approval_state,
                    status: existing.status,
                    idempotent: true,
                    targets: existing.content_post_targets || [],
                  }),
                  { status: 200, headers: { "Content-Type": "application/json" } }
                );
              }
            }

            return new Response(
              JSON.stringify({ ok: false, error: `Erro ao criar post mestre: ${postErr?.message || "falha no banco"}` }),
              { status: 500, headers: { "Content-Type": "application/json" } }
            );
          }

          const targetRows = rawTargets.map((t: any) => ({
            post_id: post.id,
            company_id: companyId,
            platform: t.platform || "instagram",
            social_account_id: t.socialAccountId || null,
            asset_id: t.assetId || primaryAssetId,
            custom_title: t.title || null,
            custom_caption: t.caption || null,
            platform_settings: t.settings || {},
            status: "pending",
          }));

          const { data: insertedTargets, error: targetsErr } = await (supabaseAdmin as any)
            .from("content_post_targets")
            .insert(targetRows)
            .select("id, platform, status");

          if (targetsErr) {
            await (supabaseAdmin as any).from("content_posts").delete().eq("id", post.id);
            return new Response(
              JSON.stringify({ ok: false, error: `Erro ao associar alvos: ${targetsErr.message}` }),
              { status: 500, headers: { "Content-Type": "application/json" } }
            );
          }

          return new Response(
            JSON.stringify({
              ok: true,
              postId: post.id,
              state: post.approval_state,
              status: post.status,
              message: "Borrador de IA registrado com sucesso. Aguardando revisão e aprovação humana no Capiversa.",
              targets: insertedTargets || [],
            }),
            {
              status: 201,
              headers: { "Content-Type": "application/json" },
            }
          );
        } catch (err: any) {
          console.error("[api/public/content/drafts] Erro fatal:", err);
          return new Response(
            JSON.stringify({ ok: false, error: err?.message || "Erro interno ao processar requisição de rascunho." }),
            { status: 500, headers: { "Content-Type": "application/json" } }
          );
        }
      },
    },
  },
});
