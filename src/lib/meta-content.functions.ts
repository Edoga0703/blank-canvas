import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveCompanyIdCached as resolveCompanyId } from "./company-cache";

async function channelFor(admin: any, companyId: string, instanceName: string) {
  const { data, error } = await admin.from("whatsapp_instances")
    .select("id,company_id,instance_token,phone_number_id,provider")
    .eq("company_id", companyId)
    .eq("instance_name", instanceName)
    .in("provider", ["meta_instagram", "meta_messenger"])
    .maybeSingle();
  if (error || !data?.instance_token || !data?.phone_number_id) throw new Error("Canal Meta não encontrado ou sem token válido.");
  return data as { id: string; company_id: string; instance_token: string; phone_number_id: string; provider: string };
}

/** Recupera posts e comentários para a caixa de conteúdo do CRM. */
export const listMetaContent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { instanceName?: string; since?: string; until?: string }) => ({
    instanceName: String(d?.instanceName ?? "").trim(), since: d?.since?.trim() || undefined, until: d?.until?.trim() || undefined,
  }))
  .handler(async ({ context, data }) => {
    const companyId = await resolveCompanyId(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const channel = await channelFor(supabaseAdmin, companyId, data.instanceName);
    const { metaListPagePosts } = await import("./meta.server");
    const posts = await metaListPagePosts(channel.instance_token, channel.phone_number_id, { since: data.since, until: data.until, limit: 50, instagram: channel.provider === "meta_instagram" });
    return { posts: posts.data, pages: posts.pages };
  });

/** Carrega o tópico completo de uma publicação aberta no módulo Conteúdo. */
export const listMetaPostComments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { instanceName?: string; postId?: string }) => {
    const instanceName = String(d?.instanceName ?? "").trim();
    const postId = String(d?.postId ?? "").trim();
    if (!instanceName || !postId) throw new Error("Canal e publicação são obrigatórios.");
    return { instanceName, postId };
  })
  .handler(async ({ context, data }) => {
    const companyId = await resolveCompanyId(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const channel = await channelFor(supabaseAdmin, companyId, data.instanceName);
    const { metaListPostComments } = await import("./meta.server");
    const comments = await metaListPostComments(channel.instance_token, data.postId, { limit: 100, instagram: channel.provider === "meta_instagram" });
    return { comments: comments.data, pages: comments.pages };
  });

/** Abre uma publicação específica apontada por uma notificação. */
export const getMetaContentPost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { instanceName?: string; postId?: string }) => {
    const instanceName = String(d?.instanceName ?? "").trim();
    const postId = String(d?.postId ?? "").trim();
    if (!instanceName || !postId) throw new Error("Canal e publicação são obrigatórios.");
    return { instanceName, postId };
  })
  .handler(async ({ context, data }) => {
    const companyId = await resolveCompanyId(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const channel = await channelFor(supabaseAdmin, companyId, data.instanceName);
    const { metaGetPost } = await import("./meta.server");
    return { post: await metaGetPost(channel.instance_token, data.postId, { instagram: channel.provider === "meta_instagram" }) };
  });

/** Consulta métricas de Página mantendo o token exclusivamente no servidor. */
export const getMetaInsights = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { instanceName?: string; metrics?: string[]; since?: string; until?: string }) => ({
    instanceName: String(d?.instanceName ?? "").trim(),
    metrics: Array.isArray(d?.metrics) && d.metrics.length ? d.metrics.slice(0, 20).map(String) : ["page_impressions", "page_engaged_users"],
    since: d?.since?.trim() || undefined, until: d?.until?.trim() || undefined,
  }))
  .handler(async ({ context, data }) => {
    const companyId = await resolveCompanyId(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const channel = await channelFor(supabaseAdmin, companyId, data.instanceName);
    const { metaListPageInsights } = await import("./meta.server");
    return { data: await metaListPageInsights(channel.instance_token, channel.phone_number_id, data.metrics, { since: data.since, until: data.until }) };
  });

export const listMetaAdAccounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const companyId = await resolveCompanyId(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: channel } = await supabaseAdmin.from("whatsapp_instances").select("instance_token").eq("company_id", companyId).like("provider", "meta%").not("instance_token", "is", null).limit(1).maybeSingle();
    if (!channel?.instance_token) throw new Error("Nenhum token Meta conectado.");
    const { metaListAdAccounts } = await import("./meta.server");
    return { accounts: (await metaListAdAccounts(channel.instance_token)).data };
  });

