import {
  metaListConversations,
  metaListConversationMessages,
  metaListPagePosts,
  metaListPostComments,
  metaListLeadForms,
  metaListFormLeads,
} from "@/lib/meta.server";
import { upsertCard, getStagesBrief } from "@/lib/crm-engine.server";

type Admin = any;

type MetaInstance = {
  id: string;
  company_id: string;
  user_id: string | null;
  instance_name: string;
  instance_token: string | null;
  provider: string;
  phone_number_id: string | null;
};

type SyncResult = {
  instanceId: string;
  provider: string;
  messages: number;
  comments: number;
  postsSeen: number;
  leads: number;
  notifications: number;
  reactionAlerts: number;
  errors: string[];
};

type EngagementSnapshot = Record<string, {
  reactions: number;
  comments: number;
  checkedAt: string;
}>;

function textOf(value: any) {
  return String(value?.message ?? value?.text ?? value?.caption ?? "").trim();
}

function participantId(value: any) {
  return String(value?.from?.id ?? value?.sender?.id ?? value?.from?.[0]?.id ?? value?.sender_id ?? value?.username ?? "");
}

function compactText(value: unknown, max = 180) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function contentLink(instanceName: string, postId?: string | null) {
  const params = new URLSearchParams({ channel: instanceName });
  if (postId) params.set("post", postId);
  return `/app/conteudo?${params.toString()}`;
}

