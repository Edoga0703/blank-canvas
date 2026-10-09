import type {
  MessagingProvider,
  NormalizedMessagingEvent,
  SendMediaInput,
  SendResult,
  SendTemplateInput,
  SendTextInput,
} from "@/lib/messaging/contracts";
import {
  generatedNormalizeEvent,
  generatedSendMedia,
  generatedSendTemplate,
  generatedSendText,
} from "@/lib/messaging/lovable-whatsapp.generated.server";

function sent(messageId: string, raw?: unknown): SendResult {
  if (!messageId) throw new Error("Lovable WhatsApp no devolvió el identificador del mensaje.");
  return {
    provider: "lovable_whatsapp",
    externalMessageId: messageId,
    status: "sent",
    raw,
  };
}

export const lovableWhatsAppProvider: MessagingProvider = {
  id: "lovable_whatsapp",

  async sendText(input: SendTextInput) {
    const result = await generatedSendText({
      to: input.to,
      text: input.text,
      replyToMessageId: input.replyToExternalMessageId,
    });
    return sent(result.messageId, result.raw);
  },

  async sendMedia(input: SendMediaInput) {
    const result = await generatedSendMedia({
      to: input.to,
      type: input.kind,
      mediaUrl: input.mediaUrl,
      mimeType: input.mimeType,
      fileName: input.fileName,
      caption: input.caption,
    });
    return sent(result.messageId, result.raw);
  },

  async sendTemplate(input: SendTemplateInput) {
    const result = await generatedSendTemplate({
      to: input.to,
      name: input.name,
      language: input.language,
      components: input.components,
    });
    return sent(result.messageId, result.raw);
  },

  async normalizeEvent(raw: unknown): Promise<NormalizedMessagingEvent[]> {
    // El puente generado devuelve datos desconocidos hasta observar eventos
    // reales. La validación final se implementará con las muestras del conector.
    return (await generatedNormalizeEvent(raw)) as NormalizedMessagingEvent[];
  },
};
