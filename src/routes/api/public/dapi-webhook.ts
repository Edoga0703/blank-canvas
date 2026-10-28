import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { ingestMessagingEvent } from "@/lib/messaging/ingest.server";
import { dapiDownloadMedia } from "@/lib/dapi.server";
import { transcribeIncomingAudio, describeIncomingFile } from "@/lib/media-understanding.server";

/**
 * Helper forense para extraer JID, número telefónico y nombre desde cualquier formato
 * de participante en D-API (objeto { jid, name } o string "5511...@s.whatsapp.net").
 */
function parseDapiParticipant(
  participant: any,
  rawData?: any,
): { jid: string; phone: string; name: string | null } {
  const extractCleanPhone = (val: any): string => {
    if (!val || typeof val !== "string") return "";
    const trimmed = val.trim();
    if (trimmed.endsWith("@lid") || trimmed.endsWith("@g.us")) return "";
    return trimmed.split("@")[0].split(":")[0].replace(/\D/g, "");
  };

  const extractLidDigits = (val: any): string => {
    if (!val || typeof val !== "string") return "";
    const trimmed = val.trim();
    if (!trimmed.endsWith("@lid")) return "";
    return trimmed.split("@")[0].split(":")[0].replace(/\D/g, "");
  };

  const altPhone =
    extractCleanPhone(rawData?.sender_pn) ||
    extractCleanPhone(rawData?.senderPn) ||
    extractCleanPhone(rawData?.participantPn) ||
    extractCleanPhone(rawData?.key?.senderPn) ||
    extractCleanPhone(rawData?.key?.participantPn) ||
    extractCleanPhone(rawData?.remoteJidAlt) ||
    extractCleanPhone(rawData?.chat?.phone) ||
    extractCleanPhone(rawData?.phone) ||
    extractCleanPhone(rawData?.number);

  if (!participant && !altPhone) return { jid: "", phone: "", name: null };

  if (typeof participant === "string") {
    const jid = participant.trim();
    const phone = extractCleanPhone(jid) || altPhone || extractLidDigits(jid);
    return { jid, phone, name: null };
  }

  if (typeof participant === "object" && participant !== null) {
    const jid = String(
      participant.jid || participant.remoteJid || participant.id || participant.phone || participant.number || "",
    ).trim();
    const rawName = participant.name || participant.pushName || participant.notify || null;
    const name = rawName ? String(rawName).trim() : null;
    const phone =
      extractCleanPhone(participant.phone) ||
      extractCleanPhone(participant.number) ||
      extractCleanPhone(participant.sender_pn) ||
      extractCleanPhone(participant.senderPn) ||
      extractCleanPhone(jid) ||
      altPhone ||
      extractLidDigits(jid);
    return { jid, phone, name };
  }

  return { jid: "", phone: altPhone, name: null };
}

function resolveDapiMediaType(data: any): "text" | "image" | "audio" | "video" | "document" | "sticker" {
  const raw = String(data?.type || data?.mediaType || "").toLowerCase().trim();
  if (raw === "image" || raw === "photo") return "image";
  if (raw === "audio" || raw === "ptt" || raw === "voice" || raw === "myaudio") return "audio";
  if (raw === "video" || raw === "gif") return "video";
  if (raw === "document" || raw === "file") return "document";
  if (raw === "sticker") return "sticker";

  const m = data?.message;
  if (m && typeof m === "object") {
    if (m.imageMessage) return "image";
    if (m.audioMessage || m.pttMessage) return "audio";
    if (m.videoMessage) return "video";
    if (m.documentMessage || m.documentWithCaptionMessage) return "document";
    if (m.stickerMessage) return "sticker";
  }
  if (data?.media_url || data?.media_data?.url || data?.media_data?.direct_path) {
    const mime = String(data?.media_data?.mimetype || data?.mimetype || "").toLowerCase();
    if (mime.startsWith("image/webp")) return "sticker";
    if (mime.startsWith("image/")) return "image";
    if (mime.startsWith("audio/")) return "audio";
    if (mime.startsWith("video/")) return "video";
    return "document";
  }
  return "text";
}

