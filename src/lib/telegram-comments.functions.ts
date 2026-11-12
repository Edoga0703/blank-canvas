// src/lib/telegram-comments.functions.ts
// Server Functions para moderación omnicanal de comentarios (Telegram + Meta),
// conversión de comentarios a Leads en el CRM y generación de enlaces con atribución UTM

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveCompanyIdCached as resolveCompanyId } from "./company-cache";

/**
 * 1. Responde a un comentario en Telegram o Meta unificando la lógica de canal
 */
export const replySocialComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    commentId?: string;
    message?: string;
    postId?: string;
    network?: string;
    instanceName?: string;
  }) => {
    const commentId = String(d?.commentId ?? "").trim();
    const message = String(d?.message ?? "").trim();
    const postId = d?.postId ? String(d.postId).trim() : undefined;
    const network = d?.network ? String(d.network).trim().toLowerCase() : undefined;
    const instanceName = d?.instanceName ? String(d.instanceName).trim() : undefined;

    if (!commentId || !message) {
      throw new Error("Comentário e mensagem são obrigatórios.");
    }
    if (message.length > 2000) {
      throw new Error("A resposta excede o limite de 2.000 caracteres.");
    }

    return { commentId, message, postId, network, instanceName };
  })
  .handler(async ({ context, data }) => {
    const companyId = await resolveCompanyId(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;

    // Identificar la red del comentario
    let network = data.network;
    let actualPostId = data.postId;

    if (!network) {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.commentId);
      const query = admin.from("meta_content_comments").select("id, post_id, network").eq("company_id", companyId);
      const { data: found } = await (isUuid
        ? query.or(`id.eq.${data.commentId},external_comment_id.eq.${data.commentId}`)
        : query.eq("external_comment_id", data.commentId)
      ).limit(1);

      if (found && found.length > 0) {
        network = found[0].network;
        actualPostId = actualPostId || found[0].post_id;
      }
    }

    // Ruta 1: Comentarios de canal Telegram (MTProto Sidecar)
    if (network === "telegram") {
      const { replyToTelegramPostComment } = await import("./telegram-comments.server");
      const res = await replyToTelegramPostComment(companyId, actualPostId || "", data.commentId, data.message);
      return { ok: true, network: "telegram", result: res };
    }

    // Ruta 2: Comentarios de Meta (Instagram / Facebook)
    if (data.instanceName) {
      const { replyMetaComment } = await import("./meta-content.functions");
      const res = await (replyMetaComment as any)({
        data: {
          instanceName: data.instanceName,
          commentId: data.commentId,
          message: data.message,
        },
      });
      return { ok: true, network: network || "meta", result: res };
    }

    // Si no se proporcionó instanceName, buscar el canal Meta asociado al comentario
    const { data: commentRow } = await admin
      .from("meta_content_comments")
      .select("social_account_id")
      .eq("company_id", companyId)
      .eq("external_comment_id", data.commentId)
      .maybeSingle();

    if (commentRow?.social_account_id) {
      const { data: socialAcc } = await admin
        .from("meta_social_accounts")
        .select("instance_id")
        .eq("company_id", companyId)
        .eq("id", commentRow.social_account_id)
        .maybeSingle();

      if (socialAcc?.instance_id) {
        const { data: inst } = await admin
          .from("whatsapp_instances")
          .select("instance_name")
          .eq("id", socialAcc.instance_id)
          .maybeSingle();

        if (inst?.instance_name) {
          const { replyMetaComment } = await import("./meta-content.functions");
          const res = await (replyMetaComment as any)({
            data: {
              instanceName: inst.instance_name,
              commentId: data.commentId,
              message: data.message,
            },
          });
          return { ok: true, network: network || "meta", result: res };
        }
      }
    }

    throw new Error("Não foi possível determinar o canal de envio para esta resposta.");
  });

/**
 * 2. Sincroniza comentarios de una publicación bajo demanda
 */
export const syncPostComments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { postId?: string }) => {
    const postId = String(d?.postId ?? "").trim();
    if (!postId) throw new Error("Publicação obrigatória.");
    return { postId };
  })
  .handler(async ({ context, data }) => {
    const companyId = await resolveCompanyId(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;

    const { data: post, error } = await admin
      .from("meta_content_posts")
      .select("id, network")
      .eq("company_id", companyId)
      .eq("id", data.postId)
      .maybeSingle();

    if (error || !post) {
      throw new Error("Publicação não encontrada.");
    }

    if (post.network === "telegram") {
      const { syncTelegramPostComments } = await import("./telegram-comments.server");
      const res = await syncTelegramPostComments(companyId, post.id);
      return { ...res, network: "telegram" };
    }

    return { ok: true, network: post.network, message: "Comentários sincronizados no ciclo periódico." };
  });

/**
 * 3. Convierte un comentario de seguidor con intención comercial en un Lead de CRM
 */
export const createLeadFromComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    commentId?: string;
    stageId?: string;
    notes?: string;
    tags?: string[];
  }) => {
    const commentId = String(d?.commentId ?? "").trim();
    if (!commentId) throw new Error("Comentário obrigatório.");
    return {
      commentId,
      stageId: d?.stageId ? String(d.stageId).trim() : undefined,
      notes: d?.notes ? String(d.notes).trim() : undefined,
      tags: Array.isArray(d?.tags) ? d.tags.map(String) : undefined,
    };
  })
  .handler(async ({ context, data }) => {
    const companyId = await resolveCompanyId(context.supabase, context.userId);
    const { convertCommentToLead } = await import("./telegram-comments.server");
    return convertCommentToLead(companyId, data.commentId, {
      stageId: data.stageId,
      notes: data.notes,
      tags: data.tags,
    });
  });

/**
 * 4. Genera un enlace con parámetros UTM rastreables para atribución comercial
 */
export const generateTrackedUtmLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    baseUrl?: string;
    source?: string;
    medium?: string;
    campaign?: string;
    content?: string;
  }) => {
    const baseUrl = String(d?.baseUrl ?? "").trim();
    if (!baseUrl) throw new Error("URL base é obrigatória.");
    return {
      baseUrl,
      source: d?.source ? String(d.source).trim() : "telegram",
      medium: d?.medium ? String(d.medium).trim() : "channel_comment",
      campaign: d?.campaign ? String(d.campaign).trim() : "crm_conversion",
      content: d?.content ? String(d.content).trim() : undefined,
    };
  })
  .handler(async ({ data }) => {
    try {
      const url = new URL(data.baseUrl);
      url.searchParams.set("utm_source", data.source);
      url.searchParams.set("utm_medium", data.medium);
      url.searchParams.set("utm_campaign", data.campaign);
      if (data.content) {
        url.searchParams.set("utm_content", data.content);
      }
      return { ok: true, trackedUrl: url.toString() };
    } catch {
      throw new Error("URL inválida.");
    }
  });
