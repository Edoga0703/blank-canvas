// Utilitários puros para extrair rastreio a partir de textos/payloads.

export type TrackingFields = {
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_term: string | null;
  utm_content: string | null;
  gclid: string | null;
  fbclid: string | null;
  ctwa_clid: string | null;
  referrer: string | null;
  first_page: string | null;
  canal_entrada: CanalEntrada | null;
};

export type CanalEntrada =
  | "whatsapp_direto"
  | "wa_link_utm"
  | "ads_meta"
  | "ads_google"
  | "formulario"
  | "organico"
  | "instagram"
  | "facebook"
  | "telegram"
  | "site"
  | "indicacao"
  | "telefone"
  | "presencial"
  | "outro";

const KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid", "fbclid", "ctwa_clid"] as const;

export function emptyTracking(): TrackingFields {
  return {
    utm_source: null, utm_medium: null, utm_campaign: null, utm_term: null, utm_content: null,
    gclid: null, fbclid: null, ctwa_clid: null, referrer: null, first_page: null, canal_entrada: null,
  };
}

/** Extrai UTMs/clids da primeira mensagem (ex: wa.me/...?text=... com querystring, ou texto no formato UTM). */
export function extractTrackingFromText(text: string | null | undefined): TrackingFields {
  const out = emptyTracking();
  if (!text) return out;
  const decoded = safeDecode(text);
  for (const k of KEYS) {
    const m = decoded.match(new RegExp(`(?:^|[?&#\\s:\\[])${k}[=:\\s]+([^\\s&#,\\]]+)`, "i"));
    if (m) (out as any)[k] = safeDecode(m[1]).slice(0, 200);
  }
  return out;
}

/**
 * Extrae el código de protocolo de un link rastreable.
 * Soporta variantes como: "[Ref: #A1B2C]", "Ref: A1B2C", "#A1B2C", "Protocolo: A1B2C", "Cod: A1B2C", "ref=A1B2C".
 */
