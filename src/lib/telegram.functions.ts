import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveCompanyIdCached } from "./company-cache";

function publicOrigin() {
  return (
    process.env["PUBLIC_APP_URL"] ||
    process.env["APP_URL"] ||
    "https://metrixcrm.com.br"
  ).replace(/\/+$/, "");
}

export const connectTelegram = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { botToken: string; displayName?: string | null }) => d)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const companyId = await resolveCompanyIdCached(supabase, userId);

    const { requireCapacidade } = await import("./plugin-gate.server");
    await requireCapacidade(supabase, companyId, "telegram");

    const botToken = String(data.botToken ?? "").trim();
    if (!/^\d+:[A-Za-z0-9_-]{20,}$/.test(botToken)) {
      throw new Error("Token do bot inválido. Copie o token gerado pelo @BotFather.");
    }

    const { tgGetMe, tgSetWebhook } = await import("./telegram.server");
    const me = await tgGetMe(botToken);
    const instanceName = `tg_${me.id}`;
    const webhookToken = crypto.randomUUID().replace(/-/g, "");

    const { error } = await (supabase as any).from("whatsapp_instances").upsert(
      {
        company_id: companyId,
        user_id: userId,
        instance_name: instanceName,
        display_name: data.displayName || (me.username ? `@${me.username}` : me.first_name) || "Telegram",
        provider: "telegram",
        provider_type: "telegram",
        instance_token: botToken,
        webhook_token: webhookToken,
        status: "connected",
        numero: String(me.id),
        last_state_at: new Date().toISOString(),
      },
      { onConflict: "instance_name" },
    );
    if (error) throw new Error(error.message);

    const { invalidateInstanceMetaCache } = await import("./evolution.server");
    invalidateInstanceMetaCache(instanceName);

    await tgSetWebhook(
      botToken,
      `${publicOrigin()}/api/public/telegram-webhook?t=${webhookToken}`,
      webhookToken,
    );

    return { ok: true, instanceName, username: me.username ?? null };
  });

export const disconnectTelegram = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { instanceName: string }) => d)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const companyId = await resolveCompanyIdCached(supabase, userId);

    const { supabaseAdmin: sbAdminTok } = await import("@/integrations/supabase/client.server");
    const { data: row } = await (sbAdminTok as any)
      .from("whatsapp_instances")
      .select("instance_token")
      .eq("company_id", companyId)
      .eq("instance_name", data.instanceName)
      .maybeSingle();

    if (row?.instance_token) {
      try {
        const { tgDeleteWebhook } = await import("./telegram.server");
        await tgDeleteWebhook(row.instance_token);
      } catch {
        /* best-effort */
      }
    }

    const { error } = await (supabase as any)
      .from("whatsapp_instances")
      .delete()
      .eq("company_id", companyId)
      .eq("instance_name", data.instanceName);
    if (error) throw new Error(error.message);

    const { invalidateInstanceMetaCache } = await import("./evolution.server");
    invalidateInstanceMetaCache(data.instanceName);
    return { ok: true };
  });

export const telegramStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const companyId = await resolveCompanyIdCached(supabase, userId);
    const { data } = await (supabase as any)
      .from("whatsapp_instances")
      .select("instance_name, display_name, numero, status")
      .eq("company_id", companyId)
      .eq("provider", "telegram");
    return { bots: data ?? [] };
  });
