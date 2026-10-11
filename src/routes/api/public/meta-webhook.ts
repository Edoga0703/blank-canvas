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

function eventId(payload: any, raw: string) {
  if (payload?.id) return String(payload.id);
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
  for (const id of value?.delivery?.mids ?? []) result.push({ id: String(id), status: "delivered", occurredAt: value?.watermark });
  if (value?.read?.watermark) result.push({ id: `read:${String(value.read.watermark)}`, status: "read", occurredAt: value.read.watermark });
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
        const { getMetaAppSecrets } = await import("@/lib/meta-config.server");
        const secrets = (await getMetaAppSecrets()).map(clean).filter(Boolean);
        const allowUnsigned = process.env["META_ALLOW_UNSIGNED_WEBHOOKS"] === "true";
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
          const { data: previous } = await (supabaseAdmin as any).from("messaging_inbox_events").select("id,status").eq("external_event_id", receivedEventId).maybeSingle();
          if (previous?.status === "processed") return new Response("duplicate", { status: 200 });
          const inboxPayload: any = { external_event_id: receivedEventId, provider: `meta_${channel}`, raw_payload: payload, status: "processing", received_at: new Date().toISOString() };
          if (previous?.id) await (supabaseAdmin as any).from("messaging_inbox_events").update(inboxPayload).eq("id", previous.id);
          else await (supabaseAdmin as any).from("messaging_inbox_events").insert(inboxPayload);

          const publicOrigin = (process.env["PUBLIC_APP_URL"] || process.env["APP_URL"] || new URL(request.url).origin).replace(/\/+$/, "");
          let normalizedCount = 0;
          let companyId: string | null = null;
          const unmatchedIds = new Set<string>();

          for (const entry of payload?.entry ?? []) {
            const messaging = [...(entry?.messaging ?? []), ...(entry?.standby ?? [])].map((ev: any) => ({ ev, field: "messaging", value: ev }));
            const changes = (entry?.changes ?? []).map((change: any) => ({ ev: change, field: String(change?.field ?? "change"), value: change?.value ?? {} }));
            for (const item of [...messaging, ...changes]) {
              const ev = item.ev;
              const value = item.value ?? {};
              const pageId = String(ev?.recipient?.id ?? entry?.id ?? value?.page_id ?? "");
              const field = item.field;

              const statuses = field === "messaging" ? statusEvents(ev) : [];
              if (/delivery|read|message_deliveries|message_reads|message_status/i.test(field) || statuses.length) {
                const { data: statusInst } = await (supabaseAdmin as any).from("whatsapp_instances").select("company_id").eq("phone_number_id", pageId).like("provider", "meta%").maybeSingle();
                if (statusInst?.company_id) {
                  companyId = statusInst.company_id;
                  for (const status of statuses) {
                    const { data: existingStatus } = await (supabaseAdmin as any).from("message_status_events").select("id").eq("company_id", statusInst.company_id).eq("external_message_id", status.id).eq("status", status.status).limit(1).maybeSingle();
                    if (!existingStatus) await (supabaseAdmin as any).from("message_status_events").insert({ company_id: statusInst.company_id, external_message_id: status.id, status: status.status, occurred_at: status.occurredAt ? new Date(Number(status.occurredAt)).toISOString() : new Date().toISOString(), raw_payload: ev });
                    const timestamp = Number(status.occurredAt ?? 0);
                    const occurredAt = timestamp ? new Date(timestamp < 10_000_000_000 ? timestamp * 1000 : timestamp).toISOString() : new Date().toISOString();
                    const localStatus = status.status === "delivered" ? "recebido" : status.status === "read" ? "visto" : status.status === "sent" ? "enviado" : status.status;
                    await (supabaseAdmin as any).from("message_status_events").update({ occurred_at: occurredAt }).eq("company_id", statusInst.company_id).eq("external_message_id", status.id).eq("status", status.status);
                    await (supabaseAdmin as any).from("mensagens").update({ status_envio: localStatus }).eq("company_id", statusInst.company_id).eq("whatsapp_message_id", status.id);
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
                  const echoExternalId = String(ev?.message?.mid ?? `meta_echo_${receivedEventId}`);
                  const echoTimestamp = ev?.timestamp ? (ev.timestamp < 10_000_000_000 ? ev.timestamp * 1000 : ev.timestamp) : Date.now();
                  try {
                    await (supabaseAdmin as any).from("mensagens").insert({
                      company_id: inst.company_id,
                      user_id: inst.user_id || null,
                      numero: echoRecipientId,
                      direcao: "saida",
                      autor: "humano",
                      texto: echoText || "",
                      provider: inst.provider,
                      whatsapp_message_id: echoExternalId,
                      created_at: new Date(echoTimestamp).toISOString(),
                      status_envio: "enviado",
                    });
                  } catch { /* ignora duplicatas de eco */ }
                  await (supabaseAdmin as any).from("crm_cards").update({
                    ultima_mensagem: echoText.slice(0, 240),
                    ultima_direcao: "saida",
                    ultima_em: new Date(echoTimestamp).toISOString(),
                  }).eq("company_id", inst.company_id).eq("numero", echoRecipientId);
                  normalizedCount += 1;
                }
                continue;
              }

              if (!senderId || ((isComment || isMention) && senderId === pageId)) continue;

              const { metaFetchProfile } = await import("@/lib/meta.server");
              const profile = inst.instance_token ? await metaFetchProfile(inst.instance_token, senderId) : { name: null, picture: null };
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
              const timestampMs = typeof sourceTimestamp === "number" ? (sourceTimestamp < 10_000_000_000 ? sourceTimestamp * 1000 : sourceTimestamp) : (sourceTimestamp ? new Date(sourceTimestamp).getTime() : Date.now());
              const stableMessageId = String(externalId || `meta:${inst.id}:${senderId}:${timestampMs}`);

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
                  numero: senderId,
                  contato_nome: contatoNome,
                  direcao: "entrada",
                  autor: "contato",
                  texto: text || (mediaType ? `[${mediaType.toUpperCase()}]` : ""),
                  provider: inst.provider,
                  whatsapp_message_id: stableMessageId,
                  created_at: new Date(timestampMs).toISOString(),
                  midia_url: attachment?.payload?.url || null,
                  midia_tipo: mediaType || null,
                  status_envio: "recebido",
                })
                .select("*")
                .maybeSingle();

              if (insertErr && (insertErr as any).code !== "23505") {
                console.error("[meta-webhook] DB Insert Error:", insertErr);
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

              // 3. Garantir canal_chat e foto no card
              const patch: any = { canal_chat: channel, canal_entrada: channel };
              if (profile.name) patch.nome = profile.name;
              if (profile.picture) patch.foto_url = profile.picture;
              await (supabaseAdmin as any)
                .from("crm_cards")
                .update(patch)
                .eq("company_id", inst.company_id)
                .eq("numero", senderId);

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
              if (text) {
                const { processInboundAutomation } = await import("@/lib/inbound-automation.server");
                await processInboundAutomation(supabaseAdmin, {
                  companyId: inst.company_id,
                  numero: senderId,
                  texto: text,
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
          await (supabaseAdmin as any).from("messaging_inbox_events").update({ status: "processed", company_id: companyId, normalized_count: normalizedCount, processed_at: new Date().toISOString(), error_message: ignoredNote }).eq("external_event_id", receivedEventId);
          return new Response("EVENT_RECEIVED", { status: 200 });
        } catch (error) {
          console.error("[meta-webhook]", error);
          try {
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            await (supabaseAdmin as any).from("messaging_inbox_events").update({ status: "failed", error_message: error instanceof Error ? error.message : String(error) }).eq("external_event_id", receivedEventId);
          } catch { /* não esconder o erro original */ }
          return new Response("Webhook processing failed", { status: 500 });
        }
      },
    },
  },
});
