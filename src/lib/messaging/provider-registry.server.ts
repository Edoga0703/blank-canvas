import { dapiProvider } from "@/lib/messaging/providers/dapi.server";
import type { MessagingProvider, MessagingProviderId } from "@/lib/messaging/contracts";

const providers = new Map<MessagingProviderId, MessagingProvider>([
  [dapiProvider.id, dapiProvider],
  ["dapi_official", { ...dapiProvider, id: "dapi_official" }],
]);

export function registerMessagingProvider(provider: MessagingProvider) {
  providers.set(provider.id, provider);
}

export function getMessagingProvider(id: MessagingProviderId): MessagingProvider {
  const provider = providers.get(id);
  if (!provider) {
    const registered = Array.from(providers.keys()).join(", ") || "(ninguno)";
    throw new Error(`Proveedor de mensajería no registrado: "${id}". IDs registrados: ${registered}`);
  }
  return provider;
}
