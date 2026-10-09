import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const forceReconfigureUazapiWebhooks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { uazSetWebhook } = await import("./uazapi.server");

    // 1. Buscar todas as instâncias Uazapi conectadas
    const { data: instances, error } = await (supabaseAdmin as any)
      .from("whatsapp_instances")
      .select("instance_name, instance_token, webhook_token")
      .eq("provider", "uazapi")
      .eq("status", "connected");

    if (error) throw error;
    if (!instances || instances.length === 0) return { message: "Nenhuma instância Uazapi conectada encontrada." };

    const publicOrigin = (
      process.env.PUBLIC_APP_URL || 
      process.env.APP_URL || 
      process.env.VITE_PUBLIC_APP_URL || 
      "https://metrixcrm.com.br"
    ).replace(/\/+$/, "");

    const results = [];
    for (const inst of instances) {
      if (!inst.instance_token || !inst.webhook_token) {
        results.push({ instance: inst.instance_name, success: false, error: "Token ausente" });
        continue;
      }

      const webhookUrl = `${publicOrigin}/api/public/uazapi-webhook?t=${inst.webhook_token}`;
      try {
        await uazSetWebhook(inst.instance_token, webhookUrl);
        results.push({ instance: inst.instance_name, success: true, url: webhookUrl });
      } catch (e: any) {
        console.error(`[forceReconfigure] Erro na instância ${inst.instance_name}:`, e.message);
        results.push({ instance: inst.instance_name, success: false, error: e.message });
      }
    }

    return { results };
  });
