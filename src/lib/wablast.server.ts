// Server-only helper for WaBlast (WhatsApp API oficial via BSP).
// Docs: https://wablastmessage.com/docs/
// Auth: Bearer wak_...
// Base: https://api.wablastmessage.com
// A API key é POR USUÁRIO WaBlast (resolve o dono e escopa queries). Armazenamos
// a chave por instância (whatsapp_instances.instance_token) para suportar
// multi-tenant. Fallback opcional em WABLAST_API_KEY (global).

const WABLAST_BASE = (
  process.env.WABLAST_API_URL || "https://api.wablastmessage.com"
).replace(/\/+$/, "");

function ensureKey(apiKey?: string | null): string {
  const k = (apiKey || process.env.WABLAST_API_KEY || "").trim();
  if (!k) throw new Error("WaBlast: API key ausente. Configure a chave (wak_...) na conexão.");
  if (!k.startsWith("wak_")) throw new Error("WaBlast: chave inválida (deve começar com 'wak_').");
  return k;
}

function normalizeE164(n: string) {
  const digits = String(n || "").replace(/\D/g, "");
  return "+" + digits;
}

async function wablastFetch(
  path: string,
  apiKey: string,
  init: RequestInit = {},
): Promise<any> {
  const res = await fetch(`${WABLAST_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!res.ok) {
    const code = (body && body.code) || null;
    const msg = (body && (body.error || body.message || body.code)) || `HTTP ${res.status}`;
    const err: any = new Error(String(msg));
    err.status = res.status;
    err.code = code;
    err.details = body;
    throw err;
  }
  return body;
}

// ---------- Partner Onboarding ----------
// Chave (WABLAST_API_KEY) é MINHA (revenda). Endpoints /v1/onboarding/* JAMAIS
// devem ser chamados do navegador. Sempre por server function.

export type OnboardingSession = {
  id: string;
  session_token: string;
  embed_url: string;
  expires_at: string;
  external_ref: string;
};

export type OnboardingStatus = {
  id: string;
  status: "PENDING" | "CONSUMED" | "FAILED" | "EXPIRED";
  external_ref?: string | null;
  waba_id?: string | null;
  phone_number?: string | null;
  display_name?: string | null;
  failure_reason?: string | null;
};

export async function wablastRegisterDomain(domain: string): Promise<any> {
  return wablastFetch("/v1/onboarding/domains", ensureKey(null), {
    method: "POST",
    body: JSON.stringify({ domain }),
  });
}

export async function wablastCreateOnboardingSession(input: {
  externalRef: string;
  redirectUri: string;
}): Promise<OnboardingSession> {
  return wablastFetch("/v1/onboarding/sessions", ensureKey(null), {
    method: "POST",
    body: JSON.stringify({
      external_ref: input.externalRef,
      redirect_uri: input.redirectUri,
    }),
  });
}

export async function wablastGetOnboardingSession(id: string): Promise<OnboardingStatus> {
  return wablastFetch(
    `/v1/onboarding/sessions/${encodeURIComponent(id)}`,
    ensureKey(null),
    { method: "GET" },
  );
}

export type WablastSendResponse = {
  id: string;
  meta_message_id?: string;
  to?: string;
  status?: string;
};

// ---------- Messages ----------

export async function wablastSendText(
  apiKey: string | null,
  accountId: string | null,
  to: string,
  text: string,
): Promise<WablastSendResponse> {
  const body: any = {
    to: normalizeE164(to),
    type: "text",
    text: { body: text },
  };
  if (accountId) body.account_id = accountId;
  return wablastFetch("/v1/messages", ensureKey(apiKey), {
    method: "POST",
    headers: { "Idempotency-Key": crypto.randomUUID() },
    body: JSON.stringify(body),
  });
}

export async function wablastSendMedia(
  apiKey: string | null,
  accountId: string | null,
  to: string,
  media: {
    url: string;
    type: "image" | "video" | "document" | "audio";
    caption?: string;
    fileName?: string;
    mime?: string;
  },
): Promise<WablastSendResponse> {
  // WaBlast exige upload prévio → media_id. Baixa a URL e envia como multipart.
  const mediaId = await wablastUploadMediaFromUrl(
    apiKey,
    accountId,
    media.url,
    media.mime,
    media.fileName,
  );
  const mediaField: any = { id: mediaId };
  if (media.caption && (media.type === "image" || media.type === "video" || media.type === "document")) {
    mediaField.caption = media.caption;
  }
  if (media.fileName && media.type === "document") {
    mediaField.filename = media.fileName;
  }
  const body: any = {
    to: normalizeE164(to),
    type: media.type,
    media: mediaField,
  };
  if (accountId) body.account_id = accountId;
  return wablastFetch("/v1/messages", ensureKey(apiKey), {
    method: "POST",
    headers: { "Idempotency-Key": crypto.randomUUID() },
    body: JSON.stringify(body),
  });
}

export async function wablastSendTemplate(
  apiKey: string | null,
  accountId: string | null,
  to: string,
  templateName: string,
  language: string,
  components?: any[],
): Promise<WablastSendResponse> {
  const body: any = {
    to: normalizeE164(to),
    type: "template",
    template: {
      name: templateName,
      language,
      components: components ?? [],
    },
  };
  if (accountId) body.account_id = accountId;
  return wablastFetch("/v1/messages", ensureKey(apiKey), {
    method: "POST",
    headers: { "Idempotency-Key": crypto.randomUUID() },
    body: JSON.stringify(body),
  });
}

export async function wablastGetMessage(
  apiKey: string | null,
  id: string,
): Promise<any> {
  return wablastFetch(`/v1/messages/${encodeURIComponent(id)}`, ensureKey(apiKey));
}

// ---------- Media upload ----------

export async function wablastUploadMediaFromUrl(
  apiKey: string | null,
  accountId: string | null,
  url: string,
  mime?: string | null,
  fileName?: string | null,
): Promise<string> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Falha ao baixar mídia (${r.status})`);
  const contentType = r.headers.get("content-type") || mime || "application/octet-stream";
  const buf = new Uint8Array(await r.arrayBuffer());
  const name = fileName || url.split("/").pop()?.split("?")[0] || "file.bin";

  const form = new FormData();
  form.append("file", new Blob([buf], { type: contentType }), name);

  const qs = accountId ? `?account_id=${encodeURIComponent(accountId)}` : "";
  const res = await fetch(`${WABLAST_BASE}/v1/media${qs}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ensureKey(apiKey)}`,
      "Idempotency-Key": crypto.randomUUID(),
    },
    body: form,
  });
  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  if (!res.ok) {
    const msg = (json && (json.error || json.message)) || `HTTP ${res.status}`;
    throw new Error(`WaBlast media upload: ${msg}`);
  }
  const mediaId = json?.media_id || json?.id;
  if (!mediaId) throw new Error("WaBlast: resposta de upload sem media_id");
  return String(mediaId);
}

