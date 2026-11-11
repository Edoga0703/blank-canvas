import { PublishContext, ProviderResult, SocialPublisherAdapter } from "./types";

/**
 * Adaptador de Telegram para publicación en canales.
 * Fundación en Fase 0: validación de contratos y stub seguro.
 * La implementación completa de despacho por MTProto Sidecar se despliega en Fase 3.
 */
export const telegramAdapter: SocialPublisherAdapter = {
  platform: "telegram",

  async validate(context: PublishContext): Promise<{ valid: boolean; error?: string }> {
    if (!context.caption && !context.mediaUrl) {
      return { valid: false, error: "A publicação no Telegram precisa de texto ou mídia." };
    }
    return { valid: true };
  },

  async publish(context: PublishContext): Promise<ProviderResult> {
    // Stub de Fase 0 mientras se activa el gateway MTProto
    return {
      state: "failed_terminal",
      code: "TELEGRAM_GATEWAY_PENDING_PHASE_3",
      message: "A publicação de canais do Telegram será ativada na Fase 3 com o gateway MTProto.",
    };
  },
};
