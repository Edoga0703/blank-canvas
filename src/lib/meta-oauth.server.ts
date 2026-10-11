// Facebook Login for Business — embedded signup.
// Server-only: troca o `code` por token de longa duração e descobre Páginas/contas IG.
const GRAPH = "https://graph.facebook.com/v25.0";

export const META_OAUTH_CALLBACK_PATH = "/api/public/meta-oauth/callback";

const PLATFORM_HOST_SUFFIXES = [".lovable.app", ".lovableproject.com"];

function configuredOrigins() {
  return String(process.env["META_ALLOWED_ORIGINS"] || process.env["PUBLIC_APP_URL"] || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .flatMap((value) => {
      try {
        return [new URL(value).origin];
      } catch {
        return [];
      }
    });
}

/** Só aceita origens conhecidas do próprio app (evita open redirect / redirect_uri forjado). */
export function sanitizeOrigin(raw: string | null | undefined): string {
  if (!raw) return "https://capiconversa.com";
  try {
    let clean = raw.trim();
    if (!clean.startsWith("http://") && !clean.startsWith("https://")) {
      clean = `https://${clean}`;
    }
    const url = new URL(clean);
    const loopback = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
    const host = url.hostname.toLowerCase();

    // Se é capiconversa.com ou subdomínio
    if (host === "capiconversa.com" || host.endsWith(".capiconversa.com")) {
      return `https://${host}`;
    }

    // Se é plataforma Lovable
    if (PLATFORM_HOST_SUFFIXES.some((s) => host === s.replace(/^\./, "") || host.endsWith(s))) {
      return `https://${host}`;
    }

    if (loopback) {
      return url.origin;
    }

    const allOrigins = [
      ...configuredOrigins(),
      ...(cachedMetaConfig?.allowedOrigins || []),
      "https://capiconversa.com",
      "https://www.capiconversa.com",
    ];

    if (allOrigins.includes(url.origin)) {
      return url.origin;
    }

    return "https://capiconversa.com";
  } catch {
    return "https://capiconversa.com";
  }
}

let cachedMetaConfig: {
  appId: string;
  appSecret: string;
  appSecretInstagram: string;
  webhookVerifyToken: string;
  publicAppUrl: string;
  allowedOrigins: string[];
  loadedAt: number;
} | null = null;

export async function ensureMetaSecrets() {
  if (cachedMetaConfig && Date.now() - cachedMetaConfig.loadedAt < 30_000) {
    return cachedMetaConfig;
  }

  let envAppId = (process.env["META_APP_ID"] || "").trim();
  let envAppSecret = (process.env["META_APP_SECRET"] || "").trim();
  let envAppSecretIg = (process.env["META_APP_SECRET_INSTAGRAM"] || "").trim();
  let envWebhookToken = (process.env["META_WEBHOOK_VERIFY_TOKEN"] || "").trim();
  let envPublicUrl = (process.env["PUBLIC_APP_URL"] || "").trim();
  let envOrigins = (process.env["META_ALLOWED_ORIGINS"] || "").trim();

  // Se faltam dados no environment, busca em master_settings do Supabase
  if (!envAppId || !envAppSecret) {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data } = await (supabaseAdmin as any)
        .from("master_settings")
        .select("value")
        .eq("key", "meta_channels_config")
        .maybeSingle();

      if (data?.value) {
        const v = data.value;
        if (!envAppId && v.app_id) envAppId = String(v.app_id).trim();
        if (!envAppSecret && v.app_secret) envAppSecret = String(v.app_secret).trim();
        if (!envAppSecretIg && v.app_secret_instagram) envAppSecretIg = String(v.app_secret_instagram).trim();
        if (!envWebhookToken && v.webhook_verify_token) envWebhookToken = String(v.webhook_verify_token).trim();
        if (!envPublicUrl && v.public_app_url) envPublicUrl = String(v.public_app_url).trim();
        if (!envOrigins && v.allowed_origins) envOrigins = String(v.allowed_origins).trim();
      }
    } catch (e) {
      console.warn("[meta-oauth] erro ao carregar master_settings:", e);
    }
  }

  const publicUrl = envPublicUrl || "https://capiconversa.com";
  const origins = [
    publicUrl,
    "https://capiconversa.com",
    "https://www.capiconversa.com",
    ...(envOrigins ? envOrigins.split(",").map((s) => s.trim()).filter(Boolean) : []),
  ];

  cachedMetaConfig = {
    appId: envAppId,
    appSecret: envAppSecret,
    appSecretInstagram: envAppSecretIg,
    webhookVerifyToken: envWebhookToken || "capiconversa_meta_verify_2026",
    publicAppUrl: publicUrl,
    allowedOrigins: origins,
    loadedAt: Date.now(),
  };
  return cachedMetaConfig;
}

function secret() {
  const value = process.env["META_APP_SECRET"] || cachedMetaConfig?.appSecret;
  if (!value) throw new Error("META_APP_SECRET não configurado (nem no .env nem em master_settings).");
  return value;
}

function appId() {
  const value = process.env["META_APP_ID"] || cachedMetaConfig?.appId;
  if (!value) throw new Error("META_APP_ID não configurado (nem no .env nem em master_settings).");
  return value;
}

