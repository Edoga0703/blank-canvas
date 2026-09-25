import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertSuperAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("is_super_admin");
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Acesso negado");
  void userId;
}

export const getBillingWebhookInfo = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    return {
      kiwify: process.env.KIWIFY_WEBHOOK_TOKEN ?? "",
      cakto: process.env.CAKTO_WEBHOOK_TOKEN ?? "",
      perfectpay: process.env.PERFECTPAY_WEBHOOK_TOKEN ?? "",
      abacatepay: process.env.ABACATEPAY_WEBHOOK_TOKEN ?? "",
    };
  });

/** Gateway padrão usado pelos clientes (kiwify | abacatepay) + portal de assinatura. */
export const getBillingGateway = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await (supabaseAdmin as any)
      .from("app_config").select("gateway_padrao, gateway_portal_url").limit(1).maybeSingle();
    return {
      gateway: (data?.gateway_padrao as string) ?? "kiwify",
      portalUrl: (data?.gateway_portal_url as string) ?? "",
    };
  });

export const setBillingGateway = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { gateway: string; portalUrl?: string | null }) => ({
    gateway: d.gateway === "abacatepay" ? "abacatepay" : "kiwify",
    portalUrl: (d.portalUrl ?? "").toString().trim() || null,
  }))
  .handler(async ({ context, data }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any)
      .from("app_config")
      .upsert({ id: true, gateway_padrao: data.gateway, gateway_portal_url: data.portalUrl });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listRecentBillingEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("billing_event_log")
      .select("id, provider, event_type, buyer_email, processed, error, matched_company_id, created_at")
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw new Error(error.message);
    return data ?? [];
  });