export function extractTrackingProtocolCode(text: string | null | undefined): string | null {
  if (!text) return null;
  const m = text.match(/(?:(?:ref|protocolo|c[oó]d(?:igo)?|id)[:\s=#-]*#?|#)([A-Z0-9]{5,8})\b/i);
  return m ? m[1].toUpperCase() : null;
}

/** Extrai ctwa_clid do payload da D-API (Oficial / QR) ou Meta Cloud API (Click-to-WhatsApp Meta Ads). */
export function extractCtwaFromPayload(payload: any): string | null {
  try {
    const data = payload?.data ?? payload ?? {};
    const msg = data?.message ?? data?.messages?.[0] ?? data ?? {};
    const ctx =
      data?.contextInfo ??
      msg?.contextInfo ??
      msg?.extendedTextMessage?.contextInfo ??
      msg?.imageMessage?.contextInfo ??
      msg?.videoMessage?.contextInfo;
    const referral =
      data?.referral ??
      msg?.referral ??
      payload?.referral ??
      payload?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.referral;

    const direct =
      referral?.ctwa_clid ||
      referral?.ctwaClid ||
      ctx?.externalAdReply?.ctwaClid ||
      ctx?.externalAdReply?.ctwa_clid ||
      ctx?.ctwaClid ||
      ctx?.ctwa_clid ||
      data?.ctwa_clid ||
      data?.ctwaClid ||
      msg?.ctwaClid ||
      msg?.ctwa_clid ||
      deepFind(payload, "ctwaClid") ||
      deepFind(payload, "ctwa_clid") ||
      null;

    if (direct) return String(direct).trim();

    // Buscar en sourceUrl o source_url si venía como parámetro
    const sourceUrl =
      ctx?.externalAdReply?.sourceUrl ||
      ctx?.externalAdReply?.source_url ||
      referral?.source_url ||
      referral?.sourceUrl ||
      null;
    if (sourceUrl && typeof sourceUrl === "string") {
      const match = sourceUrl.match(/[?&](?:ctwa_clid|ctwaclid)=([^&#\s]+)/i);
      if (match) return safeDecode(match[1]).trim();
    }

    return null;
  } catch { return null; }
}

export type AdContext = {
  sourceUrl: string | null;
  sourceId: string | null;
  title: string | null;
  body: string | null;
  thumbnailUrl: string | null;
  ctwaClid: string | null;
};

function deepFind(obj: any, key: string, depth = 0): any {
  if (!obj || typeof obj !== "object" || depth > 8) return null;
  if (obj[key]) return obj[key];
  for (const k of Object.keys(obj)) {
    const r = deepFind(obj[k], key, depth + 1);
    if (r) return r;
  }
  return null;
}

/**
 * Contexto do anúncio de campanhas Click-to-WhatsApp (Meta).
 * Suporta tanto D-API QR (externalAdReply) quanto D-API Oficial / Meta Cloud API (referral),
 * y Meta Webhook de Instagram Direct y Messenger.
 */
export function extractAdContext(payload: any): AdContext | null {
  const data = payload?.data ?? payload ?? {};
  const msg = data?.message ?? data?.messages?.[0] ?? data ?? {};
  const ctx =
    data?.contextInfo ??
    msg?.contextInfo ??
    msg?.extendedTextMessage?.contextInfo ??
    msg?.imageMessage?.contextInfo ??
    msg?.videoMessage?.contextInfo;

  const ad =
    data?.externalAdReply ||
    ctx?.externalAdReply ||
    data?.referral ||
    msg?.referral ||
    payload?.referral ||
    deepFind(payload, "externalAdReply") ||
    deepFind(payload, "referral") ||
    deepFind(payload, "ads_context_data");

  const ctwaClid = extractCtwaFromPayload(payload);
  if (!ad && !ctwaClid) return null;

  const clean = (v: any) => {
    const s = String(v ?? "").trim();
    return s ? s.slice(0, 500) : null;
  };

  const title = clean(
    ad?.title ||
    ad?.headline ||
    ad?.name ||
    ad?.ads_context_data?.ad_title ||
    ad?.ad_title
  );

  const sourceId = clean(
    ad?.sourceId ||
    ad?.source_id ||
    ad?.ad_id ||
    ad?.campaign_id
  );

  const sourceUrl = clean(
    ad?.sourceUrl ||
    ad?.source_url ||
    ad?.sourceURL ||
    ad?.url
  );

  const body = clean(
    ad?.body ||
    ad?.description ||
    ad?.ads_context_data?.ad_body
  );

  const thumbnailUrl = clean(
    ad?.thumbnailUrl ||
    ad?.thumbnail_url ||
    ad?.image_url ||
    ad?.media_url ||
    ad?.mediaUrl ||
    ad?.ads_context_data?.photo_url ||
    ad?.ads_context_data?.video_url
  );

  return {
    sourceUrl,
    sourceId,
    title,
    body,
    thumbnailUrl,
    ctwaClid: clean(ctwaClid),
  };
}

export function deriveCanal(t: TrackingFields, hasCtwa: boolean): CanalEntrada {
  if (hasCtwa || t.ctwa_clid) return "ads_meta";
  if (t.gclid) return "ads_google";
  if (t.utm_source || t.utm_campaign || t.utm_medium) {
    const s = String(t.utm_source || "").toLowerCase();
    if (s.includes("facebook") || s.includes("instagram") || s.includes("meta") || s.includes("fb_ads")) return "ads_meta";
    if (s.includes("google") || s.includes("gads") || s.includes("adwords")) return "ads_google";
    return "wa_link_utm";
  }
  return "whatsapp_direto";
}

function safeDecode(s: string): string {
  try { return decodeURIComponent(s); } catch { return s; }
}

export const CANAL_LABEL: Record<CanalEntrada, string> = {
  whatsapp_direto: "WhatsApp",
  wa_link_utm: "Link WhatsApp",
  ads_meta: "Meta Ads",
  ads_google: "Google Ads",
  formulario: "Formulário",
  organico: "Orgânico",
  instagram: "Instagram",
  facebook: "Facebook",
  telegram: "Telegram",
  site: "Site",
  indicacao: "Indicação",
  telefone: "Telefone",
  presencial: "Presencial",
  outro: "Outro",
};

export const CANAL_COLOR: Record<CanalEntrada, string> = {
  whatsapp_direto: "#22c55e",
  wa_link_utm: "#06b6d4",
  ads_meta: "#3b82f6",
  ads_google: "#f59e0b",
  formulario: "#8b5cf6",
  organico: "#10b981",
  instagram: "#ec4899",
  facebook: "#2563eb",
  telegram: "#0284c7",
  site: "#6366f1",
  indicacao: "#14b8a6",
  telefone: "#f97316",
  presencial: "#84cc16",
  outro: "#64748b",
};

/** Canais disponíveis para cadastro manual de lead. */
export const CANAIS_MANUAIS: CanalEntrada[] = [
  "whatsapp_direto", "instagram", "facebook", "telegram", "site",
  "formulario", "indicacao", "telefone", "presencial", "ads_meta", "ads_google", "outro",
];
