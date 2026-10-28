// src/lib/meta-capi.functions.ts
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveCompanyIdCached } from "./company-cache";
import {
  getMetaCapiConfig,
  saveMetaCapiConfig,
  discoverOrCreateMetaDataset,
  sendMetaConversionForLead,
  sendSyntheticMetaTestEvent,
  META_BUSINESS_MESSAGING_EVENTS,
  META_CAPI_GRAPH_VERSION,
  type MetaCapiConfig,
  type MetaMessagingEventName,
} from "./meta-capi.server";

async function assertCompanyAdminOrOwner(companyId: string, userId: string): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: cu } = await (supabaseAdmin as any)
    .from("company_user")
    .select("role")
    .eq("company_id", companyId)
    .eq("user_id", userId)
    .eq("ativo", true)
    .limit(1)
    .maybeSingle();

  const role = String(cu?.role || "").toLowerCase();
  if (role && !["owner", "admin", "super_admin", "gestor"].includes(role)) {
    throw new Error("Permissão insuficiente: apenas administradores podem alterar a configuração Meta CAPI.");
  }
}

function maskConfigToken(cfg: MetaCapiConfig) {
  const raw = String(cfg.access_token || "").trim();
  const hasToken = raw.length > 0;
  const masked = hasToken ? `••••••••${raw.slice(-4)}` : "";
  return {
    ...cfg,
    access_token: "",
    has_access_token: hasToken,
    access_token_masked: masked,
  };
}

export const getMetaCapiConfigFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const companyId = await resolveCompanyIdCached(context.supabase, context.userId);
    const cfg = await getMetaCapiConfig(companyId);
    return maskConfigToken(cfg);
  });

export const saveMetaCapiConfigFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: Partial<MetaCapiConfig> & { clear_access_token?: boolean }) => d || {})
  .handler(async ({ context, data }) => {
    const companyId = await resolveCompanyIdCached(context.supabase, context.userId);
    await assertCompanyAdminOrOwner(companyId, context.userId);
    const saved = await saveMetaCapiConfig(companyId, data);
    return maskConfigToken(saved);
  });

export const autoDiscoverMetaDatasetFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { nodeId?: string; accessToken?: string }) => d || {})
  .handler(async ({ context, data }) => {
    const companyId = await resolveCompanyIdCached(context.supabase, context.userId);
    await assertCompanyAdminOrOwner(companyId, context.userId);
    const cfg = await getMetaCapiConfig(companyId);

    const incomingToken =
      data?.accessToken && !data.accessToken.includes("••••") ? data.accessToken.trim() : "";
    const token = incomingToken || cfg.access_token;
    const nodeId = (data?.nodeId || cfg.waba_id || cfg.page_id || "").trim();

    if (!token) {
      return { datasetId: null, error: "Ingresa o guarda primero el Access Token de Meta." };
    }
    if (!nodeId) {
      return { datasetId: null, error: "Ingresa un WABA ID o Page ID para buscar o crear el Dataset." };
    }

    const res = await discoverOrCreateMetaDataset({ nodeId, accessToken: token });
    if (res.datasetId) {
      await saveMetaCapiConfig(companyId, {
        dataset_id: res.datasetId,
        ...(incomingToken ? { access_token: incomingToken } : {}),
        ...(data?.nodeId ? { waba_id: data.nodeId } : {}),
      });
    }
    return res;
  });

