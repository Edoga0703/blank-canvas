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
  return value?.message?.reaction ?? value?.reaction ?? null;
}

function statusEvents(value: any) {
  const result: Array<{ id: string; status: string; occurredAt?: number }> = [];
  for (const id of value?.delivery?.mids ?? []) result.push({ id: String(id), status: "delivered", occurredAt: value?.watermark });
  if (value?.read?.watermark) result.push({ id: `read:${String(value.read.watermark)}`, status: "read", occurredAt: value.read.watermark });
  if (value?.message_id) result.push({ id: String(value.message_id), status: String(value.status ?? "updated"), occurredAt: value?.timestamp });
  return result;
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
                    normalizedCount += 1;
                  }
                }
                continue;
              }

              const senderId = String(ev?.sender?.id ?? value?.from?.id ?? value?.sender_id ?? value?.commenter_id ?? "");
              const isEcho = ev?.message?.is_echo === true;
              const isComment = /comment|mention/i.test(field) || (field === "feed" && /comment|mention/i.test(String(value?.item ?? "")));
              const shouldForwardToAttention = field === "messaging" || isComment;
              if (!shouldForwardToAttention || !senderId || !pageId || isEcho || (isComment && senderId === pageId)) continue;

              const { data: inst } = await (supabaseAdmin as any).from("whatsapp_instances").select("id,instance_name,webhook_token,provider,company_id,instance_token").eq("phone_number_id", pageId).like("provider", "meta%").maybeSingle();
              if (!inst?.webhook_token) continue;
              companyId = inst.company_id;
              const { metaFetchProfile } = await import("@/lib/meta.server");
              const profile = inst.instance_token ? await metaFetchProfile(inst.instance_token, senderId) : { name: null, picture: null };
              const text = textFor(value);
              const attachment = attachmentFor(value);
              const mediaType = String(attachment?.type ?? "").toLowerCase();
              const message = attachment?.payload?.url
                ? mediaType === "image" ? { imageMessage: { mimetype: "image/jpeg", url: attachment.payload.url, caption: text || undefined } }
                  : mediaType === "video" ? { videoMessage: { mimetype: "video/mp4", url: attachment.payload.url, caption: text || undefined } }
                    : mediaType === "audio" ? { audioMessage: { mimetype: "audio/mp4", url: attachment.payload.url } }
                      : { documentMessage: { mimetype: "application/octet-stream", url: attachment.payload.url, fileName: "arquivo", caption: text || undefined } }
                : { conversation: text || (isComment ? `[${field}]` : "") };
              if (!text && !attachment && !isComment) continue;

              const externalId = String(ev?.message?.mid ?? value?.comment_id ?? value?.id ?? `meta_${receivedEventId}_${senderId}`);
              const sourceTimestamp = ev?.timestamp ?? value?.created_time;
              const timestampMs = typeof sourceTimestamp === "number" ? (sourceTimestamp < 10_000_000_000 ? sourceTimestamp * 1000 : sourceTimestamp) : (sourceTimestamp ? new Date(sourceTimestamp).getTime() : Date.now());
              const normalized = {
                event: "messages.upsert", channel, canal: channel, instance: inst.instance_name,
                data: {
                  key: { remoteJid: `${senderId}@s.whatsapp.net`, fromMe: false, id: externalId },
                  message, pushName: profile.name || (channel === "instagram" ? `Instagram ${senderId.slice(-4)}` : `Messenger ${senderId.slice(-4)}`),
                  messageTimestamp: Math.floor(timestampMs / 1000),
                },
              };
              const forwarded = await fetch(`${publicOrigin}/api/public/whatsapp-webhook?t=${encodeURIComponent(inst.webhook_token)}`, {
                method: "POST", headers: { "Content-Type": "application/json", "x-webhook-token": inst.webhook_token }, body: JSON.stringify(normalized), signal: AbortSignal.timeout(20_000),
              });
              if (!forwarded.ok) throw new Error(`normalização interna retornou ${forwarded.status}`);
              normalizedCount += 1;
              const patch: any = { canal_chat: channel };
              if (profile.name) patch.nome = profile.name;
              if (profile.picture) patch.foto_url = profile.picture;
              await (supabaseAdmin as any).from("crm_cards").update(patch).eq("company_id", inst.company_id).eq("numero", senderId);
              if (profile.name) await (supabaseAdmin as any).from("mensagens").update({ contato_nome: profile.name }).eq("company_id", inst.company_id).eq("numero", senderId);
            }
          }

          await (supabaseAdmin as any).from("messaging_inbox_events").update({ status: "processed", company_id: companyId, normalized_count: normalizedCount, processed_at: new Date().toISOString(), error_message: null }).eq("external_event_id", receivedEventId);
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
