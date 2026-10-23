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
    const sessionId = String(body.sessionId || "");
    const data = body.data || {};
    const externalMessageId = String(data.id || data.message_id || body.traceId || "");

    // Eventos de estado de entrega / lectura
    if (eventName === "message.delivered" || eventName === "message.read") {
      return [
        {
          type: "status",
          provider: "dapi",
          connectionExternalId: sessionId,
          externalMessageId: String(data.message_id || data.id || externalMessageId),
          status: eventName === "message.read" ? "read" : "delivered",
          occurredAt: body.timestamp || new Date().toISOString(),
          phone: String(data.to || data.from || "").replace(/\D/g, ""),
          raw: body,
        },
      ];
    }

    // Eventos de mensajes entrantes y salientes
    if (eventName === "messages.received" || eventName === "messages.sent") {
      const fromMe = Boolean(data.fromMe);
      const phone = String(data.from || data.to || "").replace(/\D/g, "");
      const isGroup = Boolean(data.isGroup || String(data.from || "").endsWith("@g.us"));
      if (isGroup) return [];

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
          contactName: data.from_name || null,
          direction: fromMe ? "outgoing" : "incoming",
          author: fromMe ? "human" : "contact",
          kind,
          text,
          occurredAt: body.timestamp || new Date().toISOString(),
          replyToExternalMessageId: data.quotedMessageId || null,
          attachments,
          raw: body,
        },
      ];
    }

    return [];
  },
};