export const listMetaAdCampaigns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { instanceName?: string; adAccountId?: string }) => ({ instanceName: String(d?.instanceName ?? "").trim(), adAccountId: String(d?.adAccountId ?? "").trim() }))
  .handler(async ({ context, data }) => {
    if (!data.adAccountId) throw new Error("Conta de anúncios obrigatória.");
    const companyId = await resolveCompanyId(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const channel = await channelFor(supabaseAdmin, companyId, data.instanceName);
    const { metaListAdCampaigns } = await import("./meta.server");
    return { campaigns: (await metaListAdCampaigns(channel.instance_token, data.adAccountId)).data };
  });

export const updateMetaCampaignStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { instanceName?: string; campaignId?: string; status?: string }) => {
    const instanceName = String(d?.instanceName ?? "").trim();
    const campaignId = String(d?.campaignId ?? "").trim();
    const status = String(d?.status ?? "").toUpperCase();
    if (!instanceName || !campaignId || !["ACTIVE", "PAUSED", "ARCHIVED"].includes(status)) throw new Error("Canal, campanha e status válido são obrigatórios.");
    return { instanceName, campaignId, status: status as "ACTIVE" | "PAUSED" | "ARCHIVED" };
  })
  .handler(async ({ context, data }) => {
    const companyId = await resolveCompanyId(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const channel = await channelFor(supabaseAdmin, companyId, data.instanceName);
    const { metaUpdateCampaignStatus } = await import("./meta.server");
    return { ok: true, result: await metaUpdateCampaignStatus(channel.instance_token, data.campaignId, data.status) };
  });

export const getMetaAdInsights = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { instanceName?: string; adAccountId?: string; datePreset?: string; since?: string; until?: string }) => ({
    instanceName: String(d?.instanceName ?? "").trim(), adAccountId: String(d?.adAccountId ?? "").trim(),
    datePreset: d?.datePreset?.trim() || undefined, since: d?.since?.trim() || undefined, until: d?.until?.trim() || undefined,
  }))
  .handler(async ({ context, data }) => {
    if (!data.adAccountId) throw new Error("Conta de anúncios obrigatória.");
    const companyId = await resolveCompanyId(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const channel = await channelFor(supabaseAdmin, companyId, data.instanceName);
    const { metaListAdInsights } = await import("./meta.server");
    return { data: await metaListAdInsights(channel.instance_token, data.adAccountId, { datePreset: data.datePreset, since: data.since, until: data.until }) };
  });

/** Responde a um comentário usando o token do canal selecionado com verificação estrita de posse. */
export const replyMetaComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { instanceName?: string; commentId?: string; message?: string }) => {
    const instanceName = String(d?.instanceName ?? "").trim();
    const commentId = String(d?.commentId ?? "").trim();
    const message = String(d?.message ?? "").trim();
    if (!instanceName || !commentId || !message) throw new Error("Canal, comentário e mensagem são obrigatórios.");
    if (message.length > 2000) throw new Error("A resposta excede 2.000 caracteres.");
    return { instanceName, commentId, message };
  })
  .handler(async ({ context, data }) => {
    const companyId = await resolveCompanyId(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;

    // 1. Resolução do canal autorizado da empresa
    const channel = await channelFor(supabaseAdmin, companyId, data.instanceName);

    // 2. Verificação de segurança: comprova se o comentário pertence a esta empresa na base
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.commentId);
    let commentQuery = admin
      .from("meta_content_comments")
      .select("id,company_id,post_id,social_account_id,external_comment_id,network,status")
      .eq("company_id", companyId);

    if (isUuid) {
      commentQuery = commentQuery.or(`id.eq.${data.commentId},external_comment_id.eq.${data.commentId}`);
    } else {
      commentQuery = commentQuery.eq("external_comment_id", data.commentId);
    }

    const { data: matchedComments } = await commentQuery.limit(1);

    let targetExternalCommentId = data.commentId;
    let internalCommentId: string | null = null;

    if (matchedComments && matchedComments.length > 0) {
      const commentRecord = matchedComments[0];
      if (commentRecord.company_id !== companyId) {
        throw new Error("Acesso negado: o comentário não pertence à sua organização.");
      }
      targetExternalCommentId = commentRecord.external_comment_id;
      internalCommentId = commentRecord.id;
    }

    // 3. Disparo idempotente para a API oficial Meta
    const { metaReplyToComment } = await import("./meta.server");
    const apiResult = await metaReplyToComment(channel.instance_token, targetExternalCommentId, data.message);

    // 4. Atualização de status e auditoria na base de dados
    if (internalCommentId) {
      await admin
        .from("meta_content_comments")
        .update({
          status: "replied",
          updated_at: new Date().toISOString(),
        })
        .eq("id", internalCommentId)
        .catch(() => null);
    }

    return { ok: true, result: apiResult };
  });

