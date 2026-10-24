import { dapiProvider } from "@/lib/messaging/providers/dapi.server";
import type { MessagingProvider, MessagingProviderId } from "@/lib/messaging/contracts";
import { lovableWhatsAppProvider } from "@/lib/messaging/providers/lovable-whatsapp.server";

const providers = new Map<MessagingProviderId, MessagingProvider>([
  [lovableWhatsAppProvider.id, lovableWhatsAppProvider],
  [dapiProvider.id, dapiProvider],
  ["dapi_official", { ...dapiProvider, id: "dapi_official" }],
]);

export function registerMessagingProvider(provider: MessagingProvider) {
  providers.set(provider.id, provider);
}

export function getMessagingProvider(id: MessagingProviderId): MessagingProvider {
  const provider = providers.get(id);
  if (!provider) throw new Error(`Proveedor de mensajería no registrado: ${id}`);
  return provider;
}
