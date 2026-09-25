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

/** Extrai UTMs/clids da primeira mensagem (ex: wa.me/...?text=... com querystring). */
export function extractTrackingFromText(text: string | null | undefined): TrackingFields {
  const out = emptyTracking();
  if (!text) return out;
  const decoded = safeDecode(text);
  for (const k of KEYS) {
    const m = decoded.match(new RegExp(`[?&#\\s]${k}=([^\\s&#]+)`, "i"));
    if (m) (out as any)[k] = safeDecode(m[1]).slice(0, 200);
  }
  return out;
}

/** Extrai ctwa_clid do payload da Evolution/Uazapi (Click-to-WhatsApp Meta Ads). */
export function extractCtwaFromPayload(payload: any): string | null {
  try {
    const msg = payload?.data?.message ?? payload?.message ?? payload?.data ?? {};
    const ctx = msg?.contextInfo ?? msg?.extendedTextMessage?.contextInfo ?? msg?.imageMessage?.contextInfo;
    return (
      ctx?.externalAdReply?.ctwaClid ||
      ctx?.ctwaClid ||
      msg?.ctwaClid ||
      payload?.data?.ctwaClid ||
      null
    );
  } catch { return null; }
}

export type AdContext = {
  sourceUrl: string | null;
  sourceId: string | null;
  title: string | null;
  body: string | null;
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
 * A primeira mensagem do lead traz `externalAdReply` com o link e o título do anúncio.
 */
export function extractAdContext(payload: any): AdContext | null {
  const ad = deepFind(payload, "externalAdReply");
  const ctwaClid = extractCtwaFromPayload(payload) || deepFind(payload, "ctwaClid") || null;
  if (!ad && !ctwaClid) return null;
  const clean = (v: any) => {
    const s = String(v ?? "").trim();
    return s ? s.slice(0, 500) : null;
  };
  return {
    sourceUrl: clean(ad?.sourceUrl || ad?.source_url || ad?.sourceURL),
    sourceId: clean(ad?.sourceId || ad?.source_id),
    title: clean(ad?.title),
    body: clean(ad?.body),
    ctwaClid: clean(ctwaClid),
  };
}

export function deriveCanal(t: TrackingFields, hasCtwa: boolean): CanalEntrada {
  if (hasCtwa || t.ctwa_clid) return "ads_meta";
  if (t.gclid) return "ads_google";
  if (t.utm_source || t.utm_campaign || t.utm_medium) return "wa_link_utm";
  return "whatsapp_direto";
}

function safeDecode(s: string): string {
  try { return decodeURIComponent(s); } catch { return s; }
}

export const CANAL_LABEL: Record<CanalEntrada, string> = {
  whatsapp_direto: "WhatsApp",
  wa_link_utm: "Link com UTM",
  ads_meta: "Anúncio Meta",
  ads_google: "Anúncio Google",
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
  whatsapp_direto: "#25D366",
  wa_link_utm: "#0B22FE",
  ads_meta: "#1877F2",
  ads_google: "#EA4335",
  formulario: "#8B5CF6",
  organico: "#8AA89A",
  instagram: "#E1306C",
  facebook: "#1877F2",
  telegram: "#229ED9",
  site: "#0EA5E9",
  indicacao: "#F59E0B",
  telefone: "#64748B",
  presencial: "#14B8A6",
  outro: "#94A3B8",
};

/** Canais disponíveis para cadastro manual de lead. */
export const CANAIS_MANUAIS: CanalEntrada[] = [
  "whatsapp_direto", "instagram", "facebook", "telegram", "site",
  "formulario", "indicacao", "telefone", "presencial", "ads_meta", "ads_google", "outro",
];