/** Publica texto/link/foto em uma Página. A aprovação e as permissões da Meta continuam sendo obrigatórias. */
export const publishMetaContent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { instanceName?: string; message?: string; link?: string; photoUrl?: string }) => ({
    instanceName: String(d?.instanceName ?? "").trim(), message: d?.message?.trim() || undefined, link: d?.link?.trim() || undefined, photoUrl: d?.photoUrl?.trim() || undefined,
  }))
  .handler(async ({ context, data }) => {
    if (!data.message && !data.link && !data.photoUrl) throw new Error("Informe texto, link ou foto para publicar.");
    const companyId = await resolveCompanyId(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const channel = await channelFor(supabaseAdmin, companyId, data.instanceName);
    const { metaPublishPagePost, metaPublishInstagramImage } = await import("./meta.server");
    if (channel.provider === "meta_instagram") {
      if (!data.photoUrl) throw new Error("Instagram exige uma URL pública de imagem para publicar.");
      return { ok: true, result: await metaPublishInstagramImage(channel.instance_token, channel.phone_number_id, { imageUrl: data.photoUrl, caption: data.message }) };
    }
    return { ok: true, result: await metaPublishPagePost(channel.instance_token, channel.phone_number_id, { message: data.message, link: data.link, photoUrl: data.photoUrl }) };
  });

/** Sincronização manual equivalente ao job periódico, limitada à empresa autenticada. */
export const syncMetaNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { instanceName?: string; full?: boolean }) => ({ instanceName: String(d?.instanceName ?? "").trim(), full: Boolean(d?.full) }))
  .handler(async ({ context, data }) => {
    const companyId = await resolveCompanyId(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const channel = await channelFor(supabaseAdmin, companyId, data.instanceName);
    const { syncMetaChannel } = await import("./meta-sync.server");
    return { ok: true, result: await syncMetaChannel(supabaseAdmin, { ...channel, user_id: context.userId, instance_name: data.instanceName }, { full: data.full }) };
  });

/** Obtém métricas e insights detalhados de uma publicação específica. */
export const getMetaPostInsights = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { instanceName?: string; postId?: string; mediaProductType?: string }) => {
    const instanceName = String(data?.instanceName ?? "").trim();
    const postId = String(data?.postId ?? "").trim();
    if (!instanceName || !postId) {
      throw new Error("Canal e publicação são obrigatórios.");
    }
    return {
      instanceName,
      postId,
      mediaProductType: String(data?.mediaProductType ?? "").toUpperCase(),
    };
  })
  .handler(async ({ context, data }) => {
    const companyId = await resolveCompanyId(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const channel = await channelFor(supabaseAdmin, companyId, data.instanceName);
    const standardMetrics = [
      "views",
      "reach",
      "likes",
      "comments",
      "saved",
      "shares",
      "total_interactions",
    ];
    const reelMetrics = [
      "ig_reels_video_view_total_time",
      "ig_reels_avg_watch_time",
    ];
    const metrics = data.mediaProductType === "REELS" ? [...standardMetrics, ...reelMetrics] : standardMetrics;
    const { metaGetMediaInsights } = await import("./meta.server");
    return metaGetMediaInsights(channel.instance_token, data.postId, metrics);
  });