function commentTimestamp(item: any) {
  const raw = item?.timestamp ?? item?.created_time;
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function commentReplies(item: any) {
  const replies = item?.replies?.data ?? item?.comments?.data ?? [];
  return Array.isArray(replies) ? replies : [];
}

function engagementOf(post: any) {
  return {
    reactions: Math.max(0, Number(post?.like_count ?? post?.reactions?.summary?.total_count ?? 0) || 0),
    comments: Math.max(0, Number(post?.comments_count ?? post?.comments?.summary?.total_count ?? 0) || 0),
  };
}

async function pushMetaNotification(admin: Admin, input: {
  companyId: string;
  tipo: "comentario_meta" | "reacao_meta";
  titulo: string;
  descricao: string;
  link: string;
  refId: string;
}) {
  const { data: existing, error: lookupError } = await admin.from("notificacao").select("id")
    .eq("company_id", input.companyId).eq("tipo", input.tipo).eq("ref_id", input.refId).limit(1).maybeSingle();
  if (lookupError) throw lookupError;
  if (existing?.id) return false;
  const { error } = await admin.from("notificacao").insert({
    company_id: input.companyId,
    tipo: input.tipo,
    titulo: input.titulo,
    descricao: input.descricao,
    link: input.link,
    ref_id: input.refId,
  });
  if (error) throw error;
  return true;
}

function mediaOf(value: any) {
  const attachment = value?.attachments?.data?.[0] ?? value?.attachments?.[0] ?? value?.attachment;
  const type = String(attachment?.type ?? attachment?.mime_type ?? "").toLowerCase();
  const url = attachment?.payload?.url ?? attachment?.file_url ?? attachment?.url ?? null;
  if (!url) return { type: null, url: null, mime: null };
  return {
    type: type.includes("video") ? "video" : type.includes("audio") ? "audio" : type.includes("file") || type.includes("document") ? "document" : "image",
    url: String(url),
    mime: attachment?.mime_type ? String(attachment.mime_type) : null,
  };
}

async function checkpoint(admin: Admin, instance: MetaInstance, state: Record<string, unknown>) {
  const key = `meta-sync:${instance.id}`;
  const payload = {
    company_id: instance.company_id,
    external_connection_id: instance.id,
    external_event_id: key,
    provider: instance.provider,
    raw_payload: state,
    normalized_count: Number(state.normalizedCount ?? 0),
    status: "checkpoint",
    processed_at: new Date().toISOString(),
  };
  const { data: existing } = await admin
    .from("messaging_inbox_events")
    .select("id")
    .eq("external_event_id", key)
    .maybeSingle();
  if (existing?.id) await admin.from("messaging_inbox_events").update(payload).eq("id", existing.id);
  else await admin.from("messaging_inbox_events").insert(payload);
}

async function readCheckpoint(admin: Admin, instanceId: string) {
  const { data } = await admin
    .from("messaging_inbox_events")
    .select("raw_payload")
    .eq("external_event_id", `meta-sync:${instanceId}`)
    .maybeSingle();
  return (data?.raw_payload ?? {}) as Record<string, any>;
}

/** Persiste histórico sem disparar a IA; o webhook ao vivo é o responsável pela resposta imediata. */
async function persistMessage(admin: Admin, instance: MetaInstance, item: any, channel: "instagram" | "messenger") {
  const id = String(item?.id ?? "");
  const sender = participantId(item);
  if (!id || !sender || !instance.phone_number_id || sender === instance.phone_number_id) return false;
  const text = textOf(item);
  const media = mediaOf(item);
  const stages = await getStagesBrief(admin, instance.company_id);
  await upsertCard(admin, instance.company_id, instance.user_id, sender, item?.from?.name ?? null, text, stages, channel);

  const { data: existing } = await admin
    .from("mensagens")
    .select("id")
    .eq("company_id", instance.company_id)
    .eq("whatsapp_message_id", id)
    .limit(1)
    .maybeSingle();
  if (existing?.id) return false;

  const { data: inserted, error } = await admin.from("mensagens").insert({
    company_id: instance.company_id,
    user_id: instance.user_id,
    numero: sender,
    contato_nome: item?.from?.name ?? null,
    direcao: "entrada",
    autor: "contato",
    texto: text,
    whatsapp_message_id: id,
    created_at: item?.created_time ? new Date(item.created_time).toISOString() : new Date().toISOString(),
    midia_url: media.url,
    midia_tipo: media.type,
    midia_mime: media.mime,
  }).select("id").maybeSingle();
  if (error) throw error;
  if (inserted?.id && media.url && media.type) {
    await admin.from("message_attachments").insert({
      company_id: instance.company_id,
      mensagem_id: inserted.id,
      attachment_key: id,
      provider_attachment_id: id,
      provider_url: media.url,
      mime_type: media.mime,
      kind: media.type,
    });
  }
  return true;
}

async function persistComment(admin: Admin, instance: MetaInstance, item: any, channel: "instagram" | "messenger") {
  const synthetic = {
    ...item,
    from: item?.from ?? { id: item?.sender_id ?? item?.username, name: item?.username ?? null },
    message: item?.message ?? item?.text ?? "",
  };
  return persistMessage(admin, instance, synthetic, channel);
}

/** Sincroniza histórico e conteúdo público com paginação limitada e checkpoint idempotente. */
export async function syncMetaChannel(admin: Admin, instance: MetaInstance, options?: { full?: boolean; maxConversations?: number; maxPosts?: number }): Promise<SyncResult> {
  const result: SyncResult = {
    instanceId: instance.id,
    provider: instance.provider,
    messages: 0,
    comments: 0,
    postsSeen: 0,
    leads: 0,
    notifications: 0,
    reactionAlerts: 0,
    errors: [],
  };
  if (!instance.instance_token || !instance.phone_number_id) {
    result.errors.push("Canal sem token ou page/account id");
    return result;
  }
  const channel = instance.provider === "meta_instagram" ? "instagram" : "messenger";
  const previous = await readCheckpoint(admin, instance.id);
  const since = options?.full ? undefined : (previous.since as string | undefined);
  const until = new Date().toISOString();
  const maxConversations = options?.maxConversations ?? (options?.full ? 250 : 25);
  const maxPosts = options?.maxPosts ?? (options?.full ? 100 : 25);
  const previousEngagement = (previous.engagement && typeof previous.engagement === "object"
    ? previous.engagement
    : {}) as EngagementSnapshot;
  const currentEngagement: EngagementSnapshot = { ...previousEngagement };

  try {
    const conversations = await metaListConversations(instance.instance_token, instance.phone_number_id, { since, until, limit: maxConversations });
    for (const conversation of conversations.data.slice(0, maxConversations)) {
      const messages = Array.isArray(conversation?.messages?.data)
        ? conversation.messages.data
        : (await metaListConversationMessages(instance.instance_token, String(conversation.id), { since, until, limit: 100 })).data;
      for (const message of messages) {
        if (await persistMessage(admin, instance, message, channel)) result.messages += 1;
      }
    }
  } catch (e) {
    result.errors.push(`conversas: ${e instanceof Error ? e.message : String(e)}`);
  }

  try {
    // Sempre revisitamos as publicações recentes. Filtrar pela data de criação da
    // publicação faria perder um comentário novo feito em um post mais antigo.
    const posts = await metaListPagePosts(instance.instance_token, instance.phone_number_id, { limit: maxPosts });
    result.postsSeen = posts.data.length;
    for (const post of posts.data.slice(0, maxPosts)) {
      const postId = String(post?.id ?? "");
      const engagement = engagementOf(post);
      const previousPost = postId ? previousEngagement[postId] : undefined;
      if (postId) currentEngagement[postId] = { ...engagement, checkedAt: until };

      // A API do Instagram não entrega um webhook individual confiável para cada
      // curtida. O aumento do contador funciona como recuperação periódica.
      if (!options?.full && channel === "instagram" && previousPost && engagement.reactions > previousPost.reactions) {
        const delta = engagement.reactions - previousPost.reactions;
        try {
          const inserted = await pushMetaNotification(admin, {
            companyId: instance.company_id,
            tipo: "reacao_meta",
            titulo: delta === 1 ? "Nova curtida na publicação" : `${delta} novas curtidas na publicação`,
            descricao: `O total de curtidas aumentou de ${previousPost.reactions} para ${engagement.reactions}.`,
            link: contentLink(instance.instance_name, postId),
            refId: `meta:engagement:${postId}:${previousPost.reactions}:${engagement.reactions}:${String(previous.completedAt ?? previous.since ?? "baseline")}`,
          });
          if (inserted) {
            result.notifications += 1;
            result.reactionAlerts += 1;
          }
        } catch (error) {
          result.errors.push(`notificação de reação ${postId}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      const comments = Array.isArray(post?.comments?.data)
        ? post.comments.data
        : (await metaListPostComments(instance.instance_token, String(post.id), { limit: 100 })).data;
      const commentsAndReplies = comments.flatMap((comment: any) => [comment, ...commentReplies(comment)]);
      for (const comment of commentsAndReplies) {
        const inserted = await persistComment(admin, instance, comment, channel);
        if (inserted) result.comments += 1;

        const commentId = String(comment?.id ?? "");
        const authorId = participantId(comment);
        const createdAt = commentTimestamp(comment);
        const cursorDate = since ? new Date(since) : null;
        const happenedAfterCursor = Boolean(createdAt && cursorDate && !Number.isNaN(cursorDate.getTime()) && createdAt >= cursorDate);
        const shouldNotify = !options?.full && Boolean(since) && authorId !== instance.phone_number_id && (happenedAfterCursor || (!createdAt && inserted));
        if (!shouldNotify || !commentId) continue;

        const author = compactText(comment?.from?.name ?? comment?.from?.username ?? comment?.username ?? "Alguém", 80);
        const commentText = compactText(comment?.message ?? comment?.text ?? "", 180);
        try {
          const notified = await pushMetaNotification(admin, {
            companyId: instance.company_id,
            tipo: "comentario_meta",
            titulo: "Novo comentário recuperado",
            descricao: commentText ? `${author}: ${commentText}` : `${author} comentou em uma publicação.`,
            link: contentLink(instance.instance_name, postId),
            refId: `meta:comment:${commentId}`,
          });
          if (notified) result.notifications += 1;
        } catch (error) {
          result.errors.push(`notificação de comentário ${commentId}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }
  } catch (e) {
    result.errors.push(`feed/comentarios: ${e instanceof Error ? e.message : String(e)}`);
  }

  try {
    const forms = await metaListLeadForms(instance.instance_token, instance.phone_number_id, { limit: 50 });
    const { fetchAndProcessMetaLead } = await import("@/lib/meta-leads.server");
    let leadBudget = 100;
    for (const form of forms.data.slice(0, 50)) {
      if (leadBudget <= 0) break;
      const leads = await metaListFormLeads(instance.instance_token, String(form.id), { since, until, limit: 100 });
      for (const lead of leads.data.slice(0, leadBudget)) {
        leadBudget -= 1;
        const resultLead = await fetchAndProcessMetaLead(admin, instance.phone_number_id, String(lead.id), String(form.id)).catch((error) => {
          result.errors.push(`lead ${lead.id}: ${error instanceof Error ? error.message : String(error)}`);
          return null;
        });
        if (resultLead?.ok) result.leads += 1;
      }
    }
  } catch (e) {
    result.errors.push(`lead ads: ${e instanceof Error ? e.message : String(e)}`);
  }

  // Se algum bloco falhou, não avançamos o cursor além do último ponto confirmado;
  // a próxima execução repete o intervalo e os IDs tornam a gravação idempotente.
  const engagementEntries = Object.entries(result.errors.length ? previousEngagement : currentEngagement)
    .sort(([, a], [, b]) => b.checkedAt.localeCompare(a.checkedAt))
    .slice(0, 200);
  await checkpoint(admin, instance, {
    since: result.errors.length ? since : until,
    engagement: Object.fromEntries(engagementEntries),
    normalizedCount: result.messages + result.comments + result.leads,
    result,
    completedAt: result.errors.length ? previous.completedAt : until,
  });
  return result;
}

export async function syncMetaChannels(admin: Admin, options?: { full?: boolean; limit?: number }) {
  const { data: instances, error } = await admin
    .from("whatsapp_instances")
    .select("id,company_id,user_id,instance_name,instance_token,provider,phone_number_id")
    .in("provider", ["meta_instagram", "meta_messenger"])
    .limit(options?.limit ?? 50);
  if (error) throw error;
  const results: SyncResult[] = [];
  for (const instance of instances ?? []) {
    results.push(await syncMetaChannel(admin, instance as MetaInstance, options));
  }
  return results;
}
