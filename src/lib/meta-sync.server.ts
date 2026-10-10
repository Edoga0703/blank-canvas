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
  errors: string[];
};

function textOf(value: any) {
  return String(value?.message ?? value?.text ?? value?.caption ?? "").trim();
}

function participantId(value: any) {
  return String(value?.from?.id ?? value?.sender?.id ?? value?.from?.[0]?.id ?? "");
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
    from: item?.from ?? { id: item?.sender_id, name: item?.from?.name },
    message: item?.message ?? item?.text ?? "",
  };
  return persistMessage(admin, instance, synthetic, channel);
}

/** Sincroniza histórico e conteúdo público com paginação limitada e checkpoint idempotente. */
export async function syncMetaChannel(admin: Admin, instance: MetaInstance, options?: { full?: boolean; maxConversations?: number; maxPosts?: number }): Promise<SyncResult> {
  const result: SyncResult = { instanceId: instance.id, provider: instance.provider, messages: 0, comments: 0, postsSeen: 0, leads: 0, errors: [] };
  if (!instance.instance_token || !instance.phone_number_id) {
    result.errors.push("Canal sem token ou page/account id");
    return result;
  }
  const channel = instance.provider === "meta_instagram" ? "instagram" : "messenger";
  const previous = await readCheckpoint(admin, instance.id);
  const since = options?.full ? undefined : (previous.since as string | undefined);
  const until = new Date().toISOString();

  try {
    const conversations = await metaListConversations(instance.instance_token, instance.phone_number_id, { since, until, limit: options?.maxConversations ?? 25 });
    for (const conversation of conversations.data.slice(0, options?.maxConversations ?? 25)) {
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
    const posts = await metaListPagePosts(instance.instance_token, instance.phone_number_id, { since, until, limit: options?.maxPosts ?? 25 });
    result.postsSeen = posts.data.length;
    for (const post of posts.data.slice(0, options?.maxPosts ?? 25)) {
      const comments = Array.isArray(post?.comments?.data)
        ? post.comments.data
        : (await metaListPostComments(instance.instance_token, String(post.id), { limit: 100 })).data;
      for (const comment of comments) {
        if (await persistComment(admin, instance, comment, channel)) result.comments += 1;
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
  await checkpoint(admin, instance, { since: result.errors.length ? since : until, normalizedCount: result.messages + result.comments + result.leads, result, completedAt: until });
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
