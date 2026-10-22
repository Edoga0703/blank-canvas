/**
 * Configuración de proveedores y canales de Capiversa.
 *
 * Durante la fase SaaS multicanal, Uazapi, Evolution API, Telegram, WhatsApp Oficial (WaBlast)
 * y Lovable WhatsApp están todos disponibles por defecto.
 * Solo si VITE_BETA_LOVABLE_WHATSAPP_ONLY === "true" se restringe a Lovable WhatsApp.
 */
const envOnly = import.meta.env.VITE_BETA_LOVABLE_WHATSAPP_ONLY;
const envMetaChannels = import.meta.env.VITE_META_CHANNELS_ENABLED;

export const betaConfig = {
  lovableWhatsAppOnly: envOnly === "true",
  // Instagram Direct y Messenger son canales independientes del proveedor de WhatsApp
  metaChannelsEnabled: envMetaChannels == null ? true : envMetaChannels !== "false",
  activeWhatsAppProvider: "lovable_whatsapp" as const,
  legacyProvidersEnabled: envOnly !== "true",
};
