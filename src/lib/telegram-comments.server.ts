// src/lib/telegram-comments.server.ts
// Gestión de hilos de discusión de canales de Telegram, moderación de comentarios y atribución comercial CRM

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  fetchPostComments,
  replyToPostComment,
} from "./telegram/mtproto-client.server";

export interface SyncCommentsResult {
  ok: boolean;
  count: number;
  comments: any[];
  error?: string;
}

export interface ReplyCommentResult {
  ok: boolean;
  replyCommentId?: string;
  error?: string;
}

export interface ConvertLeadResult {
  ok: boolean;
  cardId?: string;
  leadCreated: boolean;
  alreadyExists?: boolean;
  error?: string;
}

/**
 * 1. Sincroniza los comentarios de un hilo de discusión vinculado a una publicación de canal
 */
export async function syncTelegramPostComments(
  companyId: string,
  postId: string,
  options?: { limit?: number; offsetId?: string },
): Promise<SyncCommentsResult> {
  const admin = supabaseAdmin as any;

  // 1. Obtener la publicación
  const { data: post, error: postErr } = await admin
    .from("meta_content_posts")
    .select("id, company_id, network, external_post_id, social_account_id, metrics_latest")
    .eq("company_id", companyId)
    .eq("id", postId)
    .maybeSingle();

  if (postErr || !post) {
    throw new Error(`Publicação não encontrada ou sem permissão: ${postErr?.message || "ID inválido"}`);
  }

  if (post.network !== "telegram") {
    throw new Error(`A sincronização MTProto de hilos aplica-se apenas a publicações do Telegram.`);
  }

  // 2. Obtener la cuenta social para extraer el channel_id
  let channelId = "";
  let connectionId = "";

  if (post.social_account_id) {
    const { data: account } = await admin
      .from("meta_social_accounts")
      .select("id, external_id, instance_id")
      .eq("company_id", companyId)
      .eq("id", post.social_account_id)
      .maybeSingle();

    if (account?.external_id) {
      channelId = account.external_id;
    }
  }

  // Tentar resolver a conexão atribuída ao canal via telegram_channel_routes
  if (channelId) {
    const { data: chRow } = await admin
      .from("telegram_channels")
      .select("id")
      .eq("company_id", companyId)
      .eq("telegram_channel_id", channelId)
      .maybeSingle();

    if (chRow?.id) {
      const { data: route } = await admin
        .from("telegram_channel_routes")
        .select("connection_id")
        .eq("company_id", companyId)
        .eq("channel_id", chRow.id)
        .order("preferred", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (route?.connection_id) {
        connectionId = route.connection_id;
      }
    }
  }

  // Se não foi resolvida por rota, buscar conexão MTProto ativa da empresa
  if (!connectionId) {
    const { data: connection } = await admin
      .from("telegram_connections")
      .select("id, telegram_actor_id")
      .eq("company_id", companyId)
      .eq("transport", "mtproto_account")
      .eq("status", "active")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (connection) {
      connectionId = connection.id;
      if (!channelId && connection.telegram_actor_id) {
        channelId = connection.telegram_actor_id;
      }
    }
  }

  if (!channelId || !connectionId) {
    throw new Error("Nenhuma conta Telegram MTProto ativa vinculada ao canal desta publicação.");
  }

  // 3. Consultar los comentarios vía MTProto Gateway
  const result = await fetchPostComments({
    companyId,
    connectionId,
    channelId,
    messageId: post.external_post_id,
    limit: options?.limit || 50,
    offsetId: options?.offsetId,
  });

  const commentsToUpsert = (result.comments || []).map((c) => ({
    company_id: companyId,
    post_id: post.id,
    social_account_id: post.social_account_id,
    network: "telegram",
    external_comment_id: String(c.id),
    external_post_id: post.external_post_id,
    parent_external_id: c.replyToMsgId || null,
    author_id: c.authorId || null,
    author_name: c.authorName || "Usuário Telegram",
    author_username: c.authorUsername || null,
    text: c.text,
    like_count: 0,
    reply_count: 0,
    is_hidden: false,
    is_own: false,
    status: "visible",
    commented_at: c.date,
    raw: c,
    updated_at: new Date().toISOString(),
  }));

  if (commentsToUpsert.length > 0) {
    const { error: upsertErr } = await admin
      .from("meta_content_comments")
      .upsert(commentsToUpsert, {
        onConflict: "company_id,network,external_comment_id",
      });

    if (upsertErr) {
      console.error("[Telegram Comments] Erro ao salvar comentários:", upsertErr);
      throw new Error(`Falha ao salvar comentários: ${upsertErr.message}`);
    }

    // Actualizar métricas del post
    const currentMetrics = post.metrics_latest || {};
    await admin
      .from("meta_content_posts")
      .update({
        metrics_latest: {
          ...currentMetrics,
          comments: Math.max(Number(currentMetrics.comments) || 0, commentsToUpsert.length),
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", post.id)
      .catch(() => null);

    // Disparar eventos para o motor de automações (Fase 5 Trigger: telegram.channel_comment_received)
    try {
      const { dispatchDomainEvent } = await import("./automations/events.server");
      for (const c of commentsToUpsert) {
        if (!c.is_own) {
          await dispatchDomainEvent({
            id: crypto.randomUUID(),
            companyId,
            name: "telegram.channel_comment_received.v1",
            occurredAt: c.commented_at || new Date().toISOString(),
            entity: { type: "comment", id: c.external_comment_id },
            source: "telegram",
            idempotencyKey: `comment_received_${c.external_comment_id}`,
            payload: {
              channelId,
              postId: post.id,
              externalPostId: post.external_post_id,
              commentId: c.external_comment_id,
              authorName: c.author_name,
              authorUsername: c.author_username,
              text: c.text,
            },
          }).catch(() => null);
        }
      }
    } catch (autoErr) {
      console.warn("[Telegram Comments] Aviso ao notificar motor de automações:", autoErr);
    }
  }

  return {
    ok: true,
    count: commentsToUpsert.length,
    comments: commentsToUpsert,
  };
}

/**
 * 2. Responde a un comentario en el hilo del canal de Telegram
 */
export async function replyToTelegramPostComment(
  companyId: string,
  postId: string,
  commentId: string,
  text: string,
): Promise<ReplyCommentResult> {
  const admin = supabaseAdmin as any;

  // 1. Obtener el comentario objetivo
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(commentId);
  const commentQuery = admin
    .from("meta_content_comments")
    .select("id, company_id, post_id, social_account_id, external_comment_id, external_post_id, network")
    .eq("company_id", companyId);

  const { data: matchedComments } = await (isUuid
    ? commentQuery.or(`id.eq.${commentId},external_comment_id.eq.${commentId}`)
    : commentQuery.eq("external_comment_id", commentId)
  ).limit(1);

  const targetComment = matchedComments?.[0];
  const targetPostId = postId || targetComment?.post_id;

  if (!targetPostId) {
    throw new Error("Publicação associada ao comentário não encontrada.");
  }

  // 2. Obtener el post
  const { data: post } = await admin
    .from("meta_content_posts")
    .select("id, company_id, network, external_post_id, social_account_id")
    .eq("company_id", companyId)
    .eq("id", targetPostId)
    .maybeSingle();

  if (!post || post.network !== "telegram") {
    throw new Error("Publicação de Telegram não encontrada.");
  }

  // 3. Resolver channelId y connectionId com validação estrita
  let channelId = "";
  let connectionId = "";

  if (post.social_account_id) {
    const { data: account } = await admin
      .from("meta_social_accounts")
      .select("external_id")
      .eq("id", post.social_account_id)
      .maybeSingle();
    if (account?.external_id) channelId = account.external_id;
  }

  if (channelId) {
    const { data: chRow } = await admin
      .from("telegram_channels")
      .select("id")
      .eq("company_id", companyId)
      .eq("telegram_channel_id", channelId)
      .maybeSingle();

    if (chRow?.id) {
      const { data: route } = await admin
        .from("telegram_channel_routes")
        .select("connection_id")
        .eq("company_id", companyId)
        .eq("channel_id", chRow.id)
        .order("preferred", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (route?.connection_id) connectionId = route.connection_id;
    }
  }

  if (!connectionId) {
    const { data: connection } = await admin
      .from("telegram_connections")
      .select("id, telegram_actor_id")
      .eq("company_id", companyId)
      .eq("transport", "mtproto_account")
      .eq("status", "active")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (connection) {
      connectionId = connection.id;
      if (!channelId && connection.telegram_actor_id) {
        channelId = connection.telegram_actor_id;
      }
    }
  }

  if (!channelId || !connectionId) {
    throw new Error("Nenhuma conta Telegram MTProto ativa encontrada para responder comentários neste canal.");
  }

  // 4. Enviar respuesta vía MTProto Sidecar
  const replyResult = await replyToPostComment({
    companyId,
    connectionId,
    channelId,
    messageId: post.external_post_id,
    commentId: targetComment?.external_comment_id,
    text: text.trim(),
  });

  if (!replyResult.success) {
    throw new Error(replyResult.error || "Falha ao enviar resposta no Telegram.");
  }

  const outgoingExternalId = replyResult.commentId || `rep_${Date.now()}`;

  // 5. Registrar la respuesta en meta_content_comments
  await admin.from("meta_content_comments").upsert(
    {
      company_id: companyId,
      post_id: post.id,
      social_account_id: post.social_account_id,
      network: "telegram",
      external_comment_id: outgoingExternalId,
      external_post_id: post.external_post_id,
      parent_external_id: targetComment?.external_comment_id || null,
      author_id: "me",
      author_name: "Você (Canal)",
      author_username: null,
      text: text.trim(),
      is_own: true,
      status: "replied",
      commented_at: replyResult.date || new Date().toISOString(),
      raw: replyResult,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "company_id,network,external_comment_id" },
  );

  // 6. Actualizar el estado del comentario original
  if (targetComment?.id) {
    await admin
      .from("meta_content_comments")
      .update({
        status: "replied",
        updated_at: new Date().toISOString(),
      })
      .eq("id", targetComment.id)
      .catch(() => null);
  }

  return {
    ok: true,
    replyCommentId: outgoingExternalId,
  };
}

/**
 * 3. Convierte un comentario de seguidor con intención de compra en un Lead formal del CRM
 */
export async function convertCommentToLead(
  companyId: string,
  commentId: string,
  input?: { stageId?: string; notes?: string; tags?: string[] },
): Promise<ConvertLeadResult> {
  const admin = supabaseAdmin as any;

  // 1. Localizar el comentario
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(commentId);
  const commentQuery = admin
    .from("meta_content_comments")
    .select("*, meta_content_posts(id, format, caption, permalink)")
    .eq("company_id", companyId);

  const { data: matched } = await (isUuid
    ? commentQuery.or(`id.eq.${commentId},external_comment_id.eq.${commentId}`)
    : commentQuery.eq("external_comment_id", commentId)
  ).limit(1);

  const comment = matched?.[0];
  if (!comment) {
    throw new Error("Comentário não encontrado ou não pertence a esta organização.");
  }

  // 2. Verificar si ya fue convertido previamente para evitar duplicados
  const { data: existingCard } = await admin
    .from("crm_cards")
    .select("id, nome, numero")
    .eq("company_id", companyId)
    .eq("campos_extras->>comment_id", comment.id)
    .maybeSingle();

  if (existingCard) {
    return {
      ok: true,
      cardId: existingCard.id,
      leadCreated: false,
      alreadyExists: true,
    };
  }

  // 3. Resolver etapa inicial y pipeline
  let targetStageId = input?.stageId;
  let targetPipelineId: string | null = null;

  if (!targetStageId) {
    const { data: firstStage } = await admin
      .from("crm_stage")
      .select("id, pipeline_id")
      .eq("company_id", companyId)
      .order("ordem", { ascending: true })
      .limit(1)
      .maybeSingle();

    targetStageId = firstStage?.id;
    targetPipelineId = firstStage?.pipeline_id || null;
  } else {
    const { data: stage } = await admin
      .from("crm_stage")
      .select("pipeline_id")
      .eq("id", targetStageId)
      .maybeSingle();
    targetPipelineId = stage?.pipeline_id || null;
  }

  // 4. Armar datos del Lead
  const leadNumero = comment.author_username
    ? `@${comment.author_username}`
    : comment.author_id
      ? `tg:${comment.author_id}`
      : `comentario_${comment.external_comment_id}`;

  const leadNome = comment.author_name || (comment.author_username ? `@${comment.author_username}` : "Lead Social");

  const notesList = [
    `Comentário: "${comment.text}"`,
    input?.notes ? `Observação comercial: ${input.notes}` : null,
    comment.meta_content_posts?.permalink ? `Publicação de origem: ${comment.meta_content_posts.permalink}` : null,
  ].filter(Boolean);

  const cardPayload = {
    company_id: companyId,
    stage_id: targetStageId || null,
    pipeline_id: targetPipelineId || null,
    numero: leadNumero,
    nome: leadNome,
    origem: `social_comment_${comment.network}`,
    canal_entrada: comment.network,
    observacao: notesList.join("\n\n"),
    tags: Array.from(new Set(["social_comment", comment.network, ...(input?.tags || [])])),
    status: "aberto",
    campos_extras: {
      comment_id: comment.id,
      external_comment_id: comment.external_comment_id,
      post_id: comment.post_id,
      network: comment.network,
      author_id: comment.author_id,
      author_username: comment.author_username,
      author_name: comment.author_name,
    },
  };

  const { data: newCard, error: cardErr } = await admin
    .from("crm_cards")
    .insert(cardPayload)
    .select("id")
    .single();

  if (cardErr || !newCard) {
    console.error("[CRM Lead Conversion] Erro ao criar lead:", cardErr);
    throw new Error(`Falha ao criar card no CRM: ${cardErr?.message || "Erro desconhecido"}`);
  }

  // 5. Registrar evento de auditoria no lead_evento
  await admin.from("lead_evento").insert({
    company_id: companyId,
    card_id: newCard.id,
    tipo: "origem_comentario",
    descricao: `Lead capturado a partir de comentário no ${comment.network}: "${comment.text.slice(0, 100)}"`,
  }).catch((evErr: any) => {
    console.warn("[CRM Lead Conversion] Erro registrando lead_evento:", evErr);
  });

  // 6. Registrar evento na tabela de atribuição comercial
  try {
    const { error: attrErr } = await admin.from("content_attribution_events").insert({
      company_id: companyId,
      content_post_id: null,
      meta_content_post_id: comment.post_id,
      event_type: "comment_intent",
      evidence_type: "manual_verified",
      confidence: 1.0,
      crm_card_id: newCard.id,
      source_url: comment.meta_content_posts?.permalink || null,
      utm_source: comment.network,
      utm_medium: "channel_comment",
      utm_campaign: "social_moderation",
      utm_content: comment.external_comment_id,
      metadata: {
        comment_id: comment.id,
        author: comment.author_name,
        text_snippet: comment.text.slice(0, 150),
      },
    });
    if (attrErr) {
      console.warn("[CRM Lead Conversion] Erro ao registrar content_attribution_events:", attrErr.message);
    }
  } catch (attrCatch: any) {
    console.warn("[CRM Lead Conversion] Exceção registrando content_attribution_events:", attrCatch?.message);
  }

  // 7. Atualizar status do comentário
  await admin
    .from("meta_content_comments")
    .update({
      status: "lead_created",
      updated_at: new Date().toISOString(),
    })
    .eq("id", comment.id)
    .catch(() => null);

  return {
    ok: true,
    cardId: newCard.id,
    leadCreated: true,
  };
}
