// src/lib/meta-capi.server.ts
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const META_CAPI_GRAPH_VERSION = "v25.0";

export const META_BUSINESS_MESSAGING_EVENTS = [
  "LeadSubmitted",
  "QualifiedLead",
  "ViewContent",
  "AddToCart",
  "InitiateCheckout",
  "AppointmentBooked",
  "OrderCreated",
  "OrderShipped",
  "Purchase",
] as const;

export type MetaMessagingEventName = (typeof META_BUSINESS_MESSAGING_EVENTS)[number];

export interface MetaCapiConfig {
  company_id?: string;
  has_access_token?: boolean;
  access_token_masked?: string;
  ativo: boolean;
  modo_conexao: "hibrido" | "waba_official" | "pixel_tradicional";
  moeda_padrao?: string;
  enviar_somente_com_clique?: boolean;
  access_token: string | null;
  waba_id: string | null;
  page_id: string | null;
  instagram_account_id: string | null;
  dataset_id: string | null; // Pixel ID o Dataset ID
  currency: string;
  test_event_code: string | null;
  enable_sha256_fallback: boolean;
  auto_send_on_stage_change: boolean;
  auto_send_on_sale: boolean;
  auto_send_on_appointment: boolean;
}

// Mapa de DDD de Brasil a código UF (Estado) para aumentar el Event Match Quality (EMQ) en Meta CAPI
const BR_DDD_TO_UF: Record<string, string> = {
  "11": "sp", "12": "sp", "13": "sp", "14": "sp", "15": "sp", "16": "sp", "17": "sp", "18": "sp", "19": "sp",
  "21": "rj", "22": "rj", "24": "rj", "27": "es", "28": "es",
  "31": "mg", "32": "mg", "33": "mg", "34": "mg", "35": "mg", "37": "mg", "38": "mg",
  "41": "pr", "42": "pr", "43": "pr", "44": "pr", "45": "pr", "46": "pr",
  "47": "sc", "48": "sc", "49": "sc", "51": "rs", "53": "rs", "54": "rs", "55": "rs",
  "61": "df", "62": "go", "64": "go", "63": "to", "65": "mt", "66": "mt", "67": "ms",
  "68": "ac", "69": "ro", "71": "ba", "73": "ba", "74": "ba", "75": "ba", "77": "ba", "79": "se",
  "81": "pe", "87": "pe", "82": "al", "83": "pb", "84": "rn", "85": "ce", "88": "ce", "86": "pi", "89": "pi",
  "91": "pa", "93": "pa", "94": "pa", "92": "am", "97": "am", "95": "rr", "96": "ap", "98": "ma", "99": "ma",
};