// ---------- Templates ----------

export async function wablastListTemplates(
  apiKey: string | null,
  accountId?: string | null,
): Promise<any> {
  const qs = accountId ? `?account_id=${encodeURIComponent(accountId)}` : "";
  return wablastFetch(`/v1/templates${qs}`, ensureKey(apiKey), { method: "GET" });
}

// ---------- Webhook signature (Standard Webhooks) ----------

export type WablastWebhookHeaders = {
  id: string | null;
  timestamp: string | null;
  signature: string | null;
};

export function readWablastWebhookHeaders(req: Request): WablastWebhookHeaders {
  return {
    id: req.headers.get("webhook-id"),
    timestamp: req.headers.get("webhook-timestamp"),
    signature: req.headers.get("webhook-signature"),
  };
}

/**
 * Verifica assinatura Standard Webhooks da WaBlast.
 * secret = process.env.WABLAST_WEBHOOK_SECRET no formato "whsec_<base64>".
 * signature header = "v1,<base64>" (pode conter múltiplas versões separadas por espaço).
 */
export function verifyWablastSignature(
  rawBody: string,
  headers: WablastWebhookHeaders,
): boolean {
  const secret = process.env.WABLAST_WEBHOOK_SECRET;
  if (!secret || !secret.startsWith("whsec_")) return false;
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature) return false;

  // Anti-replay ±5min
  const tsNum = Number(timestamp);
  if (!Number.isFinite(tsNum)) return false;
  const nowSec = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSec - tsNum) > 300) return false;

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { createHmac, timingSafeEqual } =
    require("node:crypto") as typeof import("node:crypto");

  const secretBytes = Buffer.from(secret.slice(7), "base64");
  const signed = `${id}.${timestamp}.${rawBody}`;
  const expected = createHmac("sha256", secretBytes).update(signed).digest("base64");

  // Header pode ter várias assinaturas ("v1,a v1,b"). Aceita se qualquer bater.
  const parts = signature.split(/\s+/);
  for (const p of parts) {
    const [ver, sig] = p.split(",");
    if (ver !== "v1" || !sig) continue;
    try {
      const a = Buffer.from(sig, "base64");
      const b = Buffer.from(expected, "base64");
      if (a.length === b.length && timingSafeEqual(a, b)) return true;
    } catch { /* try next */ }
  }
  return false;
}