function b64url(bytes: Uint8Array) {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(value: string) {
  const pad = value.replace(/-/g, "+").replace(/_/g, "/");
  return atob(pad + "=".repeat((4 - (pad.length % 4)) % 4));
}

async function hmac(payload: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return b64url(new Uint8Array(sig));
}

export type MetaOAuthState = {
  c: string; // companyId
  u: string; // userId
  n: string; // nonce (handle da sessão)
  o: string; // origin
  t: number; // criado em (ms)
};

export async function signState(state: MetaOAuthState) {
  await ensureMetaSecrets();
  const payload = b64url(new TextEncoder().encode(JSON.stringify(state)));
  return `${payload}.${await hmac(payload)}`;
}

export async function verifyState(raw: string): Promise<MetaOAuthState | null> {
  await ensureMetaSecrets();
  const [payload, sig] = raw.split(".");
  if (!payload || !sig) return null;
  if ((await hmac(payload)) !== sig) return null;
  try {
    const state = JSON.parse(fromB64url(payload)) as MetaOAuthState;
    if (!state?.c || !state?.u || !state?.n || !state?.o) return null;
    if (Date.now() - Number(state.t || 0) > 15 * 60_000) return null;
    return state;
  } catch {
    return null;
  }
}

const SCOPES = [
  "pages_show_list",
  "pages_messaging",
  "pages_manage_metadata",
  "pages_read_engagement",
  "pages_read_user_content",
  "pages_manage_engagement",
  "pages_manage_posts",
  "read_insights",
  "instagram_basic",
  "instagram_manage_messages",
  "instagram_content_publish",
  "instagram_manage_comments",
  "instagram_manage_insights",
  "business_management",
  "leads_retrieval",
  "ads_read",
  "ads_management",
];

/** Monta a URL do diálogo de login da Meta. Usa config_id quando o app já tem uma configuração Login for Business. */
export function buildAuthUrl(origin: string, state: string) {
  const configId = process.env["META_LOGIN_CONFIG_ID"];
  const url = new URL("https://www.facebook.com/v25.0/dialog/oauth");
  url.searchParams.set("client_id", appId());
  // Garante que a redirect_uri enviada para a Meta use exatamente a origin sanitizada do state
  const callbackUrl = new URL(META_OAUTH_CALLBACK_PATH, origin).toString();
  url.searchParams.set("redirect_uri", callbackUrl);
  url.searchParams.set("state", state);
  url.searchParams.set("response_type", "code");
  if (configId) {
    url.searchParams.set("config_id", configId);
    url.searchParams.set("override_default_response_type", "true");
  } else {
    url.searchParams.set("scope", SCOPES.join(","));
  }
  return url.toString();
}

async function graphGet(path: string) {
  const res = await fetch(`${GRAPH}${path}`, { signal: AbortSignal.timeout(20_000) });
  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* noop */ }
  if (!res.ok) throw new Error(json?.error?.message || text || res.statusText);
  return json;
}

/** code -> user token -> token de longa duração (60 dias). */
export async function exchangeCodeForLongLivedToken(code: string, origin: string) {
  await ensureMetaSecrets();
  const callbackUrl = new URL(META_OAUTH_CALLBACK_PATH, origin).toString();
  const short = await graphGet(
    `/oauth/access_token?client_id=${encodeURIComponent(appId())}` +
      `&client_secret=${encodeURIComponent(secret())}` +
      `&redirect_uri=${encodeURIComponent(callbackUrl)}` +
      `&code=${encodeURIComponent(code)}`,
  );
  const shortToken = String(short?.access_token ?? "");
  if (!shortToken) throw new Error("A Meta não retornou o token de acesso.");

  const long = await graphGet(
    `/oauth/access_token?grant_type=fb_exchange_token` +
      `&client_id=${encodeURIComponent(appId())}` +
      `&client_secret=${encodeURIComponent(secret())}` +
      `&fb_exchange_token=${encodeURIComponent(shortToken)}`,
  );
  return String(long?.access_token || shortToken);
}

export type MetaTarget = {
  pageId: string;
  pageName: string | null;
  pagePicture: string | null;
  pageToken: string;
  igId: string | null;
  igUsername: string | null;
  igPicture: string | null;
};

/** Lista Páginas do usuário + conta Instagram profissional vinculada a cada uma. */
export async function discoverTargets(userToken: string): Promise<MetaTarget[]> {
  const json = await graphGet(
    `/me/accounts?fields=id,name,access_token,picture{url},instagram_business_account{id,username,profile_picture_url}&limit=100` +
      `&access_token=${encodeURIComponent(userToken)}`,
  );
  return (json?.data ?? []).map((p: any) => ({
    pageId: String(p.id),
    pageName: (p.name || null) as string | null,
    pagePicture: p.picture?.data?.url || null,
    pageToken: String(p.access_token || ""),
    igId: p.instagram_business_account?.id ? String(p.instagram_business_account.id) : null,
    igUsername: (p.instagram_business_account?.username || null) as string | null,
    igPicture: p.instagram_business_account?.profile_picture_url || null,
  }));
}

/** Verifica se um Page Access Token continua válido. */
export async function isTokenValid(token: string) {
  try {
    await graphGet(`/me?fields=id&access_token=${encodeURIComponent(token)}`);
    return true;
  } catch {
    return false;
  }
}
