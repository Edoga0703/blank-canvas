import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveCompanyIdCached as resolveCompanyId } from "./company-cache";

type ResolvedMetaChannel = {
  id: string;
  company_id: string;
  instance_name: string;
  instance_token: string;
  phone_number_id: string;
  provider: string;
};

async function channelFor(
  admin: any,
  companyId: string,
  selector: string | { instanceName?: string; socialAccountId?: string; network?: string },
): Promise<ResolvedMetaChannel> {
  const opts = typeof selector === "string" ? { instanceName: selector } : selector;
  const rawInst = String(opts.instanceName ?? "").trim();
  const socialAccountId = String(opts.socialAccountId ?? "").trim();
  const rawNet = String(opts.network ?? "").trim().toLowerCase();

  // 1. Si se proporcionó un instance_name real (no el alias genérico de plataforma), buscar exacto
  if (rawInst && !["instagram", "facebook", "messenger"].includes(rawInst.toLowerCase())) {
    const { data, error } = await admin
      .from("whatsapp_instances")
      .select("id,company_id,instance_name,instance_token,phone_number_id,provider")
      .eq("company_id", companyId)
      .eq("instance_name", rawInst)
      .in("provider", ["meta_instagram", "meta_messenger"])
      .maybeSingle();
    if (!error && data?.instance_token && data?.phone_number_id) {
      return data as ResolvedMetaChannel;
    }
  }

  // 2. Resolver vía meta_social_accounts.instance_id si hay socialAccountId
  if (socialAccountId) {
    const { data: acc } = await admin
      .from("meta_social_accounts")
      .select("instance_id,network")
      .eq("company_id", companyId)
      .eq("id", socialAccountId)
      .maybeSingle();
    if (acc?.instance_id) {
      const { data: inst } = await admin
        .from("whatsapp_instances")
        .select("id,company_id,instance_name,instance_token,phone_number_id,provider")
        .eq("company_id", companyId)
        .eq("id", acc.instance_id)
        .maybeSingle();
      if (inst?.instance_token && inst?.phone_number_id) {
        return inst as ResolvedMetaChannel;
      }
    }
  }

  // 3. Fallback por red / alias de plataforma ("instagram" -> meta_instagram, "facebook"/"messenger" -> meta_messenger)
  const inferredNet = rawNet || (["instagram", "facebook", "messenger"].includes(rawInst.toLowerCase()) ? rawInst.toLowerCase() : "");
  if (inferredNet) {
    const targetProvider = inferredNet === "instagram" ? "meta_instagram" : "meta_messenger";
    const { data: rows } = await admin
      .from("whatsapp_instances")
      .select("id,company_id,instance_name,instance_token,phone_number_id,provider,status")
      .eq("company_id", companyId)
      .eq("provider", targetProvider)
      .not("instance_token", "is", null)
      .not("phone_number_id", "is", null)
      .order("status", { ascending: true });
    const list = Array.isArray(rows) ? rows : [];
    const best = list.find((r: any) => r.status === "connected") ?? list[0];
    if (best?.instance_token && best?.phone_number_id) {
      return best as ResolvedMetaChannel;
    }
  }

  throw new Error("Canal Meta no encontrado o sin token válido.");
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

/** Responde a un comentário usando el token del canal seleccionado con verificación estrita de posse. */
export const replyMetaComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { instanceName?: string; socialAccountId?: string; network?: string; commentId?: string; message?: string }) => {
    const instanceName = String(d?.instanceName ?? "").trim();
    const socialAccountId = String(d?.socialAccountId ?? "").trim() || undefined;
    const network = String(d?.network ?? "").trim() || undefined;
    const commentId = String(d?.commentId ?? "").trim();
    const message = String(d?.message ?? "").trim();
    if (!commentId || !message) throw new Error("Comentario y mensaje son obligatorios.");
    if (!instanceName && !socialAccountId && !network) throw new Error("Canal o cuenta social obligatoria.");
    if (message.length > 2000) throw new Error("La respuesta excede 2.000 caracteres.");
    return { instanceName, socialAccountId, network, commentId, message };
  })
  .handler(async ({ context, data }) => {
    const companyId = await resolveCompanyId(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;

    // 1. Verificación de pertenencia del comentario si existe en BD
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
    const commentRecord = matchedComments?.[0] ?? null;

    if (commentRecord && commentRecord.company_id !== companyId) {
      throw new Error("Acceso denegado: el comentario no pertenece a tu organización.");
    }

    const targetExternalCommentId = commentRecord?.external_comment_id || data.commentId;

    // 2. Resolución del canal autorizado de la empresa (instanceName / socialAccountId / network)
    const channel = await channelFor(supabaseAdmin, companyId, {
      instanceName: data.instanceName,
      socialAccountId: data.socialAccountId || commentRecord?.social_account_id,
      network: data.network || commentRecord?.network,
    });

    // 3. Disparo para la API oficial Meta
    const { metaReplyToComment } = await import("./meta.server");
    const apiResult = await metaReplyToComment(channel.instance_token, targetExternalCommentId, data.message, {
      instagram: channel.provider === "meta_instagram",
    });

    // 4. Actualización de estado en base de dados
    const { markContentCommentReplied } = await import("./meta-content-sync.server");
    await markContentCommentReplied(admin, companyId, targetExternalCommentId);

    return { ok: true, result: apiResult };
  });

/** Envía una Respuesta Privada (DM en Instagram o Messenger) directa a un comentario público. */
export const sendMetaPrivateReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    instanceName?: string;
    socialAccountId?: string;
    network?: string;
    commentId?: string;
    message?: string;
    authorName?: string;
  }) => {
    const instanceName = String(d?.instanceName ?? "").trim();
    const socialAccountId = String(d?.socialAccountId ?? "").trim() || undefined;
    const network = String(d?.network ?? "").trim() || undefined;
    const commentId = String(d?.commentId ?? "").trim();
    const message = String(d?.message ?? "").trim();
    const authorName = String(d?.authorName ?? "").trim() || undefined;
    if (!commentId || !message) throw new Error("Comentario y mensaje privado son obligatorios.");
    if (!instanceName && !socialAccountId && !network) throw new Error("Canal o cuenta social obligatoria.");
    if (message.length > 2000) throw new Error("El mensaje privado excede 2.000 caracteres.");
    return { instanceName, socialAccountId, network, commentId, message, authorName };
  })
  .handler(async ({ context, data }) => {
    const companyId = await resolveCompanyId(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.commentId);
    let commentQuery = admin
      .from("meta_content_comments")
      .select("id,company_id,social_account_id,external_comment_id,network,author_name,author_username,author_id")
      .eq("company_id", companyId);
    commentQuery = isUuid
      ? commentQuery.or(`id.eq.${data.commentId},external_comment_id.eq.${data.commentId}`)
      : commentQuery.eq("external_comment_id", data.commentId);

    const { data: matched } = await commentQuery.limit(1);
    const commentRecord = matched?.[0] ?? null;
    const targetExternalCommentId = commentRecord?.external_comment_id || data.commentId;

    const channel = await channelFor(supabaseAdmin, companyId, {
      instanceName: data.instanceName,
      socialAccountId: data.socialAccountId || commentRecord?.social_account_id,
      network: data.network || commentRecord?.network,
    });

    const { metaSendPrivateReply, isPermanentMetaPrivateReplyError } = await import("./meta.server");
    let apiResult: any = null;
    try {
      apiResult = await metaSendPrivateReply(channel.instance_token, targetExternalCommentId, data.message);
    } catch (err: any) {
      if (isPermanentMetaPrivateReplyError(err)) {
        const rawMsg = String(err?.message || "");
        if (rawMsg.includes("10900") || rawMsg.includes("2018109") || rawMsg.includes("2018001")) {
          throw new Error("Meta solo permite enviar 1 mensaje privado automático por comentario.");
        }
        if (rawMsg.includes("2018278") || rawMsg.toLowerCase().includes("7-day") || rawMsg.toLowerCase().includes("window")) {
          throw new Error("Expiró la ventana oficial de 7 días de Meta para enviar DM a este comentario.");
        }
        throw new Error(`Meta rechazó el mensaje privado: ${rawMsg}`);
      }
      throw err;
    }

    const { markContentCommentReplied } = await import("./meta-content-sync.server");
    await markContentCommentReplied(admin, companyId, targetExternalCommentId);

    // Registrar DM saliente en crm_cards + mensagens para continuidad en la bandeja de Conversaciones
    const recipientId = String(apiResult?.recipient_id || commentRecord?.author_id || "").trim();
    const messageId = String(apiResult?.message_id || `meta_pr_${targetExternalCommentId}`);
    if (recipientId) {
      const canalChat = channel.provider === "meta_instagram" ? "instagram" : "messenger";
      const displayName =
        data.authorName ||
        commentRecord?.author_name ||
        (commentRecord?.author_username ? `@${commentRecord.author_username}` : `${canalChat} ${recipientId.slice(-4)}`);
      const nowIso = new Date().toISOString();

      try {
        const { data: existingCard } = await admin
          .from("crm_cards")
          .select("id")
          .eq("company_id", companyId)
          .eq("numero", recipientId)
          .limit(1)
          .maybeSingle();

        if (existingCard?.id) {
          await admin
            .from("crm_cards")
            .update({
              ultima_mensagem: data.message.slice(0, 240),
              ultima_direcao: "saida",
              ultima_em: nowIso,
            })
            .eq("id", existingCard.id)
            .eq("company_id", companyId);
        } else {
          await admin.from("crm_cards").insert({
            company_id: companyId,
            numero: recipientId,
            nome: displayName,
            canal_chat: canalChat,
            canal_entrada: canalChat,
            ultima_mensagem: data.message.slice(0, 240),
            ultima_direcao: "saida",
            ultima_em: nowIso,
            status: "aberto",
          });
        }

        await admin.from("mensagens").insert({
          company_id: companyId,
          instance_id: channel.id,
          numero: recipientId,
          contato_nome: displayName,
          direcao: "saida",
          autor: "humano",
          user_id: context.userId,
          texto: data.message,
          provider: channel.provider,
          whatsapp_message_id: messageId,
          status_envio: "enviado",
          created_at: nowIso,
        });
      } catch (persistErr: any) {
        console.warn("[sendMetaPrivateReply] Aviso persistiendo DM en CRM/mensagens:", persistErr?.message);
      }
    }

    return { ok: true, recipientId: recipientId || null, messageId, result: apiResult };
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

/** Sincronización manual equivalente ao job periódico, limitada à empresa autenticada. */
export const syncMetaNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { instanceName?: string; full?: boolean }) => ({ instanceName: String(d?.instanceName ?? "").trim(), full: Boolean(d?.full) }))
  .handler(async ({ context, data }) => {
    const companyId = await resolveCompanyId(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const channel = await channelFor(supabaseAdmin, companyId, data.instanceName);
    const { syncMetaChannel } = await import("./meta-sync.server");
    return { ok: true, result: await syncMetaChannel(supabaseAdmin, { ...channel, user_id: context.userId, instance_name: channel.instance_name }, { full: data.full }) };
  });

/** Sincroniza todos los canales Meta (Instagram y Facebook) activos de la empresa, incluyendo posts y comentarios. */
export const syncAllMetaChannelsNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d?: { full?: boolean }) => ({ full: Boolean(d?.full) }))
  .handler(async ({ context, data }) => {
    const companyId = await resolveCompanyId(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;

    const { data: channels } = await admin
      .from("whatsapp_instances")
      .select("id,company_id,instance_name,instance_token,phone_number_id,provider,status")
      .eq("company_id", companyId)
      .in("provider", ["meta_instagram", "meta_messenger"])
      .not("instance_token", "is", null)
      .not("phone_number_id", "is", null);

    const { syncMetaChannel } = await import("./meta-sync.server");
    let comments = 0;
    let messages = 0;
    let posts = 0;
    let syncedChannels = 0;
    const errors: string[] = [];

    for (const ch of channels ?? []) {
      try {
        const res = await syncMetaChannel(
          supabaseAdmin,
          { ...ch, user_id: context.userId, instance_name: ch.instance_name },
          { full: data.full },
        );
        comments += Number(res?.comments ?? 0);
        messages += Number(res?.messages ?? 0);
        posts += Number(res?.postsSeen ?? 0);
        syncedChannels += 1;
      } catch (err: any) {
        errors.push(`${ch.instance_name}: ${err?.message || "error"}`);
      }
    }

    return { ok: true, syncedChannels, posts, comments, messages, errors };
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
