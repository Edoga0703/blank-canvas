/**
 * Configuración temporal de Capiversa v1.1.
 *
 * Conservamos los adaptadores heredados para el futuro SaaS, pero durante la
 * beta solo exponemos la conexión oficial administrada por Lovable.
 */
const envOnly = import.meta.env.VITE_BETA_LOVABLE_WHATSAPP_ONLY;

export const betaConfig = {
  lovableWhatsAppOnly: envOnly == null ? true : envOnly !== "false",
  activeWhatsAppProvider: "lovable_whatsapp" as const,
  legacyProvidersEnabled: envOnly === "false",
};