async function isAutomatedOrExistingEcho(params: {
  companyId: string;
  phone: string;
  messageId: string;
  safeText: string;
  mediaType?: string;
}): Promise<{ matched: boolean; rowId: string | null }> {
  const { companyId, phone, messageId, safeText, mediaType } = params;

  // 1. Por ID exacto de mensaje en WhatsApp
  if (messageId && !messageId.startsWith("dapi_")) {
    const { data: existingById } = await supabaseAdmin
      .from("mensagens")
      .select("id")
      .eq("company_id", companyId)
      .eq("whatsapp_message_id", messageId)
      .limit(1)
      .maybeSingle();
    if (existingById?.id) return { matched: true, rowId: existingById.id };
  }

  // 2. Mensaje de texto recién despachado por el CRM/IA en los últimos 12s sin ID definitivo
  if (safeText) {
    const raceCutoff = new Date(Date.now() - 12_000).toISOString();
    const { data: pendingCrmMsg } = await supabaseAdmin
      .from("mensagens")
      .select("id")
      .eq("company_id", companyId)
      .eq("numero", phone)
      .eq("direcao", "saida")
      .eq("texto", safeText)
      .gte("created_at", raceCutoff)
      .or("status_envio.eq.pendente,whatsapp_message_id.is.null")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (pendingCrmMsg?.id) return { matched: true, rowId: pendingCrmMsg.id };
  }

  // 3. Mensaje multimedia (foto/video/audio/documento) recién despachado por el CRM/IA en los últimos 15s sin ID definitivo
  if (mediaType && mediaType !== "text") {
    const mediaCutoff = new Date(Date.now() - 15_000).toISOString();
    const { data: pendingMediaMsg } = await supabaseAdmin
      .from("mensagens")
      .select("id")
      .eq("company_id", companyId)
      .eq("numero", phone)
      .eq("direcao", "saida")
      .eq("midia_tipo", mediaType)
      .gte("created_at", mediaCutoff)
      .or("status_envio.eq.pendente,whatsapp_message_id.is.null")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (pendingMediaMsg?.id) return { matched: true, rowId: pendingMediaMsg.id };
  }

  return { matched: false, rowId: null };
}

