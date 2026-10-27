// src/lib/meta-capi.functions.ts
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveCompanyIdCached } from "./company-cache";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { MetaCapiConfig, MetaMessagingEventName } from "./meta-capi.server";

export const getMetaCapiConfigFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const companyId = await resolveCompanyIdCached(supabase, userId);
    const { getMetaCapiConfig } = await import("./meta-capi.server");
    return await getMetaCapiConfig(companyId);
  });

export const saveMetaCapiConfigFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: Partial<MetaCapiConfig>) => data)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const companyId = await resolveCompanyIdCached(supabase, userId);
    const { saveMetaCapiConfig } = await import("./meta-capi.server");
    return await saveMetaCapiConfig(companyId, data);
  });

export const testMetaCapiConnectionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { testEventCode?: string }) => data)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const companyId = await resolveCompanyIdCached(supabase, userId);
    const { getMetaCapiConfig, sendMetaConversionForLead } = await import("./meta-capi.server");
    const cfg = await getMetaCapiConfig(companyId);

    if (!cfg.access_token || (!cfg.dataset_id && !cfg.waba_id)) {
      throw new Error("Por favor completa el Access Token y el Dataset ID / WABA ID antes de probar.");
    }

    // Buscar un lead reciente o enviar evento sintético
    const { data: latestCard } = await (supabaseAdmin as any)
      .from("crm_cards")
      .select("id")
      .eq("company_id", companyId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!latestCard) {
      throw new Error("No hay ningún lead en el CRM para asociar al evento de prueba.");
    }

    const res = await sendMetaConversionForLead({
      companyId,
      cardId: latestCard.id,
      eventName: "LeadSubmitted",
      dedupKey: `test_ping_${Date.now()}`,
      customData: {
        test_event: true,
        source: "capiconversa_test_button",
      },
    });

    if (!res.ok) {
      throw new Error(res.error || "Meta rechazó el evento de prueba. Revisa el Token y el ID.");
    }

    return {
      ok: true,
      fbtraceId: res.fbtraceId,
      eventsReceived: res.eventsReceived,
    };
  });

export const listMetaCapiLogsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const companyId = await resolveCompanyIdCached(supabase, userId);

    try {
      const { data: logs, error } = await (supabaseAdmin as any)
        .from("meta_capi_event_log")
        .select("id, card_id, event_name, action_source, dataset_id, value, currency, status, fbtrace_id, error_message, created_at")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(25);

      if (!error && logs) return logs;
    } catch {
      // Si la tabla no existe aún
    }

    // Fallback a lead_evento
    try {
      const { data: events } = await (supabaseAdmin as any)
        .from("lead_evento")
        .select("id, card_id, tipo, descricao, created_at")
        .eq("company_id", companyId)
        .eq("tipo", "meta_capi")
        .order("created_at", { ascending: false })
        .limit(15);

      return (events || []).map((e: any) => ({
        id: e.id,
        card_id: e.card_id,
        event_name: "Meta CAPI",
        action_source: "fallback",
        dataset_id: "-",
        value: null,
        currency: "USD",
        status: e.descricao.includes("Fallo") ? "failed" : "sent",
        fbtrace_id: null,
        error_message: e.descricao,
        created_at: e.created_at,
      }));
    } catch {
      return [];
    }
  });

export const sendManualLeadConversionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { cardId: string; eventName: MetaMessagingEventName; value?: number; currency?: string }) => data)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const companyId = await resolveCompanyIdCached(supabase, userId);
    const { sendMetaConversionForLead } = await import("./meta-capi.server");

    return await sendMetaConversionForLead({
      companyId,
      cardId: data.cardId,
      eventName: data.eventName,
      value: data.value,
      currency: data.currency,
      dedupKey: `manual_${data.cardId}_${data.eventName}_${Date.now()}`,
    });
  });
