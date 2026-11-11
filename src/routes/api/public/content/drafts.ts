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

          if (!masterText && !primaryAssetId) {
            return new Response(
              JSON.stringify({ ok: false, error: "Texto mestre (masterText) ou ativo de mídia (assetId) obrigatório." }),
              { status: 400, headers: { "Content-Type": "application/json" } }
            );
          }

          // Se informou assetId, valida isolamento tenant e estado 'ready'
          if (primaryAssetId) {
            const { data: assetCheck, error: assetErr } = await (supabaseAdmin as any)
              .from("content_assets")
              .select("id, state, company_id")
              .eq("id", primaryAssetId)
              .eq("company_id", companyId)
              .maybeSingle();

            if (assetErr || !assetCheck) {
              return new Response(
                JSON.stringify({ ok: false, error: "Ativo de mídia (assetId) não encontrado ou não pertence a esta empresa." }),
                { status: 400, headers: { "Content-Type": "application/json" } }
              );
            }

            if (assetCheck.state !== "ready") {
              return new Response(
                JSON.stringify({ ok: false, error: `Ativo de mídia ainda não concluído (estado: ${assetCheck.state}).` }),
                { status: 400, headers: { "Content-Type": "application/json" } }
              );
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
            return new Response(
              JSON.stringify({ ok: false, error: `Erro ao criar post mestre: ${postErr?.message || "falha no banco"}` }),
              { status: 500, headers: { "Content-Type": "application/json" } }
            );
          }

          const rawTargets = Array.isArray(body.targets) && body.targets.length > 0
            ? body.targets
            : [{ platform: "instagram" }, { platform: "facebook" }];

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