function extractDapiText(data: any): string {
  if (!data) return "";

  // 1. Ubicación (Activa <ChatLocation /> en conversas.tsx)
  const loc =
    data.location ||
    data.message?.locationMessage ||
    data.message?.liveLocationMessage ||
    (data.type === "location" ? data : null);
  const lat = loc?.latitude ?? loc?.degreesLatitude ?? data.latitude;
  const lng = loc?.longitude ?? loc?.degreesLongitude ?? data.longitude;
  if (typeof lat === "number" && typeof lng === "number") {
    const label = loc?.name || loc?.address || data.caption || "";
    return `📍 Localização: ${lat}, ${lng}${label ? ` (${label})` : ""}`;
  }

  // 2. Tarjeta de Contacto vCard (Activa <ChatVCard /> en conversas.tsx)
  const vcard =
    data.vcard ||
    data.contact?.vcard ||
    data.contacts?.[0]?.vcard ||
    data.message?.contactMessage?.vcard ||
    data.message?.contactsArrayMessage?.contacts?.[0]?.vcard;
  if (typeof vcard === "string" && vcard.includes("BEGIN:VCARD")) {
    return vcard.trim();
  }
  if (data.type === "contact" || data.type === "contacts" || data.contact) {
    const c = data.contact || data.contacts?.[0] || data;
    const cName = c?.fullName || c?.name?.formatted_name || c?.displayName || "Contato";
    const cPhone = c?.phoneNumber || c?.phones?.[0]?.phone || c?.wa_id || "";
    if (cPhone) return `👤 *${cName}*\n📞 ${cPhone}`;
  }

  // 3. Respuestas a Listas y Botones Interactivos (Oficial y No Oficial)
  if (data.type === "list_response" || data.interactive?.type === "list_reply") {
    const reply = data.interactive?.list_reply || data.data || {};
    return String(reply.title || reply.id || reply.selected_row_id || "").trim();
  }
  if (
    data.type === "button_response" ||
    data.type === "interactive" ||
    data.interactive?.type === "button_reply"
  ) {
    const reply = data.interactive?.button_reply || data.button || data.data || {};
    return String(reply.title || reply.text || reply.id || reply.selected_button_id || "").trim();
  }

  // 4. Texto estándar o leyenda multimedia
  if (typeof data.message === "string") return data.message.trim();
  if (typeof data.text === "string") return data.text.trim();
  if (typeof data.body === "string") return data.body.trim();
  if (typeof data.caption === "string") return data.caption.trim();
  if (typeof data.media_data?.caption === "string") return data.media_data.caption.trim();

  if (data.message && typeof data.message === "object") {
    const m = data.message;
    if (typeof m.conversation === "string") return m.conversation.trim();
    if (typeof m.extendedTextMessage?.text === "string") return m.extendedTextMessage.text.trim();
    if (typeof m.text === "string") return m.text.trim();
    if (typeof m.imageMessage?.caption === "string") return m.imageMessage.caption.trim();
    if (typeof m.videoMessage?.caption === "string") return m.videoMessage.caption.trim();
    if (typeof m.documentMessage?.caption === "string") return m.documentMessage.caption.trim();
  }

  return "";
}