export async function sha256(value: string): Promise<string> {
  const norm = value.trim().toLowerCase();
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const data = new TextEncoder().encode(norm);
    const hashBuf = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(hashBuf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(norm).digest("hex");
}

/**
 * Obtiene la configuración de Meta CAPI de una empresa.
 * Implementación resiliente: lee de meta_capi_config, con fallback a integracao_chave (servico='meta_capi').
 */
export async function getMetaCapiConfig(companyId: string): Promise<MetaCapiConfig> {
  const defaultConfig: MetaCapiConfig = {
    ativo: false,
    modo_conexao: "waba_official",
    access_token: null,
    waba_id: null,
    page_id: null,
    instagram_account_id: null,
    dataset_id: null,
    currency: "USD",
    test_event_code: null,
    enable_sha256_fallback: true,
    auto_send_on_stage_change: true,
    auto_send_on_sale: true,
    auto_send_on_appointment: true,
  };

  try {
    const { data: dedicatedCfg, error } = await (supabaseAdmin as any)
      .from("meta_capi_config")
      .select("*")
      .eq("company_id", companyId)
      .maybeSingle();

    if (!error && dedicatedCfg) {
      return {
        ativo: Boolean(dedicatedCfg.ativo),
        modo_conexao: dedicatedCfg.modo_conexao || "hibrido",
        access_token: dedicatedCfg.access_token || null,
        waba_id: dedicatedCfg.waba_id || null,
        page_id: dedicatedCfg.page_id || null,
        instagram_account_id: dedicatedCfg.instagram_account_id || null,
        dataset_id: dedicatedCfg.dataset_id || null,
        currency: dedicatedCfg.currency || dedicatedCfg.moeda_padrao || "BRL",
        moeda_padrao: dedicatedCfg.currency || dedicatedCfg.moeda_padrao || "BRL",
        enviar_somente_com_clique: Boolean(dedicatedCfg.enviar_somente_com_clique),
        test_event_code: dedicatedCfg.test_event_code || null,
        enable_sha256_fallback: dedicatedCfg.enable_sha256_fallback ?? true,
        auto_send_on_stage_change: dedicatedCfg.auto_send_on_stage_change ?? true,
        auto_send_on_sale: dedicatedCfg.auto_send_on_sale ?? true,
        auto_send_on_appointment: dedicatedCfg.auto_send_on_appointment ?? true,
      };
    }
  } catch {
    // Si la tabla no existe en la base de datos remota, continuar al fallback
  }

  // Fallback a integracao_chave
  try {
    const { data: chaveRow } = await (supabaseAdmin as any)
      .from("integracao_chave")
      .select("credencial, conectado, auto_envio, extra")
      .eq("company_id", companyId)
      .eq("servico", "meta_capi")
      .maybeSingle();

    if (chaveRow) {
      const extra = typeof chaveRow.extra === "object" && chaveRow.extra !== null ? chaveRow.extra : {};
      return {
        ativo: Boolean(chaveRow.conectado),
        modo_conexao: extra.modo_conexao || "hibrido",
        access_token: chaveRow.credencial || null,
        waba_id: extra.waba_id || null,
        page_id: extra.page_id || null,
        instagram_account_id: extra.instagram_account_id || null,
        dataset_id: extra.dataset_id || null,
        currency: extra.currency || extra.moeda_padrao || "BRL",
        moeda_padrao: extra.currency || extra.moeda_padrao || "BRL",
        enviar_somente_com_clique: Boolean(extra.enviar_somente_com_clique),
        test_event_code: extra.test_event_code || null,
        enable_sha256_fallback: extra.enable_sha256_fallback ?? true,
        auto_send_on_stage_change: chaveRow.auto_envio ?? true,
        auto_send_on_sale: extra.auto_send_on_sale ?? true,
        auto_send_on_appointment: extra.auto_send_on_appointment ?? true,
      };
    }
  } catch {
    // best-effort
  }

  return defaultConfig;
}

/**
 * Guarda la configuración de Meta CAPI de una empresa.
 * Escribe en meta_capi_config si existe y sincroniza en integracao_chave.
 */
export async function saveMetaCapiConfig(
  companyId: string,
  cfg: Partial<MetaCapiConfig> & { clear_access_token?: boolean },
): Promise<MetaCapiConfig> {
  const current = await getMetaCapiConfig(companyId);
  const resolvedCurrency = cfg.currency || (cfg as any).moeda_padrao || current.currency || "BRL";

  const rawIncomingToken = cfg.access_token;
  const shouldClearToken = Boolean(cfg.clear_access_token);
  const hasNewToken =
    typeof rawIncomingToken === "string" &&
    rawIncomingToken.trim().length > 0 &&
    !rawIncomingToken.includes("••••");

  const preservedAccessToken = shouldClearToken
    ? null
    : hasNewToken
      ? rawIncomingToken!.trim()
      : current.access_token;

  const updated: MetaCapiConfig = {
    ...current,
    ...cfg,
    company_id: companyId,
    access_token: preservedAccessToken,
    currency: resolvedCurrency,
    moeda_padrao: resolvedCurrency,
  };

  // 1. Intentar guardar en meta_capi_config
  try {
    await (supabaseAdmin as any)
      .from("meta_capi_config")
      .upsert({
        company_id: companyId,
        ativo: updated.ativo,
        modo_conexao: updated.modo_conexao,
        access_token: updated.access_token,
        waba_id: updated.waba_id,
        page_id: updated.page_id,
        instagram_account_id: updated.instagram_account_id,
        dataset_id: updated.dataset_id,
        currency: updated.currency,
        test_event_code: updated.test_event_code,
        enable_sha256_fallback: updated.enable_sha256_fallback,
        auto_send_on_stage_change: updated.auto_send_on_stage_change,
        auto_send_on_sale: updated.auto_send_on_sale,
        auto_send_on_appointment: updated.auto_send_on_appointment,
        updated_at: new Date().toISOString(),
      }, { onConflict: "company_id" });
  } catch {
    // tabla dedicada no existe aún
  }

  // 2. Espejar siempre en integracao_chave
  try {
    const extraPayload = {
      modo_conexao: updated.modo_conexao,
      waba_id: updated.waba_id,
      page_id: updated.page_id,
      instagram_account_id: updated.instagram_account_id,
      dataset_id: updated.dataset_id,
      currency: updated.currency,
      moeda_padrao: updated.currency,
      test_event_code: updated.test_event_code,
      enable_sha256_fallback: updated.enable_sha256_fallback,
      auto_send_on_sale: updated.auto_send_on_sale,
      auto_send_on_appointment: updated.auto_send_on_appointment,
      enviar_somente_com_clique: Boolean(updated.enviar_somente_com_clique),
    };

    const { data: existingChave } = await (supabaseAdmin as any)
      .from("integracao_chave")
      .select("id")
      .eq("company_id", companyId)
      .eq("servico", "meta_capi")
      .maybeSingle();

    if (existingChave?.id) {
      await (supabaseAdmin as any)
        .from("integracao_chave")
        .update({
          credencial: updated.access_token || "",
          conectado: updated.ativo,
          auto_envio: updated.auto_send_on_stage_change,
          extra: extraPayload,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingChave.id);
    } else {
      await (supabaseAdmin as any)
        .from("integracao_chave")
        .insert({
          company_id: companyId,
          servico: "meta_capi",
          credencial: updated.access_token || "",
          conectado: updated.ativo,
          auto_envio: updated.auto_send_on_stage_change,
          extra: extraPayload,
        });
    }
  } catch (err: any) {
    console.warn("[meta-capi.save] Error al sincronizar integracao_chave:", err?.message);
  }

  return updated;
}

export async function buildHashedUserDataFromCard(
  card: any,
  options?: { skipPhoneHash?: boolean },
): Promise<Record<string, any>> {
  const out: Record<string, any> = {};
  const digits = String(card.numero || "").replace(/\D/g, "").replace(/^0+/, "");

  if (!options?.skipPhoneHash && digits.length >= 8 && digits.length <= 15) {
    out.ph = [await sha256(digits)];
    if (digits.startsWith("55") && digits.length >= 12) {
      out.country = [await sha256("br")];
      const ddd = digits.slice(2, 4);
      if (BR_DDD_TO_UF[ddd]) out.st = [await sha256(BR_DDD_TO_UF[ddd])];
    } else if (digits.startsWith("58")) {
      out.country = [await sha256("ve")];
    } else if (digits.startsWith("57")) {
      out.country = [await sha256("co")];
    } else if (digits.startsWith("56")) {
      out.country = [await sha256("cl")];
    } else if (digits.startsWith("51")) {
      out.country = [await sha256("pe")];
    } else if (digits.startsWith("52")) {
      out.country = [await sha256("mx")];
    } else if (digits.startsWith("54")) {
      out.country = [await sha256("ar")];
    } else if (digits.startsWith("34")) {
      out.country = [await sha256("es")];
    } else if (digits.startsWith("1") && digits.length === 11) {
      out.country = [await sha256("us")];
    } else if (digits.startsWith("593")) {
      out.country = [await sha256("ec")];
    } else if (digits.startsWith("507")) {
      out.country = [await sha256("pa")];
    } else if (digits.startsWith("506")) {
      out.country = [await sha256("cr")];
    } else if (digits.startsWith("591")) {
      out.country = [await sha256("bo")];
    } else if (digits.startsWith("598")) {
      out.country = [await sha256("uy")];
    } else if (digits.startsWith("595")) {
      out.country = [await sha256("py")];
    }
  }

  // ctwa_clid se maneja exclusivamente en sendMetaConversionForLead cuando action_source = business_messaging

  if (card.email && String(card.email).includes("@")) {
    out.em = [await sha256(String(card.email))];
  }

  if (card.nome && !/^contato\s+\d+$/i.test(String(card.nome).trim())) {
    const parts = String(card.nome).trim().split(/\s+/);
    if (parts[0]) out.fn = [await sha256(parts[0])];
    if (parts.length > 1) out.ln = [await sha256(parts.slice(1).join(" "))];
  }

  if (card.id) {
    out.external_id = [await sha256(String(card.id))];
  }

  const browserTrack = card.campos_extras?.browser_tracking;
  if (browserTrack?.fbc) {
    out.fbc = browserTrack.fbc;
  } else if (card.fbclid) {
    const ts = card.primeiro_contato_em ? Math.floor(new Date(card.primeiro_contato_em).getTime() / 1000) : Math.floor(Date.now() / 1000);
    out.fbc = `fb.1.${ts}.${String(card.fbclid).trim()}`;
  }

  if (browserTrack?.fbp) out.fbp = browserTrack.fbp;
  if (browserTrack?.client_ip) out.client_ip_address = browserTrack.client_ip;
  if (browserTrack?.client_user_agent) out.client_user_agent = browserTrack.client_user_agent;

  return out;
}

/**
 * Consulta en Meta Graph API los nombres reales de Campaña, Conjunto y Anuncio a partir de source_id.
 */
export async function enrichCardWithMetaAdDetails(
  companyId: string,
  cardId: string,
  sourceAdId: string,
): Promise<void> {
  if (!/^\d{8,25}$/.test(String(sourceAdId).trim())) return;

  const cfg = await getMetaCapiConfig(companyId);
  const token = String(cfg.access_token || "").trim();
  if (!token) return;

  try {
    const url = `https://graph.facebook.com/${META_CAPI_GRAPH_VERSION}/${encodeURIComponent(sourceAdId)}?fields=name,adset{id,name},campaign{id,name}&access_token=${encodeURIComponent(token)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return;

    const adInfo: any = await res.json().catch(() => null);
    if (!res.ok || !adInfo || adInfo.error) {
      await (supabaseAdmin as any)
        .from("crm_cards")
        .update({
          utm_source: "meta_ads",
          canal_entrada: "ads_meta",
          utm_campaign: sourceAdId,
        })
        .eq("id", cardId)
        .is("canal_entrada", null);
      return;
    }

    const patch: Record<string, any> = {
      utm_source: "meta_ads",
      canal_entrada: "ads_meta",
    };
    if (adInfo.campaign?.name) {
      patch.utm_campaign = String(adInfo.campaign.name).slice(0, 250);
      patch.origem = `Meta Ads: ${String(adInfo.campaign.name).slice(0, 120)}`;
    }
    if (adInfo.adset?.name) patch.utm_medium = String(adInfo.adset.name).slice(0, 250);
    if (adInfo.name) patch.utm_content = String(adInfo.name).slice(0, 250);

    const { data: current } = await (supabaseAdmin as any)
      .from("crm_cards")
      .select("campos_extras")
      .eq("id", cardId)
      .maybeSingle();

    const prevExtras = current?.campos_extras && typeof current.campos_extras === "object" ? current.campos_extras : {};
    patch.campos_extras = {
      ...prevExtras,
      ad_referral: {
        ...(prevExtras.ad_referral || {}),
        source_id: sourceAdId,
        ad_id: sourceAdId,
        ad_name: adInfo.name || null,
        adset_id: adInfo.adset?.id || null,
        adset_name: adInfo.adset?.name || null,
        campaign_id: adInfo.campaign?.id || null,
        campaign_name: adInfo.campaign?.name || null,
      },
    };

    await (supabaseAdmin as any).from("crm_cards").update(patch).eq("id", cardId);
  } catch (err: any) {
    console.warn("[enrichCardWithMetaAdDetails] Error:", err?.message);
  }
}

export interface SendConversionInput {
  companyId: string;
  cardId: string;
  eventName: MetaMessagingEventName | string;
  value?: number | null;
  currency?: string | null;
  customData?: Record<string, any>;
  dedupKey?: string;
  testEventCodeOverride?: string | null;
  forceSend?: boolean;
  triggerSource?: string;
}

export interface SendConversionResult {
  ok: boolean;
  status: "sent" | "failed" | "skipped";
  fbtraceId?: string | null;
  eventsReceived?: number;
  error?: string | null;
}

export async function discoverOrCreateMetaDataset(
  param1: { nodeId?: string | null; accessToken: string } | string,
  param2?: string | null,
): Promise<{ datasetId: string | null; error?: string | null }> {
  const token = typeof param1 === "string" ? param1 : param1.accessToken;
  const nodeId = typeof param1 === "string" ? param2 : param1.nodeId;

  if (!token) return { datasetId: null, error: "Access Token ausente." };

  try {
    if (nodeId) {
      const cleanNode = String(nodeId).trim();
      const dsRes = await fetch(
        `https://graph.facebook.com/${META_CAPI_GRAPH_VERSION}/${encodeURIComponent(cleanNode)}?fields=id,name,dataset{id,name}&access_token=${encodeURIComponent(token)}`,
        { signal: AbortSignal.timeout(10_000) },
      ).catch(() => null);
      if (dsRes && dsRes.ok) {
        const dsJson: any = await dsRes.json().catch(() => null);
        if (dsJson?.dataset?.id) {
          return { datasetId: String(dsJson.dataset.id) };
        }
      }
    }

    const meRes = await fetch(
      `https://graph.facebook.com/${META_CAPI_GRAPH_VERSION}/me/adaccounts?fields=id,name,datasets{id,name}&access_token=${encodeURIComponent(token)}`,
      { signal: AbortSignal.timeout(10_000) },
    );
    if (meRes.ok) {
      const data: any = await meRes.json().catch(() => null);
      for (const acc of data?.data || []) {
        const firstDs = acc.datasets?.data?.[0]?.id;
        if (firstDs) return { datasetId: String(firstDs) };
      }
    }
  } catch (e: any) {
    console.warn("[discoverOrCreateMetaDataset] Fallback de autodescubrimiento falló:", e?.message);
    return { datasetId: null, error: e?.message || "Error al autodescubrir Dataset." };
  }
  return { datasetId: null, error: "No se encontró ningún Dataset o Pixel vinculado a esta cuenta." };
}

