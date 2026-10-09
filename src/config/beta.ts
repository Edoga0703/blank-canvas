/**
 * Configuración temporal de Capiversa v1.1.
 *
 * Conservamos los adaptadores heredados para el futuro SaaS. Durante la beta,
 * WhatsApp usa solo la conexion oficial administrada por Lovable; los canales
 * oficiales de Meta tienen un interruptor independiente.
 */
const envOnly = import.meta.env.VITE_BETA_LOVABLE_WHATSAPP_ONLY;
const envMetaChannels = import.meta.env.VITE_META_CHANNELS_ENABLED;

export const betaConfig = {
  lovableWhatsAppOnly: envOnly == null ? true : envOnly !== "false",
  // Instagram Direct y Messenger son canales independientes del proveedor de
  // WhatsApp. Se pueden activar mientras la conexion de WhatsApp sigue en pausa.
  metaChannelsEnabled: envMetaChannels == null ? true : envMetaChannels !== "false",
  activeWhatsAppProvider: "lovable_whatsapp" as const,
  legacyProvidersEnabled: envOnly === "false",
};