export const Route = createFileRoute("/api/public/dapi-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const token = (url.searchParams.get("t") || request.headers.get("x-webhook-token") || "").trim();

          const rawText = await request.text();
          let body: any = {};
          try {
            body = JSON.parse(rawText || "{}");
          } catch {
            return new Response("Invalid JSON payload", { status: 400 });
          }

          const sessionId = String(body.sessionId || body.session || body.instance || body.instanceId || "").trim();
          if (!sessionId) {
            return new Response("Missing sessionId in webhook body", { status: 400 });
          }

          // Validación estricta de seguridad de la conexión y de su webhook_token
          const { data: inst, error: instErr } = await supabaseAdmin
            .from("whatsapp_instances")
            .select("id, company_id, user_id, instance_name, provider, status, paused, webhook_token")
            .eq("instance_name", sessionId)
            .maybeSingle();

          if (instErr || !inst) {
            console.warn(`[dapi-webhook] Instancia no encontrada para sessionId=${sessionId}`);
            return new Response("Unauthorized or unknown session", { status: 401 });
          }

          if (inst.webhook_token && inst.webhook_token !== token) {
            console.warn(`[dapi-webhook] Token inválido o ausente para sessionId=${sessionId}`);
            return new Response("Unauthorized webhook token", { status: 401 });
          }

          const eventName = String(body.event || "");
          const data = body.data || {};

          // 1. Manejo de estados de conexión (connection.status, connection.qrcode, connection.paircode)
          if (eventName === "connection.status") {
            const rawStatus = String(data.status || data.state || "").toLowerCase();
            let newStatus = "connecting";
            if (rawStatus === "connected" || rawStatus === "open") {
              newStatus = "connected";
            } else if (rawStatus === "disconnected" || rawStatus === "logged_out" || rawStatus === "close") {
              newStatus = "disconnected";
            }

            const updates: Record<string, any> = {
              status: newStatus,
              updated_at: new Date().toISOString(),
              last_state_at: new Date().toISOString(),
            };
            const phoneStr = String(data.phoneNumber || data.phone || data.numero || "").replace(/\D/g, "");
            if (phoneStr) {
              updates.numero = phoneStr;
            }

            await supabaseAdmin
              .from("whatsapp_instances")
              .update(updates)
              .eq("id", inst.id);

            return new Response(JSON.stringify({ ok: true, event: "connection.status", status: newStatus }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          }

          // 1b. Actualización en vivo de QR Code por Webhook [Solo API No Oficial]
          if (eventName === "connection.qrcode" || eventName === "connection.paircode") {
            const rawQr = data.qrCodeImage || data.qrcode || data.qrCode || data.qr || null;
            if (rawQr) {
              const { normalizeQrToDataUrl } = await import("@/lib/dapi.server");
              const qrDataUrl = await normalizeQrToDataUrl(rawQr);
              if (qrDataUrl) {
                await supabaseAdmin
                  .from("whatsapp_instances")
                  .update({ qr_code: qrDataUrl, updated_at: new Date().toISOString() } as any)
                  .eq("id", inst.id);
              }
            }
            return new Response(JSON.stringify({ ok: true, event: eventName }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          }

          // 1c. Mensajes eliminados ("Apagar para todos") [Ambas en recepción]
          if (
            eventName === "message.deleted" ||
            eventName === "messages.delete" ||
            data.type === "revoked" ||
            data.message?.protocolMessage?.type === 0 ||
            data.message?.protocolMessage?.type === "REVOKE"
          ) {
            const revokedId = String(
              data.target_message_id ||
                data.deletedMessageId ||
                data.message?.protocolMessage?.key?.id ||
                data.id ||
                data.message_id ||
                "",
            ).trim();
            if (revokedId) {
              await supabaseAdmin
                .from("mensagens")
                .update({
                  deletado_em: new Date().toISOString(),
                  texto: "🚫 Mensagem apagada",
                  midia_url: null,
                  midia_tipo: null,
                } as any)
                .eq("company_id", inst.company_id)
                .eq("whatsapp_message_id", revokedId);
            }
            return new Response(JSON.stringify({ ok: true, event: "message.deleted" }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          }

          // 1d. Mensajes editados por el cliente o asesor [Solo API No Oficial]
          if (
            eventName === "message.edited" ||
            eventName === "messages.edited" ||
            data.type === "edited" ||
            Boolean(data.message?.editedMessage) ||
            data.message?.protocolMessage?.type === 14 ||
            data.message?.protocolMessage?.type === "MESSAGE_EDIT"
          ) {
            const editedId = String(
              data.target_message_id ||
                data.editedMessageId ||
                data.message?.editedMessage?.message?.protocolMessage?.key?.id ||
                data.message?.protocolMessage?.key?.id ||
                data.id ||
                "",
            ).trim();
            const newText = extractDapiText(
              data.message?.editedMessage?.message?.protocolMessage?.editedMessage ||
                data.message?.protocolMessage?.editedMessage ||
                data,
            );
            if (editedId && newText) {
              await supabaseAdmin
                .from("mensagens")
                .update({
                  texto: newText,
                  editado_em: new Date().toISOString(),
                } as any)
                .eq("company_id", inst.company_id)
                .eq("whatsapp_message_id", editedId);
            }
            return new Response(JSON.stringify({ ok: true, event: "message.edited" }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          }

          // 1e. Reacciones a mensajes (👍, ❤️, etc.) [Ambas]
          if (
            eventName === "message.reaction" ||
            data.type === "reaction" ||
            Boolean(data.reaction) ||
            Boolean(data.message?.reactionMessage)
          ) {
            const reactionObj = data.reaction || data.message?.reactionMessage || data;
            const targetMsgId = String(
              reactionObj.message_id ||
                reactionObj.messageId ||
                reactionObj.key?.id ||
                data.target_message_id ||
                "",
            ).trim();
            const emoji = String(reactionObj.emoji ?? reactionObj.text ?? "").trim() || null;
            if (targetMsgId) {
              await supabaseAdmin
                .from("mensagens")
                .update({ reacao: emoji } as any)
                .eq("company_id", inst.company_id)
                .eq("whatsapp_message_id", targetMsgId);
            }
            return new Response(JSON.stringify({ ok: true, event: "message.reaction" }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          }

          // 2. Manejo de estados de entrega y lectura (message.delivered, message.read, message.status, messages.status)
          if (
            eventName === "message.delivered" ||
            eventName === "message.read" ||
            eventName === "message.status" ||
            eventName === "messages.status"
          ) {
            let status: "sent" | "delivered" | "read" | "failed" = "delivered";
            if (eventName === "message.read") {
              status = "read";
            } else if (eventName === "message.delivered") {
              status = "delivered";
            } else {
              const rawStatus = String(data.status || "").toLowerCase();
              if (rawStatus === "read" || rawStatus === "played") status = "read";
              else if (rawStatus === "delivered" || rawStatus === "received") status = "delivered";
              else if (rawStatus === "sent") status = "sent";
              else if (rawStatus === "failed" || rawStatus === "error") status = "failed";
            }

            const externalMessageId = String(data.message_id || data.id || body.traceId || "");
            if (externalMessageId) {
              await ingestMessagingEvent({
                provider: "dapi",
                externalConnectionId: sessionId,
                externalEventId: `dapi_status_${eventName}_${externalMessageId}_${status}`,
                raw: body,
              });
            }
            return new Response(JSON.stringify({ ok: true }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          }

          // 3. Manejo de mensajes (messages.received, messages.sent)
          if (eventName === "messages.received" || eventName === "messages.upsert" || eventName === "messages.sent") {
            const fromMe = Boolean(data.fromMe ?? data.key?.fromMe) || eventName === "messages.sent";
            const senderPart = parseDapiParticipant(data.from || data.sender || data.key?.remoteJid || data.remoteJid, data);
            const recipientPart = parseDapiParticipant(data.to || data.recipient_id || data.recipient, data);

            const isGroup = Boolean(
              data.is_group ||
              data.isGroup ||
              (senderPart.jid && senderPart.jid.endsWith("@g.us")) ||
              (recipientPart.jid && recipientPart.jid.endsWith("@g.us")) ||
              (typeof data.from === "string" && data.from.endsWith("@g.us")) ||
              (data.chat_id && String(data.chat_id).endsWith("@g.us"))
            );
            if (isGroup) {
              const { data: co } = await supabaseAdmin
                .from("company")
                .select("grupos_ativos")
                .eq("id", inst.company_id)
                .maybeSingle();
              if ((co as any)?.grupos_ativos) {
                const groupJid =
                  (senderPart.jid && senderPart.jid.endsWith("@g.us") ? senderPart.jid : null) ||
                  (recipientPart.jid && recipientPart.jid.endsWith("@g.us") ? recipientPart.jid : null) ||
                  (typeof data.from === "string" && data.from.endsWith("@g.us") ? data.from : null) ||
                  (data.chat_id && String(data.chat_id).endsWith("@g.us") ? String(data.chat_id) : null);
                if (groupJid) {
                  const groupText = extractDapiText(data);
                  const groupMsgId = String(data.id || data.message_id || data.key?.id || `grp_${Date.now()}`);
                  const nowIso = new Date().toISOString();
                  await (supabaseAdmin as any).from("whatsapp_grupo").upsert(
                    {
                      company_id: inst.company_id,
                      jid: groupJid,
                      nome: data.chatName || data.groupName || data.chat?.name || groupJid,
                      ultima_em: nowIso,
                    },
                    { onConflict: "company_id,jid" },
                  );
                  await (supabaseAdmin as any).from("mensagens").upsert(
                    {
                      company_id: inst.company_id,
                      user_id: inst.user_id,
                      instance_id: inst.id,
                      numero: groupJid,
                      grupo_jid: groupJid,
                      contato_nome: data.pushName || data.from_name || senderPart.name || null,
                      direcao: fromMe ? "saida" : "entrada",
                      autor: fromMe ? "humano" : "contato",
                      texto: groupText || "",
                      provider: inst.provider || "dapi",
                      whatsapp_message_id: groupMsgId,
                      status_envio: fromMe ? "enviado" : "recebido",
                      created_at: nowIso,
                    },
                    { onConflict: "company_id,provider,whatsapp_message_id" },
                  );
                }
              }
              return new Response(JSON.stringify({ ok: true, groupProcessed: true }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
              });
            }

            const messageId = String(data.id || data.message_id || data.key?.id || body.traceId || `dapi_${Date.now()}`);
            const activeParticipant = fromMe ? recipientPart : senderPart;
            const phone = activeParticipant.phone;

            if (!phone) {
              return new Response(JSON.stringify({ ok: true, ignored: true, reason: "no_phone" }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
              });
            }

            const contactName = String(
              data.from_name ||
              data.pushName ||
              senderPart.name ||
              recipientPart.name ||
              ""
            ).trim() || null;

            // Manejo de eco y mensajes salientes (fromMe === true / messages.sent)
            if (fromMe) {
              const text = extractDapiText(data);
              const outDataType = resolveDapiMediaType(data);
              const echoCheck = await isAutomatedOrExistingEcho({
                companyId: inst.company_id,
                phone,
                messageId,
                safeText: text,
                mediaType: outDataType,
              });

              if (echoCheck.matched) {
                if (echoCheck.rowId) {
                  await supabaseAdmin
                    .from("mensagens")
                    .update({
                      status_envio: "enviado",
                      ...(messageId && !messageId.startsWith("dapi_") ? { whatsapp_message_id: messageId } : {}),
                    } as any)
                    .eq("id", echoCheck.rowId);
                }
                return new Response(JSON.stringify({ ok: true, echo: true }), {
                  status: 200,
                  headers: { "Content-Type": "application/json" },
                });
              }

              // Mensaje saliente nuevo (enviado desde celular físico, API o script externo):
              // Procesar multimedia si está presente
              let mediaUrl: string | null = data.media_url || data.media_data?.early_media_url || null;
              let mimeType: string | null = data.media_data?.mimetype || data.mimetype || (outDataType === "sticker" ? "image/webp" : null);

              if (["image", "audio", "video", "document", "sticker"].includes(outDataType)) {
                if (!mediaUrl) {
                  const downloaded = await dapiDownloadMedia(sessionId, messageId, {
                    direct_path: data.direct_path || data.media_data?.direct_path || null,
                    media_key: data.media_key || data.media_data?.media_key || null,
                    mimetype: mimeType,
                    url: data.url || data.media_data?.url || null,
                  });
                  if (downloaded?.base64) {
                    const rawB64 = String(downloaded.base64);
                    mimeType = downloaded.mimetype || mimeType || "application/octet-stream";
                    mediaUrl = rawB64.startsWith("data:") ? rawB64 : `data:${mimeType};base64,${rawB64}`;
                  } else if (downloaded?.media_url) {
                    mediaUrl = downloaded.media_url;
                  }
                }
              }

              const enrichedBody = {
                ...body,
                data: {
                  ...data,
                  fromMe: true,
                  id: messageId,
                  text,
                  message: typeof data.message === "object" && data.message !== null ? data.message : text,
                  raw_message: data.message,
                  media_url: mediaUrl,
                  mimetype: mimeType,
                },
              };

              await ingestMessagingEvent({
                provider: "dapi",
                externalConnectionId: sessionId,
                externalEventId: `dapi_out_${messageId}`,
                raw: enrichedBody,
              });

              // Pausar IA para este contacto (Helpdesk handoff)
              const nowIso = new Date().toISOString();
              try {
                await (supabaseAdmin as any).from("contact_pause").upsert(
                  {
                    company_id: inst.company_id,
                    user_id: (inst as any).user_id ?? null,
                    numero: phone,
                    pausado: true,
                    pausado_por: "humano",
                    pausado_em: nowIso,
                  } as any,
                  { onConflict: "company_id,numero" },
                );
              } catch { /* noop */ }

              return new Response(JSON.stringify({ ok: true, processedOutgoing: true }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
              });
            }

            // Mensaje entrante del cliente (fromMe === false)
            const dataType = resolveDapiMediaType(data);
            let mediaUrl: string | null = data.media_url || null;
            let mimeType: string | null = data.media_data?.mimetype || data.mimetype || (dataType === "sticker" ? "image/webp" : null);
            let text = extractDapiText(data);

            if (["image", "audio", "video", "document", "sticker"].includes(dataType)) {
              // Si D-API no envió URL directa, descargamos el binario base64 pasando direct_path y media_key
              if (!mediaUrl) {
                const downloaded = await dapiDownloadMedia(sessionId, messageId, {
                  direct_path: data.direct_path || data.media_data?.direct_path || null,
                  media_key: data.media_key || data.media_data?.media_key || null,
                  mimetype: mimeType,
                  url: data.url || data.media_data?.url || null,
                });
                if (downloaded?.base64) {
                  const rawB64 = String(downloaded.base64);
                  mimeType = downloaded.mimetype || mimeType || "application/octet-stream";
                  mediaUrl = rawB64.startsWith("data:")
                    ? rawB64
                    : `data:${mimeType};base64,${rawB64}`;
                } else if (downloaded?.media_url) {
                  mediaUrl = downloaded.media_url;
                }
              }

              // Entendimiento de audio por IA (Whisper)
              if (dataType === "audio" && mediaUrl) {
                const transcribed = await transcribeIncomingAudio(mediaUrl, mimeType);
                if (transcribed) {
                  text = transcribed;
                }
              }

              // Entendimiento de imagen/documento por IA (comprobantes / catálogos)
              if ((dataType === "image" || dataType === "document") && mediaUrl) {
                const originalCaption = text;
                const desc = await describeIncomingFile(mediaUrl, dataType as "image" | "document", mimeType, originalCaption);
                if (desc) {
                  const aiBlock = `[${dataType === "document" ? "Documento" : "Imagen"} recibido: ${desc}]`;
                  text = originalCaption ? `${originalCaption}\n\n${aiBlock}` : aiBlock;
                }
              }
            }

            // Preservar y elevar metadatos de anuncio (CTWA / referral / contextInfo)
            const contextInfo =
              data.contextInfo ||
              data.message?.extendedTextMessage?.contextInfo ||
              data.message?.contextInfo ||
              data.message?.imageMessage?.contextInfo ||
              data.message?.videoMessage?.contextInfo ||
              null;

            const externalAdReply =
              data.externalAdReply ||
              contextInfo?.externalAdReply ||
              data.message?.extendedTextMessage?.contextInfo?.externalAdReply ||
              null;

            const referral =
              data.referral ||
              data.message?.referral ||
              body.referral ||
              null;

            // Enriquecemos body.data con la URL o dataURI descargada y el texto transcrito/descrito
            // SIN destruir el objeto data.message original ni los metadatos de anuncio CTWA.
            const enrichedBody = {
              ...body,
              data: {
                ...data,
                id: messageId,
                type: dataType,
                text,
                message: typeof data.message === "object" && data.message !== null ? data.message : text,
                raw_message: data.message,
                contextInfo,
                externalAdReply,
                referral,
                media_url: mediaUrl,
                mimetype: mimeType,
              },
            };

            await ingestMessagingEvent({
              provider: "dapi",
              externalConnectionId: sessionId,
              externalEventId: `dapi_msg_${messageId}`,
              raw: enrichedBody,
            });

            return new Response(JSON.stringify({ ok: true, processed: true }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          }

          return new Response(JSON.stringify({ ok: true, unhandledEvent: eventName }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch (err: any) {
          console.error("[dapi-webhook] Fatal error:", err);
          return new Response(JSON.stringify({ error: err?.message || "Internal server error" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