/**
 * Motor Dual de Envío de Conversiones Meta CAPI.
 * Soporta Modo WABA Oficial (Business Messaging) y Modo QR No Oficial (Pixel Tradicional).
 */
export async function sendMetaConversionForLead(input: SendConversionInput): Promise<SendConversionResult> {
  const { companyId, cardId, eventName, value, currency } = input;

  const cfg = await getMetaCapiConfig(companyId);
  if (!cfg.ativo || !cfg.access_token) {
    return { ok: false, status: "skipped", error: "Meta CAPI no está activo o falta Access Token." };
  }

  // 1. Obtener datos frescos del lead
  const { data: card, error: cardErr } = await (supabaseAdmin as any)
    .from("crm_cards")
    .select("*")
    .eq("id", cardId)
    .eq("company_id", companyId)
    .maybeSingle();

  if (cardErr || !card) {
    return { ok: false, status: "failed", error: "Lead no encontrado en la empresa." };
  }

  if (cfg.enviar_somente_com_clique && !input.forceSend) {
    const hasClickAttribution = Boolean(
      card.ctwa_clid ||
        card.fbclid ||
        card.gclid ||
        card.meta_lead_id ||
        card.utm_source ||
        card.utm_campaign ||
        card.campos_extras?.ad_referral ||
        card.campos_extras?.browser_tracking?.fbc,
    );
    if (!hasClickAttribution) {
      return {
        ok: false,
        status: "skipped",
        error: "Lead orgánico omitido por configuración (enviar_somente_com_clique).",
      };
    }
  }

  // Deduplicación estricta
  const dedupKey = input.dedupKey || `${card.id}_${eventName}_${Math.floor(Date.now() / (1000 * 60 * 30))}`;
  try {
    const { data: existingLog } = await (supabaseAdmin as any)
      .from("meta_capi_event_log")
      .select("id, status")
      .eq("company_id", companyId)
      .eq("dedup_key", dedupKey)
      .maybeSingle();

    if (existingLog && existingLog.status === "sent") {
      return { ok: true, status: "skipped", error: "Evento ya enviado previamente (dedup_key)." };
    }
  } catch {
    // Si la tabla no existe aún, continuar
  }

  // Resolver dataset_id (Pixel ID) o WABA ID
  let targetDatasetId = cfg.dataset_id?.trim() || "";
  let targetWabaId = cfg.waba_id?.trim() || "";

  // Si no hay waba_id o dataset_id en config, buscar en whatsapp_instances
  if (!targetWabaId || !targetDatasetId) {
    const { data: inst } = await (supabaseAdmin as any)
      .from("whatsapp_instances")
      .select("waba_id, meta_dataset_id, provider")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (inst) {
      if (!targetWabaId && inst.waba_id) targetWabaId = inst.waba_id;
      if (!targetDatasetId && inst.meta_dataset_id) targetDatasetId = inst.meta_dataset_id;
    }
  }

  if (!targetDatasetId && targetWabaId && cfg.access_token) {
    const discovered = await discoverOrCreateMetaDataset({
      nodeId: targetWabaId,
      accessToken: cfg.access_token,
    });
    if (discovered.datasetId) {
      targetDatasetId = discovered.datasetId;
      await saveMetaCapiConfig(companyId, { dataset_id: targetDatasetId });
    }
  }
  const endpointId = targetDatasetId;
  if (!endpointId) {
    return { ok: false, status: "failed", error: "No hay Dataset ID o Pixel ID válido configurado para enviar eventos de CAPI a Meta." };
  }

  const nowEpoch = Math.floor(Date.now() / 1000);
  const eventCurrency = currency || cfg.currency || "USD";
  const finalValue = value ?? (card.valor ? Number(card.valor) : null);

  // Mapear modo
  const isOfficialWaba =
    (cfg.modo_conexao === "waba_official" || cfg.modo_conexao === "hibrido") &&
    Boolean(targetWabaId && (card.ctwa_clid || card.campos_extras?.ad_referral?.ctwa_clid));
  const isMetaLeadAd = Boolean(card.meta_lead_id);
  const isInstagramOrMessenger = card.canal_chat === "instagram" || card.canal_chat === "messenger";

  let actionSource: string = "system_generated";
  let messagingChannel: string | undefined = undefined;
  const userData: Record<string, any> = {};

  if (isOfficialWaba) {
    // Modo 1: WABA Oficial (Business Messaging CAPI)
    actionSource = "business_messaging";
    messagingChannel = "whatsapp";
    userData.whatsapp_business_account_id = targetWabaId;
    const resolvedCtwaClid = String(card.ctwa_clid || card.campos_extras?.ad_referral?.ctwa_clid || "").trim();
    userData.ctwa_clid = resolvedCtwaClid;

    if (cfg.enable_sha256_fallback) {
      const hashed = await buildHashedUserDataFromCard(card);
      Object.assign(userData, hashed);
    }
  } else if (isInstagramOrMessenger) {
    // Modo 2: Instagram Direct o Messenger
    actionSource = "business_messaging";
    messagingChannel = card.canal_chat;
    const hashed = await buildHashedUserDataFromCard(card);
    delete hashed.ph;
    Object.assign(userData, hashed);
    if (card.canal_chat === "instagram") {
      userData.ig_sid = card.numero;
      if (cfg.instagram_account_id) {
        userData.instagram_business_account_id = cfg.instagram_account_id;
      }
    } else if (card.canal_chat === "messenger") {
      userData.page_scoped_user_id = card.numero;
      if (cfg.page_id) {
        userData.page_id = cfg.page_id;
      }
    }
  } else if (isMetaLeadAd) {
    // Modo 3: Meta Lead Ads
    actionSource = "system_generated";
    userData.lead_id = Number(card.meta_lead_id);
    const hashed = await buildHashedUserDataFromCard(card);
    Object.assign(userData, hashed);
  } else {
    // Modo 4: QR No Oficial (dapi) / Píxel Tradicional
    actionSource = card.fbclid ? "website" : "system_generated";
    const hashed = await buildHashedUserDataFromCard(card);
    Object.assign(userData, hashed);
    const resolvedCtwaClid = String(card.ctwa_clid || card.campos_extras?.ad_referral?.ctwa_clid || "").trim();
    if (resolvedCtwaClid) {
      userData.ctwa_clid = resolvedCtwaClid;
    }
  }

  // Traducción de nombre de evento si se usa action_source = website
  let resolvedEventName = eventName;
  if (actionSource === "website") {
    if (eventName === "LeadSubmitted" || eventName === "QualifiedLead") resolvedEventName = "Lead";
    if (eventName === "AppointmentBooked") resolvedEventName = "Schedule";
  }

  const customDataPayload: Record<string, any> = {
    currency: eventCurrency,
    event_source: "crm",
    lead_event_source: "Capiconversa CRM",
    ...(input.customData || {}),
  };
  if (finalValue !== null && finalValue !== undefined) {
    customDataPayload.value = Number(finalValue);
  }
  if (card.item_nome) {
    customDataPayload.content_name = card.item_nome;
  }
  if (card.utm_campaign) {
    customDataPayload.campaign_name = card.utm_campaign;
  }

  const singleEvent: Record<string, any> = {
    event_name: resolvedEventName,
    event_time: nowEpoch,
    action_source: actionSource,
    user_data: userData,
    custom_data: customDataPayload,
    event_id: dedupKey,
  };
  if (card.first_page || card.referrer) {
    singleEvent.event_source_url = card.first_page || card.referrer;
  }

  if (messagingChannel) {
    singleEvent.messaging_channel = messagingChannel;
  }

  const requestBody: Record<string, any> = {
    data: [singleEvent],
    access_token: cfg.access_token,
  };

  const activeTestCode = input.testEventCodeOverride !== undefined ? input.testEventCodeOverride : cfg.test_event_code;
  if (activeTestCode?.trim()) {
    requestBody.test_event_code = activeTestCode.trim();
  }

  let resultStatus: "sent" | "failed" = "failed";
  let fbtraceId: string | null = null;
  let responseData: any = null;
  let errorMsg: string | null = null;

  try {
    const postUrl = `https://graph.facebook.com/${META_CAPI_GRAPH_VERSION}/${encodeURIComponent(endpointId)}/events`;
    const res = await fetch(postUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(15_000),
    });

    responseData = await res.json().catch(() => null);
    fbtraceId = responseData?.fbtrace_id || res.headers.get("x-fb-trace-id") || null;

    if (!res.ok || responseData?.error) {
      errorMsg = responseData?.error?.message || `HTTP ${res.status}: ${JSON.stringify(responseData)}`;
      resultStatus = "failed";
    } else {
      resultStatus = "sent";
    }
  } catch (netErr: any) {
    errorMsg = netErr?.message || "Error de red al conectar con Meta Graph API";
    resultStatus = "failed";
  }

  // Guardar log de auditoría
  try {
    await (supabaseAdmin as any).from("meta_capi_event_log").insert({
      company_id: companyId,
      card_id: card.id,
      dedup_key: dedupKey,
      event_name: resolvedEventName,
      action_source: actionSource,
      messaging_channel: messagingChannel || null,
      dataset_id: endpointId,
      ctwa_clid: card.ctwa_clid || null,
      value: finalValue,
      currency: eventCurrency,
      status: resultStatus,
      fbtrace_id: fbtraceId,
      error_message: errorMsg,
      request_payload: singleEvent,
      response_payload: responseData,
    });
  } catch {
    // Si la tabla no existe, guardar en lead_evento como fallback
    try {
      await (supabaseAdmin as any).from("lead_evento").insert({
        company_id: companyId,
        card_id: card.id,
        tipo: "meta_capi",
        descricao: `Meta CAPI [${resolvedEventName}] -> ${resultStatus === "sent" ? "Enviado con éxito" : `Fallo: ${errorMsg?.slice(0, 100)}`}`,
      });
    } catch {
      // best-effort
    }
  }

  return {
    ok: resultStatus === "sent",
    status: resultStatus,
    fbtraceId,
    eventsReceived: responseData?.events_received || (resultStatus === "sent" ? 1 : 0),
    error: errorMsg,
  };
}


