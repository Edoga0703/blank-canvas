import { createFileRoute } from "@tanstack/react-router";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

function clean(value?: string | null) {
  return value?.normalize("NFKC").trim().replace(/^Bearer\s+/i, "").replace(/^['"]|['"]$/g, "").replace(/[\s\u200B-\u200D\u2060\uFEFF]/g, "") ?? "";
}

function validSignature(raw: Buffer, signature: string, secrets: string[]) {
  const received = clean(signature).replace(/^sha256=/i, "").toLowerCase();
  if (!received || !/^[a-f0-9]{64}$/.test(received)) return false;
  return secrets.some((secret) => {
    const expected = createHmac("sha256", secret).update(raw).digest("hex");
    const a = Buffer.from(received, "hex");
    const b = Buffer.from(expected, "hex");
    return a.length === b.length && timingSafeEqual(a, b);
  });
}

function eventId(_payload: any, raw: string) {
  // O hash do corpo representa uma entrega concreta. IDs de nível superior da
  // Meta podem ser o ID da Página e se repetir entre webhooks diferentes.
  return `meta:${createHash("sha256").update(raw).digest("hex")}`;
}

function textFor(value: any) {
  return String(value?.message?.text ?? value?.message ?? value?.text ?? value?.postback?.title ?? value?.postback?.payload ?? "").trim();
}

function attachmentFor(value: any) {
  return value?.message?.attachments?.[0] ?? value?.attachments?.data?.[0] ?? value?.attachments?.[0] ?? null;
}

function reactionFor(value: any) {
  const reaction = value?.message?.reaction ?? value?.reaction ?? null;
  return reaction && typeof reaction === "object" ? reaction : null;
}

function statusEvents(value: any) {
  const result: Array<{ id: string; status: string; occurredAt?: number }> = [];
  for (const id of value?.delivery?.mids ?? []) result.push({ id: String(id), status: "delivered", occurredAt: value?.delivery?.watermark ?? value?.timestamp });
  if (value?.message_id) result.push({ id: String(value.message_id), status: String(value.status ?? "updated"), occurredAt: value?.timestamp });
  return result;
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

async function pushMetaNotification(admin: any, input: {
  companyId: string;
  tipo: "comentario_meta" | "mencion_meta" | "reacao_meta";
  titulo: string;
  descricao: string;
  link: string;
  refId: string;
}) {
  const { data: existing, error: lookupError } = await admin.from("notificacao").select("id")
    .eq("company_id", input.companyId).eq("tipo", input.tipo).eq("ref_id", input.refId).limit(1).maybeSingle();
  if (lookupError) throw lookupError;
  if (existing?.id) return;
  const { error } = await admin.rpc("push_notificacao", {
    _company_id: input.companyId,
    _tipo: input.tipo,
    _titulo: input.titulo,
    _descricao: input.descricao,
    _link: input.link,
    _ref_id: input.refId,
  });
  if (error) throw error;
}

export const Route = createFileRoute("/api/public/meta-webhook")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const { getMetaWebhookVerifyToken } = await import("@/lib/meta-config.server");
        const expected = clean(await getMetaWebhookVerifyToken());
        if (url.searchParams.get("hub.mode") === "subscribe" && expected && clean(url.searchParams.get("hub.verify_token")) === expected) {
          return new Response(url.searchParams.get("hub.challenge") ?? "", { status: 200, headers: { "Content-Type": "text/plain" } });
        }
        return new Response("Forbidden", { status: 403 });
      },

      POST: async ({ request }) => {
        const rawBuf = Buffer.from(await request.arrayBuffer());
        const raw = rawBuf.toString("utf8");
        const { getMetaAppSecrets, isMetaAllowUnsigned } = await import("@/lib/meta-config.server");
        const secrets = (await getMetaAppSecrets()).map(clean).filter(Boolean);
        const allowUnsigned = await isMetaAllowUnsigned();
        if (!allowUnsigned && (!secrets.length || !validSignature(rawBuf, request.headers.get("x-hub-signature-256") ?? "", secrets))) {
          console.warn("[meta-webhook] chamada rejeitada: assinatura ausente ou inválida");
          return new Response("Invalid signature", { status: 401 });
        }

        let payload: any;
        try { payload = JSON.parse(raw); } catch { return new Response("Bad payload", { status: 400 }); }
        const object = String(payload?.object ?? "page");
        const channel = object === "instagram" ? "instagram" : "messenger";
        const receivedEventId = eventId(payload, raw);

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const eventProvider = `meta_${channel}`;
          const { data: previous } = await (supabaseAdmin as any).from("messaging_inbox_events")
            .select("id,status")
            .eq("provider", eventProvider)
            .eq("external_event_id", receivedEventId)
            .maybeSingle();
          if (previous?.status === "processed") return new Response("duplicate", { status: 200 });
          const inboxPayload: any = { external_event_id: receivedEventId, provider: eventProvider, raw_payload: payload, status: "received", received_at: new Date().toISOString(), processed_at: null, error_message: null };
          if (previous?.id) {
            const { error: inboxUpdateError } = await (supabaseAdmin as any)
              .from("messaging_inbox_events")
              .update(inboxPayload)
              .eq("id", previous.id);
            if (inboxUpdateError) throw new Error(`Falha ao reabrir evento Meta: ${inboxUpdateError.message}`);
          } else {
            const { error: inboxInsertError } = await (supabaseAdmin as any)
              .from("messaging_inbox_events")
              .insert(inboxPayload);
            if (inboxInsertError) {
              // Uma entrega simultânea já assumiu este mesmo corpo. O worker
              // vencedor continuará o processamento; este pode confirmar o
              // recebimento sem disparar CRM, notificações ou IA em duplicidade.
              if (inboxInsertError.code === "23505") return new Response("duplicate", { status: 200 });
              throw new Error(`Falha ao registrar evento Meta: ${inboxInsertError.message}`);
            }
          }

          const publicOrigin = (process.env["PUBLIC_APP_URL"] || process.env["APP_URL"] || new URL(request.url).origin).replace(/\/+$/, "");
          let normalizedCount = 0;
          let companyId: string | null = null;
          const unmatchedIds = new Set<string>();

          const entries = Array.isArray(payload?.entry)
            ? payload.entry
            : payload?.sample
            ? [
                {
                  id: String(payload.sample.value?.recipient?.id ?? "0"),
                  messaging: [payload.sample.value],
                },
              ]
            : [];

          for (const entry of entries) {
            const messaging = [...(entry?.messaging ?? []), ...(entry?.standby ?? [])].map((ev: any) => ({ ev, field: "messaging", value: ev }));
            const changes = (entry?.changes ?? []).map((change: any) => ({ ev: change, field: String(change?.field ?? "change"), value: change?.value ?? {} }));
            for (const item of [...messaging, ...changes]) {
              const ev = item.ev;
              const value = item.value ?? {};
              const pageId = String(ev?.recipient?.id ?? entry?.id ?? value?.page_id ?? "");
              const field = item.field;

              const statuses = field === "messaging" ? statusEvents(ev) : [];
              const readWatermark = Number(ev?.read?.watermark ?? 0);
              if (/delivery|read|message_deliveries|message_reads|message_status/i.test(field) || statuses.length || readWatermark) {
                const { data: statusRows } = await (supabaseAdmin as any).from("whatsapp_instances")
                  .select("company_id,provider")
                  .eq("phone_number_id", pageId)
                  .like("provider", "meta%")
                  .order("updated_at", { ascending: false })
                  .limit(5);
                const statusInst = (statusRows ?? []).find((row: any) => row.provider === eventProvider) ?? (statusRows ?? [])[0] ?? null;
                if (statusInst?.company_id) {
                  companyId = statusInst.company_id;
                  const { applyMetaMessageStatus, applyMetaReadWatermark } = await import("@/lib/meta-message-status.server");
                  for (const status of statuses) {
                    const timestamp = Number(status.occurredAt ?? 0);
                    const occurredAt = timestamp ? new Date(timestamp < 10_000_000_000 ? timestamp * 1000 : timestamp).toISOString() : new Date().toISOString();
                    if (["sent", "delivered", "read", "failed"].includes(status.status)) {
                      await applyMetaMessageStatus(supabaseAdmin, {
                        companyId: statusInst.company_id,
                        provider: statusInst.provider,
                        externalMessageId: status.id,
                        status: status.status as "sent" | "delivered" | "read" | "failed",
                        occurredAt,
                        rawPayload: ev,
                      });
                    }
                  }
                  const readerId = String(ev?.sender?.id ?? "");
                  if (readWatermark && readerId) {
                    await applyMetaReadWatermark(supabaseAdmin, {
                      companyId: statusInst.company_id,
                      provider: statusInst.provider,
                      contactId: readerId,
                      watermark: readWatermark,
                      rawPayload: ev,
                    });
                  }
                }
                if (field !== "messaging" || !ev?.message) continue;
              }

              // Lead Ads pode chegar no mesmo callback da Página. O endpoint dedicado
              // continua disponível, mas não deixamos o lead depender dessa separação.
              if (field === "leadgen") {
                const leadId = String(value?.leadgen_id ?? "");
                const formId = value?.form_id ? String(value.form_id) : undefined;
                if (leadId && pageId) {
                  const { fetchAndProcessMetaLead } = await import("@/lib/meta-leads.server");
                  const leadResult = await fetchAndProcessMetaLead(supabaseAdmin, pageId, leadId, formId);
                  if (leadResult?.ok) normalizedCount += 1;
                }
                continue;
              }

              // Messenger/Instagram podem entregar uma reação como uma
              // alteração da mensagem original. Atualizamos a reação local
              // sem abrir uma nova conversa nem chamar a IA.
              const reaction = field === "messaging" ? reactionFor(ev) : reactionFor(value);
              if (reaction) {
                const targetMessageId = String(reaction?.mid ?? reaction?.message_id ?? reaction?.messageId ?? "");
                const reactionAction = String(reaction?.action ?? "react").toLowerCase();
                const emoji = reactionAction === "unreact" || reactionAction === "remove" ? null : String(reaction?.emoji ?? "").trim() || null;
                const reactionPageId = String(ev?.recipient?.id ?? entry?.id ?? value?.page_id ?? "");
                if (targetMessageId && reactionPageId) {
                  const { data: reactionInst } = await (supabaseAdmin as any)
                    .from("whatsapp_instances")
                    .select("company_id")
                    .eq("phone_number_id", reactionPageId)
                    .like("provider", "meta%")
                    .maybeSingle();
                  if (reactionInst?.company_id) {
                    companyId = reactionInst.company_id;
                    await (supabaseAdmin as any)
                      .from("mensagens")
                      .update({ reacao: emoji })
                      .eq("company_id", reactionInst.company_id)
                      .eq("whatsapp_message_id", targetMessageId);
                    if (emoji) {
                      const senderId = String(ev?.sender?.id ?? value?.from?.id ?? value?.sender_id ?? "");
                      await pushMetaNotification(supabaseAdmin, {
                        companyId: reactionInst.company_id,
                        tipo: "reacao_meta",
                        titulo: "Nova reação em uma mensagem",
                        descricao: `${emoji} recebido${senderId ? ` do contato ${senderId}` : ""}.`,
                        link: "/app/conversas",
                        refId: `meta:message-reaction:${targetMessageId}:${senderId}:${emoji}:${receivedEventId}`,
                      });
                    }
                    normalizedCount += 1;
                  }
                }
                continue;
              }

              // Likes e reações em publicações geram aviso, mas não abrem conversa nem chamam a IA.
              const itemKind = String(value?.item ?? "").toLowerCase();
              const contentReaction = field !== "messaging" && (
                /reaction|like/i.test(field) || /reaction|like/.test(itemKind) || Boolean(value?.reaction_type)
              );
              if (contentReaction) {
                const action = String(value?.verb ?? value?.action ?? "add").toLowerCase();
                const { data: reactionInst } = await (supabaseAdmin as any).from("whatsapp_instances")
                  .select("company_id,instance_name").eq("phone_number_id", pageId).like("provider", "meta%").maybeSingle();
                if (reactionInst?.company_id) {
                  companyId = reactionInst.company_id;
                  if (!/remove|delete|unlike|unreact/.test(action)) {
                    const postId = String(value?.post_id ?? value?.media?.id ?? value?.media_id ?? value?.parent_id ?? "");
                    const actor = compactText(value?.sender_name ?? value?.from?.name ?? value?.from?.username ?? "Alguém", 80);
                    const reactionName = compactText(value?.reaction_type ?? value?.reaction ?? "curtida", 40).toLowerCase();
                    const actorId = String(value?.sender_id ?? value?.from?.id ?? "");
                    await pushMetaNotification(supabaseAdmin, {
                      companyId: reactionInst.company_id,
                      tipo: "reacao_meta",
                      titulo: "Nova interação na publicação",
                      descricao: `${actor} enviou ${reactionName}.`,
                      link: contentLink(String(reactionInst.instance_name), postId),
                      refId: `meta:content-reaction:${postId || pageId}:${actorId}:${reactionName}:${receivedEventId}`,
                    });
                    normalizedCount += 1;
                  }
                }
                continue;
              }

              const senderId = String(ev?.sender?.id ?? value?.from?.id ?? value?.sender_id ?? value?.commenter_id ?? "");
              const isEcho = ev?.message?.is_echo === true;
              const isMention = /mention|tag/i.test(field) || (field === "feed" && /mention|tag/i.test(String(value?.item ?? "")));
              const isComment = /comment/i.test(field) || (field === "feed" && /comment/i.test(String(value?.item ?? "")));
              const shouldForwardToAttention = field === "messaging" || isComment;
              if ((!shouldForwardToAttention && !isMention) || !pageId) continue;

              // Prefere o canal do mesmo tipo do evento e tolera linhas duplicadas de reconexões.
              const { data: instRows } = await (supabaseAdmin as any)
                .from("whatsapp_instances")
                .select("id,instance_name,webhook_token,provider,company_id,instance_token,user_id,updated_at")
                .eq("phone_number_id", pageId)
                .like("provider", "meta%")
                .order("updated_at", { ascending: false })
                .limit(5);
              let inst: any = (instRows ?? []).find((r: any) => r.provider === `meta_${channel}`) ?? (instRows ?? [])[0] ?? null;

              if (!inst && /^\d+$/.test(pageId)) {
                const { data: byName } = await (supabaseAdmin as any)
                  .from("whatsapp_instances")
                  .select("id,instance_name,webhook_token,provider,company_id,instance_token,user_id")
                  .eq("instance_name", `meta_${channel}_${pageId}`)
                  .limit(1)
                  .maybeSingle();
                if (byName) inst = byName;
              }

              if (!inst && Boolean(payload?.sample)) {
                const { data: fallback } = await (supabaseAdmin as any)
                  .from("whatsapp_instances")
                  .select("id,instance_name,webhook_token,provider,company_id,instance_token,user_id")
                  .eq("provider", `meta_${channel}`)
                  .eq("status", "connected")
                  .order("updated_at", { ascending: false })
                  .limit(1)
                  .maybeSingle();
                if (fallback) inst = fallback;
              }

              if (!inst && channel === "instagram") {
                const { data: igFallback } = await (supabaseAdmin as any)
                  .from("whatsapp_instances")
                  .select("id,instance_name,webhook_token,provider,company_id,instance_token,user_id")
                  .eq("provider", "meta_instagram")
                  .eq("status", "connected")
                  .order("updated_at", { ascending: false })
                  .limit(1)
                  .maybeSingle();
                if (igFallback) inst = igFallback;
              }

              if (inst && channel === "instagram" && inst.provider !== "meta_instagram") {
                const { data: correctIg } = await (supabaseAdmin as any)
                  .from("whatsapp_instances")
                  .select("id,instance_name,webhook_token,provider,company_id,instance_token,user_id")
                  .eq("company_id", inst.company_id)
                  .eq("provider", "meta_instagram")
                  .eq("status", "connected")
                  .limit(1)
                  .maybeSingle();
                if (correctIg) inst = correctIg;
              }

              if (!inst) {
                unmatchedIds.add(pageId);
                console.warn(`[meta-webhook] evento ${channel} sem canal cadastrado para o ID ${pageId}`);
                continue;
              }
              companyId = inst.company_id;

              // Trata eco (mensagem enviada pela própria empresa via Instagram App / Facebook Suite)
              if (isEcho) {
                const echoRecipientId = String(ev?.recipient?.id ?? "");
                if (echoRecipientId) {
                  const echoText = textFor(value);
                  const echoAttachment = attachmentFor(value);
                  const echoMediaType = String(echoAttachment?.type ?? "").toLowerCase();
                  const echoMediaUrl = echoAttachment?.payload?.url ? String(echoAttachment.payload.url) : null;
                  const rawEchoTs = ev?.timestamp;
                  const numEchoTs = typeof rawEchoTs === "number" ? rawEchoTs : (typeof rawEchoTs === "string" && /^\d+$/.test(rawEchoTs.trim()) ? Number(rawEchoTs.trim()) : NaN);
                  const echoTimestamp = !isNaN(numEchoTs) && numEchoTs > 0 ? (numEchoTs < 10_000_000_000 ? numEchoTs * 1000 : numEchoTs) : Date.now();
                  const echoExternalId = String(ev?.message?.mid ?? `meta_echo_${receivedEventId}_${echoRecipientId}`);

                  // Reconciliação prévia: se a IA ou sistema já gravou, evita duplicar ou pausar por falso humano
                  const safeEchoText = (echoText || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
                  const { data: existingEcho } = await (supabaseAdmin as any)
                    .from("mensagens")
                    .select("id")
                    .eq("company_id", inst.company_id)
                    .eq("numero", echoRecipientId)
                    .eq("direcao", "saida")
                    .or(`whatsapp_message_id.eq."${echoExternalId}",texto.eq."${safeEchoText}"`)
                    .gte("created_at", new Date(Date.now() - 10 * 60 * 1000).toISOString())
                    .limit(1)
                    .maybeSingle();

                  if (existingEcho?.id) {
                    continue;
                  }

                  const { data: echoMessage, error: echoError } = await (supabaseAdmin as any).from("mensagens").insert({
                      company_id: inst.company_id,
                      user_id: inst.user_id || null,
                      instance_id: inst.id,
                      numero: echoRecipientId,
                      direcao: "saida",
                      autor: "humano",
                      texto: echoText || (echoMediaType ? `[${echoMediaType.toUpperCase()}]` : ""),
                      provider: inst.provider,
                      whatsapp_message_id: echoExternalId,
                      provider_timestamp: new Date(echoTimestamp).toISOString(),
                      created_at: new Date(echoTimestamp).toISOString(),
                      status_envio: "enviado",
                      midia_url: echoMediaUrl,
                      midia_tipo: echoMediaType || null,
                    }).select("id").maybeSingle();
                  if (echoError && echoError.code !== "23505") throw new Error(`Falha ao gravar eco Meta: ${echoError.message}`);
                  if (echoMessage?.id && echoAttachment) {
                    const identity = String(echoAttachment?.payload?.attachment_id ?? echoMediaUrl ?? `${echoExternalId}:0`);
                    const attachmentKey = createHash("sha256").update(identity).digest("hex");
                    const { error: attachmentError } = await (supabaseAdmin as any).from("message_attachments").upsert({
                      company_id: inst.company_id,
                      mensagem_id: echoMessage.id,
                      attachment_key: attachmentKey,
                      provider_attachment_id: echoAttachment?.payload?.attachment_id ? String(echoAttachment.payload.attachment_id) : null,
                      provider_url: echoMediaUrl,
                      kind: echoMediaType || "document",
                    }, { onConflict: "mensagem_id,attachment_key" });
                    if (attachmentError) throw new Error(`Falha ao registrar anexo do eco Meta: ${attachmentError.message}`);
                  }
                  await (supabaseAdmin as any).from("crm_cards").update({
                    ultima_mensagem: (echoText || (echoMediaType ? `[${echoMediaType.toUpperCase()}]` : "")).slice(0, 240),
                    ultima_direcao: "saida",
                    ultima_em: new Date(echoTimestamp).toISOString(),
                  }).eq("company_id", inst.company_id).eq("numero", echoRecipientId);
                  normalizedCount += 1;
                }
                continue;
              }

              if (!senderId || ((isComment || isMention) && senderId === pageId)) continue;

              const { metaFetchProfile } = await import("@/lib/meta.server");
              const profile = inst.instance_token ? await metaFetchProfile(inst.instance_token, senderId, channel) : { name: null, picture: null };
              const text = textFor(value);
              if (isComment || isMention) {
                const objectId = String(value?.comment_id ?? value?.id ?? value?.mention_id ?? `meta_${receivedEventId}_${senderId}`);
                const postId = String(value?.post_id ?? value?.media?.id ?? value?.media_id ?? value?.parent_id ?? "");
                const author = compactText(value?.sender_name ?? value?.from?.name ?? value?.from?.username ?? profile.name ?? "Alguém", 80);
                await pushMetaNotification(supabaseAdmin, {
                  companyId: inst.company_id,
                  tipo: isMention ? "mencion_meta" : "comentario_meta",
                  titulo: isMention ? "Nova menção ou etiqueta" : "Novo comentário",
                  descricao: compactText(text ? `${author}: ${text}` : `${author} interagiu com a publicação.`),
                  link: contentLink(inst.instance_name, postId),
                  refId: `meta:${isMention ? "mention" : "comment"}:${objectId}`,
                });
                normalizedCount += 1;
                // Comentários públicos não abrem conversas privadas no chat CRM
                continue;
              }
              const attachment = attachmentFor(value);
              const mediaType = String(attachment?.type ?? "").toLowerCase();
              if (!text && !attachment) continue;

              const externalId = String(ev?.message?.mid ?? `meta_${receivedEventId}_${senderId}`);
              const sourceTimestamp = ev?.timestamp ?? value?.created_time;
              const numericTs = typeof sourceTimestamp === "number"
                ? sourceTimestamp
                : (typeof sourceTimestamp === "string" && /^\d+$/.test(sourceTimestamp.trim()) ? Number(sourceTimestamp.trim()) : NaN);
              const timestampMs = !isNaN(numericTs) && numericTs > 0
                ? (numericTs < 10_000_000_000 ? numericTs * 1000 : numericTs)
                : (sourceTimestamp ? new Date(sourceTimestamp).getTime() : Date.now());
              const safeTimestampMs = isNaN(timestampMs) ? Date.now() : timestampMs;
              const stableMessageId = String(externalId || `meta:${inst.id}:${senderId}:${safeTimestampMs}`);

              // Verifica se a mensagem já foi processada anteriormente (reintentos de Meta)
              const { data: existingMsg } = await (supabaseAdmin as any)
                .from("mensagens")
                .select("id")
                .eq("company_id", inst.company_id)
                .eq("provider", inst.provider)
                .eq("whatsapp_message_id", stableMessageId)
                .limit(1)
                .maybeSingle();

              if (existingMsg?.id) {
                // Mensagem duplicada/reintento: ignora para não reprocessar nem disparar a IA novamente
                continue;
              }

              const contatoNome = profile.name || (channel === "instagram" ? `Instagram ${senderId.slice(-4)}` : `Messenger ${senderId.slice(-4)}`);

              // 1. Inserir em mensagens
              const { data: insertedMsg, error: insertErr } = await (supabaseAdmin as any)
                .from("mensagens")
                .insert({
                  company_id: inst.company_id,
                  user_id: inst.user_id || null,
                  instance_id: inst.id,
                  numero: senderId,
                  contato_nome: contatoNome,
                  direcao: "entrada",
                  autor: "contato",
                  texto: text || (mediaType ? `[${mediaType.toUpperCase()}]` : ""),
                  provider: inst.provider,
                  whatsapp_message_id: stableMessageId,
                  provider_timestamp: new Date(safeTimestampMs).toISOString(),
                  created_at: new Date(safeTimestampMs).toISOString(),
                  midia_url: attachment?.payload?.url || null,
                  midia_tipo: mediaType || null,
                  status_envio: "recebido",
                })
                .select("*")
                .maybeSingle();

              if (insertErr) {
                if ((insertErr as any).code === "23505") {
                  // Outro worker/reenvio gravou a mesma mensagem entre a busca
                  // e o INSERT. Não acionamos CRM/IA uma segunda vez.
                  continue;
                }
                throw new Error(`Falha ao gravar mensagem Meta ${stableMessageId}: ${insertErr.message}`);
              }
              if (!insertedMsg?.id) throw new Error(`Mensagem Meta ${stableMessageId} não retornou ID após o INSERT.`);

              const providerMediaUrl = attachment?.payload?.url ? String(attachment.payload.url) : null;
              if (attachment) {
                const attachmentIdentity = String(attachment?.payload?.attachment_id ?? providerMediaUrl ?? `${stableMessageId}:0`);
                const attachmentKey = createHash("sha256").update(attachmentIdentity).digest("hex");
                const { error: attachmentError } = await (supabaseAdmin as any).from("message_attachments").upsert({
                  company_id: inst.company_id,
                  mensagem_id: insertedMsg.id,
                  attachment_key: attachmentKey,
                  provider_attachment_id: attachment?.payload?.attachment_id ? String(attachment.payload.attachment_id) : null,
                  provider_url: providerMediaUrl,
                  kind: mediaType || "document",
                }, { onConflict: "mensagem_id,attachment_key" });
                if (attachmentError) throw new Error(`Falha ao registrar anexo Meta: ${attachmentError.message}`);
              }

              // 2. Atualizar ou criar cartão no CRM com canal_chat correto
              const { upsertCard, getStagesBrief, pickLeadOwner } = await import("@/lib/crm-engine.server");
              const stages = await getStagesBrief(supabaseAdmin, inst.company_id);
              const currentCard = await upsertCard(
                supabaseAdmin,
                inst.company_id,
                inst.user_id || null,
                senderId,
                contatoNome,
                text || "",
                stages,
                channel,
              );

              // 3. Extração e preservação de rastreamento (Meta Ads / UTMs / Link Rastreável)
              const patch: any = { canal_chat: channel };
              if (profile.name) patch.nome = profile.name;
              if (profile.picture) patch.foto_url = profile.picture;

              const referral = ev?.referral || ev?.message?.referral || ev?.postback?.referral || value?.referral || null;
              const refString = referral?.ref ? String(referral.ref) : "";
              const fullTrackingText = [text, refString].filter(Boolean).join(" ");

              const {
                extractTrackingFromText,
                extractTrackingProtocolCode,
              } = await import("@/lib/tracking-utils");

              const t = extractTrackingFromText(fullTrackingText);
              const protocolCode = extractTrackingProtocolCode(fullTrackingText);

              const isMetaAd = Boolean(referral?.ad_id || referral?.source === "ADS" || t.fbclid);
              if (isMetaAd) {
                patch.canal_entrada = "ads_meta";
                patch.utm_source = "meta_ads";
                if (referral?.ad_id) {
                  patch.utm_campaign = String(referral.ad_id);
                  patch.origem = `Meta Ads (${channel === "instagram" ? "Instagram" : "Messenger"}): Anúncio ${referral.ad_id}`;
                }
                const adContextData = referral?.ads_context_data || {};
                const prevExtras = currentCard?.campos_extras && typeof currentCard.campos_extras === "object" ? currentCard.campos_extras : {};
                patch.campos_extras = {
                  ...prevExtras,
                  ad_referral: {
                    source_id: referral?.ad_id ? String(referral.ad_id) : null,
                    headline: adContextData.ad_title || null,
                    thumbnail_url: adContextData.photo_url || adContextData.video_url || null,
                    post_id: adContextData.post_id || null,
                    channel,
                    captured_at: new Date().toISOString(),
                  },
                };
              } else {
                patch.canal_entrada = channel;
              }

              if (t.utm_source) patch.utm_source = t.utm_source;
              if (t.utm_medium) patch.utm_medium = t.utm_medium;
              if (t.utm_campaign) patch.utm_campaign = t.utm_campaign;
              if (t.utm_term) patch.utm_term = t.utm_term;
              if (t.utm_content) patch.utm_content = t.utm_content;
              if (t.fbclid) patch.fbclid = t.fbclid;
              if (t.gclid) patch.gclid = t.gclid;

              if (protocolCode) {
                try {
                  const { data: clickSession } = await (supabaseAdmin as any)
                    .from("lead_click_session")
                    .select("*")
                    .eq("company_id", inst.company_id)
                    .eq("code", protocolCode)
                    .maybeSingle();

                  if (clickSession) {
                    if (clickSession.fbclid) patch.fbclid = clickSession.fbclid;
                    if (clickSession.gclid) patch.gclid = clickSession.gclid;
                    if (clickSession.utm_source) patch.utm_source = clickSession.utm_source;
                    if (clickSession.utm_medium) patch.utm_medium = clickSession.utm_medium;
                    if (clickSession.utm_campaign) patch.utm_campaign = clickSession.utm_campaign;
                    if (clickSession.utm_term) patch.utm_term = clickSession.utm_term;
                    if (clickSession.utm_content) patch.utm_content = clickSession.utm_content;
                    if (clickSession.referrer) patch.referrer = clickSession.referrer;
                    if (clickSession.first_page) patch.first_page = clickSession.first_page;

                    patch.campos_extras = {
                      ...(patch.campos_extras || currentCard?.campos_extras || {}),
                      browser_tracking: {
                        fbc: clickSession.fbc,
                        fbp: clickSession.fbp,
                        client_ip: clickSession.client_ip,
                        client_user_agent: clickSession.client_user_agent,
                        captured_at: clickSession.created_at,
                      },
                    };
                  }
                } catch { /* noop */ }
              }

              await (supabaseAdmin as any)
                .from("crm_cards")
                .update(patch)
                .eq("company_id", inst.company_id)
                .eq("numero", senderId);

              // Enriquecer con nombres reales de campaña Meta Ads en segundo plano
              if (referral?.ad_id && currentCard?.id) {
                void import("@/lib/meta-capi.server")
                  .then(({ enrichCardWithMetaAdDetails }) =>
                    enrichCardWithMetaAdDetails(inst.company_id, currentCard.id, String(referral.ad_id)),
                  )
                  .catch(() => null);
              }

              // Disparar evento de conversión LeadSubmitted si provino de anuncio Meta
              if (isMetaAd && currentCard?.id) {
                void import("@/lib/meta-capi.server")
                  .then(({ sendMetaConversionForLead }) =>
                    sendMetaConversionForLead({
                      companyId: inst.company_id,
                      cardId: currentCard.id,
                      eventName: "LeadSubmitted",
                      dedupKey: `${currentCard.id}_meta_${channel}_LeadSubmitted`,
                    }),
                  )
                  .catch(() => null);
              }

              // 4. Distribuição automática se modo manual
              if (currentCard) {
                const { data: stageConfig } = await (supabaseAdmin as any)
                  .from("crm_stage")
                  .select("modo_atendimento")
                  .eq("id", currentCard.stage_id)
                  .maybeSingle();
                if (stageConfig?.modo_atendimento === "manual" && !currentCard.owner_id) {
                  const ownerId = await pickLeadOwner(supabaseAdmin, inst.company_id, currentCard.stage_id);
                  if (ownerId) {
                    await (supabaseAdmin as any).from("crm_cards").update({ owner_id: ownerId }).eq("id", currentCard.id);
                  }
                }
              }

              // 5. Automação / Atendimento IA
              const effectiveText = text || (mediaType ? `[${mediaType.toUpperCase()}]` : "");
              if (effectiveText) {
                const { processInboundAutomation } = await import("@/lib/inbound-automation.server");
                await processInboundAutomation(supabaseAdmin, {
                  companyId: inst.company_id,
                  numero: senderId,
                  texto: effectiveText,
                  inboundMessageId: stableMessageId,
                  stageId: currentCard?.stage_id,
                  isAudioMessage: mediaType === "audio",
                });
              }

              normalizedCount += 1;
            }
          }

          const ignoredNote = unmatchedIds.size && !normalizedCount
            ? `ignorado: nenhum canal ${channel} cadastrado para o ID ${[...unmatchedIds].join(",")}`
            : null;
          await (supabaseAdmin as any).from("messaging_inbox_events")
            .update({ status: "processed", company_id: companyId, normalized_count: normalizedCount, processed_at: new Date().toISOString(), error_message: ignoredNote })
            .eq("provider", eventProvider)
            .eq("external_event_id", receivedEventId);
          return new Response("EVENT_RECEIVED", { status: 200 });
        } catch (error) {
          console.error("[meta-webhook]", error);
          try {
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            await (supabaseAdmin as any).from("messaging_inbox_events")
              .update({ status: "failed", error_message: error instanceof Error ? error.message : String(error), processed_at: new Date().toISOString() })
              .eq("provider", `meta_${channel}`)
              .eq("external_event_id", receivedEventId);
          } catch { /* não esconder o erro original */ }
          return new Response("Webhook processing failed", { status: 500 });
        }
      },
    },
  },
});
