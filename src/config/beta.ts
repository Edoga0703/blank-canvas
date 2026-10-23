/**
 * Configuración de proveedores y canales de Capiversa.
 *
 * Durante la fase SaaS multicanal, D-API es el proveedor unificado de WhatsApp
 * (soportando tanto QR Code / Pairing de 8 dígitos como API Oficial Meta Cloud API).
 */
const envOnly = import.meta.env.VITE_BETA_LOVABLE_WHATSAPP_ONLY;
const envMetaChannels = import.meta.env.VITE_META_CHANNELS_ENABLED;

export const betaConfig = {
  lovableWhatsAppOnly: envOnly === "true",
  // Instagram Direct y Messenger son canales independientes del proveedor de WhatsApp
  metaChannelsEnabled: envMetaChannels == null ? true : envMetaChannels !== "false",
  activeWhatsAppProvider: "dapi" as const,
  legacyProvidersEnabled: envOnly !== "true",
};
