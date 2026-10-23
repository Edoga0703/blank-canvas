import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { collectProvidersHealth, saveProviderCapacityConfig, type ProvidersHealthResult } from "@/lib/provider-monitor.server";

export type { ProviderHealth, ProviderKey, ProvidersHealthResult } from "@/lib/provider-monitor.server";
export type { WhatsappFleet, FleetInstance } from "@/lib/whatsapp-fleet.server";

export const getProvidersHealth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ProvidersHealthResult> => {
    const { data: isSuper } = await context.supabase.rpc("is_super_admin");
    if (!isSuper) throw new Error("Acesso restrito ao super admin");
    return collectProvidersHealth();
  });

export const getWhatsappFleet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isSuper } = await context.supabase.rpc("is_super_admin");
    if (!isSuper) throw new Error("Acesso restrito ao super admin");
    const { collectWhatsappFleet } = await import("@/lib/whatsapp-fleet.server");
    const { getProviderCapacityConfig } = await import("@/lib/provider-monitor.server");
    const cap = await getProviderCapacityConfig();
    return collectWhatsappFleet(cap["dapi"]);
  });

export const setProviderCapacity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { capacity: Record<string, number> }) => input)
  .handler(async ({ context, data }) => {
    const { data: isSuper } = await context.supabase.rpc("is_super_admin");
    if (!isSuper) throw new Error("Acesso restrito ao super admin");
    return { capacity: await saveProviderCapacityConfig(data.capacity) };
  });