export const testMetaCapiConnectionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d?: {
      accessToken?: string;
      datasetId?: string;
      wabaId?: string;
      testEventCode?: string;
      currency?: string;
      modoConexao?: string;
    }) => d || {},
  )
  .handler(async ({ context, data }) => {
    const companyId = await resolveCompanyIdCached(context.supabase, context.userId);
    await assertCompanyAdminOrOwner(companyId, context.userId);
    const cfg = await getMetaCapiConfig(companyId);

    const incomingToken =
      data?.accessToken && !data.accessToken.includes("••••") ? data.accessToken.trim() : "";
    const token = incomingToken || cfg.access_token;
    let datasetId = (data?.datasetId || cfg.dataset_id || "").trim();
    const wabaId = (data?.wabaId || cfg.waba_id || "").trim();
    const testEventCode =
      data?.testEventCode !== undefined ? data.testEventCode.trim() : (cfg.test_event_code || "").trim();

    if (!token) {
      return { ok: false, error: "Falta el Access Token de Meta." };
    }
    if (!datasetId && !wabaId) {
      return { ok: false, error: "Falta el Dataset ID (Pixel ID) o el WABA ID." };
    }

    if (!datasetId && wabaId) {
      const discovered = await discoverOrCreateMetaDataset({ nodeId: wabaId, accessToken: token });
      if (!discovered.datasetId) {
        return {
          ok: false,
          error: discovered.error || "No se pudo autodescubrir el Dataset ID desde el WABA ID.",
        };
      }
      datasetId = discovered.datasetId;
      await saveMetaCapiConfig(companyId, { dataset_id: datasetId });
    }

    // Si el usuario proveyó un Test Event Code, enviamos un evento sintético seguro de prueba (nunca un lead real)
    if (testEventCode) {
      return await sendSyntheticMetaTestEvent({
        companyId,
        accessToken: token,
        datasetId,
        testEventCode,
        currency: data?.currency || cfg.currency || "BRL",
      });
    }

    // Si NO hay Test Event Code, validamos credenciales y existencia del Dataset vía GET sin contaminar métricas reales
    try {
      const verifyUrl = `https://graph.facebook.com/${META_CAPI_GRAPH_VERSION}/${encodeURIComponent(datasetId)}?fields=id,name&access_token=${encodeURIComponent(token)}`;
      const res = await fetch(verifyUrl, { method: "GET", signal: AbortSignal.timeout(12_000) });
      const json: any = await res.json().catch(() => ({}));
      if (!res.ok || json?.error) {
        return {
          ok: false,
          error: json?.error?.message || `Error HTTP ${res.status} al verificar el Dataset en Meta Graph API.`,
        };
      }
      return {
        ok: true,
        fbtraceId: `DATASET_OK:${json.id || datasetId}`,
        eventsReceived: 0,
        datasetName: json.name || null,
      };
    } catch (err: any) {
      return { ok: false, error: err?.message || "Error de red al verificar conexión con Meta." };
    }
  });

export const sendManualLeadConversionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { cardId: string; eventName: MetaMessagingEventName; value?: number }) => {
    if (!d?.cardId || !d?.eventName) throw new Error("cardId y eventName son requeridos");
    if (!META_BUSINESS_MESSAGING_EVENTS.includes(d.eventName)) {
      throw new Error(`Evento Meta CAPI inválido: ${d.eventName}`);
    }
    if (d.value !== undefined && (!Number.isFinite(Number(d.value)) || Number(d.value) < 0)) {
      throw new Error("El valor de la conversión debe ser un número mayor o igual a 0.");
    }
    return d;
  })
  .handler(async ({ context, data }) => {
    const companyId = await resolveCompanyIdCached(context.supabase, context.userId);
    return sendMetaConversionForLead({
      companyId,
      cardId: data.cardId,
      eventName: data.eventName,
      value: data.value,
      triggerSource: "manual_drawer",
    });
  });

export const listMetaCapiLogsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d?: { cardId?: string; limit?: number }) => d || {})
  .handler(async ({ context, data }) => {
    const companyId = await resolveCompanyIdCached(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let query = (supabaseAdmin as any)
      .from("meta_capi_event_log")
      .select("id, card_id, numero, event_name, action_source, messaging_channel, dataset_id, ctwa_clid, value, currency, status, fbtrace_id, error_message, created_at")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(Math.min(Number(data?.limit) || 30, 100));

    if (data?.cardId) {
      query = query.eq("card_id", data.cardId);
    }

    const { data: logs } = await query;
    return (logs || []) as any[];
  });
