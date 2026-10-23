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

function parseParticipant(participant: any): { jid: string; phone: string; name: string | null } {
  if (!participant) return { jid: "", phone: "", name: null };
  if (typeof participant === "string") {
    const jid = participant.trim();
    const phone = jid.split("@")[0].replace(/\D/g, "");
    return { jid, phone, name: null };
  }
  if (typeof participant === "object") {
    const jid = String(participant.jid || participant.id || participant.phone || participant.number || "").trim();
    const rawName = participant.name || participant.pushName || participant.notify || null;
    const name = rawName ? String(rawName).trim() : null;
    const phone = (participant.phone || participant.number || jid.split("@")[0] || "").replace(/\D/g, "");
    return { jid, phone, name };
  }
  return { jid: "", phone: "", name: null };
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

      const target = parseParticipant(data.to || data.from || data.recipient);

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
    if (eventName === "messages.received" || eventName === "messages.sent") {
      const fromMe = Boolean(data.fromMe);
      const senderPart = parseParticipant(data.from || data.sender);
      const recipientPart = parseParticipant(data.to || data.recipient_id || data.recipient);

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
      const dataType = String(data.type || "text").toLowerCase();

      if (["image", "audio", "video", "document"].includes(dataType)) {
        kind = dataType;
        attachments.push({
          kind: dataType,
          externalId: externalMessageId,
          providerUrl: data.media_url || null,
          mimeType: data.media_data?.mimetype || data.mimetype || null,
          fileName: data.media_data?.filename || data.filename || null,
        });
      }

      const text = String(
        data.message ||
        data.text ||
        data.body ||
        data.media_data?.caption ||
        data.caption ||
        (dataType === "list_response" ? data.data?.selected_row_id || "" : "") ||
        ""
      ).trim();

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
          replyToExternalMessageId: data.quotedMessageId || data.quoted_message_id || null,
          attachments,
          raw: body,
        },
      ];
    }

    return [];
  },
};
