/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveCompanyId } from "@/lib/evolution-helpers";

export const registerLovableWhatsappConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input?: { displayName?: string | null; phone?: string | null }) => ({
    displayName: input?.displayName?.trim().slice(0, 60) || "WhatsApp oficial de Capiversa",
    phone: input?.phone?.replace(/\D/g, "").slice(0, 15) || null,
  }))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const companyId = await resolveCompanyId(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const externalConnectionId = "lovable-project-default";
    const instanceName = `lovable_${companyId.replace(/-/g, "").slice(0, 16)}`;
    const { data: existing, error: findError } = await (supabaseAdmin as any)
      .from("whatsapp_instances")
      .select("id,instance_name,status,external_connection_id")
      .eq("company_id", companyId)
      .eq("provider", "lovable_whatsapp")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (findError)
      throw new Error(`No se pudo consultar la conexión de Lovable: ${findError.message}`);
    if (existing) {
      const { data: connection, error: updateError } = await (supabaseAdmin as any)
        .from("whatsapp_instances")
        .update({
          user_id: userId,
          display_name: data.displayName,
          ...(data.phone ? { numero: data.phone } : {}),
        })
        .eq("id", existing.id)
        .select("instance_name,status")
        .single();
      if (updateError)
        throw new Error(`No se pudo actualizar la conexión de Lovable: ${updateError.message}`);
      return connection;
    }
    const { data: connection, error } = await (supabaseAdmin as any)
      .from("whatsapp_instances")
      .insert({
        company_id: companyId,
        user_id: userId,
        instance_name: instanceName,
        display_name: data.displayName,
        numero: data.phone,
        provider: "lovable_whatsapp",
        provider_type: "lovable_whatsapp",
        external_connection_id: externalConnectionId,
        status: "pending",
        last_state_at: new Date().toISOString(),
      })
      .select("instance_name,status")
      .single();
    if (error) throw new Error(`No se pudo registrar la conexión de Lovable: ${error.message}`);
    return connection;
  });