export async function sendSyntheticMetaTestEvent(params: {
  companyId: string;
  accessToken: string;
  datasetId: string;
  testEventCode?: string | null;
  currency?: string;
}): Promise<SendConversionResult> {
  const nowEpoch = Math.floor(Date.now() / 1000);
  const singleEvent: Record<string, any> = {
    event_name: "Lead",
    event_time: nowEpoch,
    action_source: "system_generated",
    event_id: `synth_test_${nowEpoch}`,
    user_data: {
      ph: [await sha256("5511999999999")],
      em: [await sha256("test@capiconversa.com")],
      external_id: [await sha256(params.companyId)],
    },
    custom_data: {
      currency: params.currency || "BRL",
      value: 1,
      content_name: "CapiConversa Test Ping",
    },
  };

  const requestBody: Record<string, any> = {
    data: [singleEvent],
    access_token: params.accessToken,
  };
  if (params.testEventCode?.trim()) {
    requestBody.test_event_code = params.testEventCode.trim();
  }

  try {
    const postUrl = `https://graph.facebook.com/${META_CAPI_GRAPH_VERSION}/${encodeURIComponent(params.datasetId)}/events`;
    const res = await fetch(postUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(15_000),
    });
    const responseData: any = await res.json().catch(() => null);
    const fbtraceId = responseData?.fbtrace_id || res.headers.get("x-fb-trace-id") || null;
    if (!res.ok || responseData?.error) {
      return {
        ok: false,
        status: "failed",
        fbtraceId,
        error: responseData?.error?.message || `HTTP ${res.status}`,
      };
    }
    return {
      ok: true,
      status: "sent",
      fbtraceId,
      eventsReceived: responseData?.events_received || 1,
    };
  } catch (err: any) {
    return {
      ok: false,
      status: "failed",
      error: err?.message || "Error de red al conectar con Meta Graph API",
    };
  }
}
