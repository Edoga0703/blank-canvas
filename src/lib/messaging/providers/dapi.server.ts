import type {
  MessagingProvider,
  NormalizedMessagingEvent,
  SendMediaInput,
  SendResult,
  SendTemplateInput,
  SendTextInput,
} from "@/lib/messaging/contracts";
import {
  dapiSendText,
  dapiSendMedia,
  dapiSendTemplate,
} from "@/lib/dapi.server";

function sent(messageId: string, raw?: unknown): SendResult {
  if (!messageId) throw new Error("D-API no devolvió identificador de mensaje.");
  return {
    provider: "dapi",
    externalMessageId: messageId,
    status: "sent",
    raw,
  };
}

function parseParticipant(participant: any, rawData?: any): { jid: string; phone: string; name: string | null } {
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
    const jid = String(participant.jid || participant.id || participant.phone || participant.number || participant.remoteJid || "").trim();
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

function extractText(data: any): string {
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

  // 3. Respuestas a Listas y Botones Interactivos
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

  // 4. Texto estándar y subtítulos multimedia
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

export const dapiProvider: MessagingProvider = {
  id: "dapi",

  async sendText(input: SendTextInput): Promise<SendResult> {
    const res = await dapiSendText(
      input.connectionExternalId,
      input.to,
      input.text,
      input.replyToExternalMessageId,
    );
    return sent(res.id, res.raw);
  },

  async sendMedia(input: SendMediaInput): Promise<SendResult> {
    const res = await dapiSendMedia(input.connectionExternalId, input.to, {
      url: input.mediaUrl,
      type: input.kind === "audio" ? "audio" : input.kind === "image" ? "image" : input.kind === "video" ? "video" : "document",
      caption: input.caption,
      fileName: input.fileName,
      mime: input.mimeType,
      ptt: input.kind === "audio",
    });
    return sent(res.id, res.raw);
  },

  async sendTemplate(input: SendTemplateInput): Promise<SendResult> {
    const res = await dapiSendTemplate(input.connectionExternalId, input.to, {
      name: input.name,
      language: input.language,
      components: input.components,
    });
    return sent(res.id, res.raw);
  },

  async normalizeEvent(raw: unknown): Promise<NormalizedMessagingEvent[]> {
    const body = raw as any;
    if (!body || !body.event) return [];

    const eventName = String(body.event);
    const sessionId = String(body.sessionId || body.session || "");
    const data = body.data || {};
    const externalMessageId = String(data.id || data.message_id || body.traceId || "");

    // Eventos de estado de entrega / lectura
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

      const target = parseParticipant(data.to || data.from || data.recipient, data);

      return [
        {
          type: "status",
          provider: "dapi",
          connectionExternalId: sessionId,
          externalMessageId: String(data.message_id || data.id || externalMessageId),
          status,
          occurredAt: body.timestamp || new Date().toISOString(),
          phone: target.phone,
          raw: body,
        },
      ];
    }

    // Eventos de mensajes entrantes y salientes
    if (eventName === "messages.received" || eventName === "messages.upsert" || eventName === "messages.sent") {
      const fromMe = Boolean(data.fromMe ?? data.key?.fromMe) || eventName === "messages.sent";
      const senderPart = parseParticipant(data.from || data.sender || data.key?.remoteJid || data.remoteJid, data);
      const recipientPart = parseParticipant(data.to || data.recipient_id || data.recipient, data);

      const isGroup = Boolean(
        data.is_group ||
        data.isGroup ||
        (senderPart.jid && senderPart.jid.endsWith("@g.us")) ||
        (recipientPart.jid && recipientPart.jid.endsWith("@g.us")) ||
        (typeof data.from === "string" && data.from.endsWith("@g.us")) ||
        (data.chat_id && String(data.chat_id).endsWith("@g.us"))
      );
      if (isGroup) return [];

      const activePart = fromMe ? recipientPart : senderPart;
      const phone = activePart.phone;
      if (!phone) return [];

      const contactName = String(
        data.from_name ||
        data.pushName ||
        senderPart.name ||
        recipientPart.name ||
        ""
      ).trim() || null;

      let kind: any = "text";
      const attachments: any[] = [];
      const dataType = resolveDapiMediaType(data);

      if (["image", "audio", "video", "document", "sticker"].includes(dataType)) {
        const attachmentKind = dataType === "sticker" ? "sticker" : dataType;
        kind = attachmentKind;
        attachments.push({
          kind: attachmentKind,
          externalId: externalMessageId,
          providerUrl: data.media_url || data.media_data?.early_media_url || null,
          mimeType: data.media_data?.mimetype || data.mimetype || (dataType === "sticker" ? "image/webp" : null),
          fileName: data.media_data?.filename || data.filename || (dataType === "sticker" ? "sticker.webp" : null),
        });
      }

      const text = extractText(data);

      return [
        {
          type: "message",
          provider: "dapi",
          connectionExternalId: sessionId,
          externalMessageId,
          phone,
          contactName,
          direction: fromMe ? "outgoing" : "incoming",
          author: fromMe ? "human" : "contact",
          kind,
          text,
          occurredAt: body.timestamp || new Date().toISOString(),
          replyToExternalMessageId:
            data.quotedMessageId ||
            data.quoted_message_id ||
            data.context?.id ||
            data.context?.message_id ||
            data.message?.extendedTextMessage?.contextInfo?.stanzaId ||
            data.message?.imageMessage?.contextInfo?.stanzaId ||
            null,
          attachments,
          raw: body,
        },
      ];
    }

    return [];
  },
};
