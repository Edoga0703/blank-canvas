/**
 * Cliente servidor para D-API WhatsApp (https://docs.d-api.cloud/whatsapp/introducao) — v1.1.14.
 * Proveedor unificado para WhatsApp No Oficial (QR / Pairing Code) y Oficial SaaS (Meta Cloud API).
 */

const DEFAULT_BASE_URL = "https://api.d-api.cloud/api/v1";

function getBaseUrl(): string {
  const url = process.env.DAPI_BASE_URL || DEFAULT_BASE_URL;
  return url.replace(/\/+$/, "");
}

function getApiKey(): string {
  const key = process.env.DAPI_API_KEY || "";
  if (!key) {
    console.warn("[dapi.server] DAPI_API_KEY no configurada en las variables de entorno.");
  }
  return key;
}

function getHeaders(): Record<string, string> {
  const key = getApiKey();
  return {
    "Authorization": key,
    "Content-Type": "application/json",
    "User-Agent": "Capiconversa-CRM/1.1.13",
  };
}

async function dapiFetch<T = any>(
  endpoint: string,
  options: RequestInit = {},
  timeoutMs = 15_000,
): Promise<T> {
  const baseUrl = getBaseUrl();
  const url = `${baseUrl}${endpoint.startsWith("/") ? "" : "/"}${endpoint}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      ...options,
      headers: {
        ...getHeaders(),
        ...(options.headers || {}),
      },
      signal: controller.signal,
    });

    const text = await res.text();
    let data: any = null;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { raw: text };
    }

    if (!res.ok) {
      const errMsg = data?.message || data?.error || `D-API error ${res.status}: ${text.slice(0, 200)}`;
      throw new Error(errMsg);
    }

    return data as T;
  } finally {
    clearTimeout(timer);
  }
}

export interface DapiCreateSessionParams {
  sessionId: string;
  type?: "unofficial" | "cloud_api";
  connectionMode?: "qr" | "pair" | "pairing";
  webhookUrl?: string;
  phoneNumber?: string;
  pairPhone?: string;
}

export interface DapiSessionStatus {
  success: boolean;
  status: "connected" | "connecting" | "disconnected" | "logged_out" | string;
  qrcode?: string | null;
  numero?: string | null;
  raw?: any;
}

/**
 * Crea una nueva sesión en D-API para un tenant/instancia.
 * Soporta connectionMode "qr" o "pair" (con pairPhone).
 */
export async function dapiCreateSession(params: DapiCreateSessionParams): Promise<{
  success: boolean;
  sessionId: string;
  qrcode?: string | null;
  status?: string;
}> {
  const mode = params.connectionMode === "pairing" ? "pair" : (params.connectionMode || "qr");
  const cleanPhone = (params.pairPhone || params.phoneNumber || "").replace(/\D/g, "");

  const body: Record<string, any> = {
    sessionId: params.sessionId,
    type: params.type || "unofficial",
    connectionMode: mode,
  };
  if (params.webhookUrl) {
    body.webhookUrl = params.webhookUrl;
  }
  if (cleanPhone) {
    body.phoneNumber = cleanPhone;
    body.pairPhone = cleanPhone;
  }

  const res = await dapiFetch<any>("/sessions", {
    method: "POST",
    body: JSON.stringify(body),
  });

  return {
    success: res?.success ?? true,
    sessionId: params.sessionId,
    qrcode: res?.qrcode || res?.qrCodeImage || null,
    status: res?.status || "connecting",
  };
}

/**
 * Obtiene el QR Code actual de una sesión.
 * Consulta primero la ruta canónica GET /sessions/{sessionId}/qr y usa /qr-code como fallback.
 * Normaliza a formato data URI base64 para renderizar directo en <img src={qr} />.
 */
export async function dapiGetQr(sessionId: string): Promise<{
  success: boolean;
  qrcode: string | null;
  status: string;
}> {
  try {
    const res = await dapiFetch<any>(`/sessions/${encodeURIComponent(sessionId)}/qr`);
    let qrcode = res?.qrcode || res?.qrCodeImage || res?.data?.qrcode || null;
    if (qrcode && !qrcode.startsWith("data:") && !qrcode.startsWith("http")) {
      qrcode = `data:image/png;base64,${qrcode}`;
    }
    return {
      success: res?.success ?? true,
      qrcode,
      status: res?.status || "connecting",
    };
  } catch {
    try {
      const alt = await dapiFetch<any>(`/sessions/${encodeURIComponent(sessionId)}/qr-code`);
      let qrcode = alt?.qrcode || alt?.qrCodeImage || alt?.data?.qrcode || null;
      if (qrcode && !qrcode.startsWith("data:") && !qrcode.startsWith("http")) {
        qrcode = `data:image/png;base64,${qrcode}`;
      }
      return { success: true, qrcode, status: alt?.status || "connecting" };
    } catch {
      return { success: false, qrcode: null, status: "error" };
    }
  }
}

/**
 * Genera u obtiene el código de emparejamiento de 8 dígitos para WhatsApp.
 * Soporta consulta directa GET /sessions/{sessionId}/pair-code y POST /sessions/{sessionId}/pairing-code.
 */
export async function dapiGetPairingCode(
  sessionId: string,
  phoneNumber?: string,
): Promise<{ success: boolean; code: string }> {
  const cleanPhone = (phoneNumber || "").replace(/\D/g, "");

  // 1. Intento GET /sessions/{sessionId}/pair-code (sesión creada en modo pair)
  try {
    const getRes = await dapiFetch<any>(`/sessions/${encodeURIComponent(sessionId)}/pair-code`);
    const code = getRes?.code || getRes?.pairCode || getRes?.pairingCode || getRes?.data?.code || "";
    if (code) {
      return { success: true, code };
    }
  } catch {
    // Continuar a fallback
  }

  // 2. Fallback POST /sessions/{sessionId}/pairing-code
  try {
    const res = await dapiFetch<any>(`/sessions/${encodeURIComponent(sessionId)}/pairing-code`, {
      method: "POST",
      body: JSON.stringify({ phoneNumber: cleanPhone, pairPhone: cleanPhone }),
    });

    const code = res?.code || res?.pairingCode || res?.pairCode || res?.data?.code || "";
    return {
      success: !!code,
      code,
    };
  } catch {
    return {
      success: false,
      code: "",
    };
  }
}

/**
 * Configura o actualiza la URL del webhook de una sesión en D-API sin reiniciar el contenedor.
 * Envía enabled: true y webhookUrl según contrato de /sessions/{sessionId}/webhook-config.
 */
export async function dapiSetWebhookConfig(
  sessionId: string,
  webhookUrl: string,
): Promise<{ success: boolean; raw?: any }> {
  try {
    const res = await dapiFetch<any>(`/sessions/${encodeURIComponent(sessionId)}/webhook-config`, {
      method: "POST",
      body: JSON.stringify({
        enabled: true,
        webhookUrl,
      }),
    }).catch(() => {
      return dapiFetch<any>(`/sessions/${encodeURIComponent(sessionId)}/webhook`, {
        method: "PUT",
        body: JSON.stringify({ enabled: true, webhookUrl }),
      });
    });
    return { success: res?.success ?? true, raw: res };
  } catch (err: any) {
    console.warn(`[dapi.server] Advertencia al configurar webhook para sesión ${sessionId}:`, err?.message);
    return { success: false, raw: err?.message };
  }
}

/**
 * Conecta una cuenta oficial de Meta Cloud API (API Oficial para SaaS).
 * Soporta tanto sesiones creadas/vinculadas por Popup Hospedado (postMessage)
 * como creación directa en POST /sessions con type: "cloud_api".
 */
export async function dapiCreateOfficialConnection(params: {
  sessionId: string;
  wabaId?: string;
  phoneNumberId?: string;
  accessToken?: string;
  webhookUrl?: string;
}): Promise<{ success: boolean; sessionId: string; status: string }> {
  const body: Record<string, any> = {
    sessionId: params.sessionId,
    type: "cloud_api",
  };
  if (params.wabaId) body.wabaId = params.wabaId;
  if (params.phoneNumberId) body.phoneNumberId = params.phoneNumberId;
  if (params.accessToken) body.accessToken = params.accessToken;
  if (params.webhookUrl) body.webhookUrl = params.webhookUrl;

  // Si la sesión ya fue creada por el Popup Hospedado de D-API, sincronizamos su webhook
  if (!params.accessToken && params.webhookUrl) {
    await dapiSetWebhookConfig(params.sessionId, params.webhookUrl).catch(() => null);
    const st = await dapiGetStatus(params.sessionId).catch(() => null);
    if (st?.success) {
      return {
        success: true,
        sessionId: params.sessionId,
        status: st.status || "connected",
      };
    }
  }

  const res = await dapiFetch<any>("/sessions", {
    method: "POST",
    body: JSON.stringify(body),
  }).catch(() => {
    return dapiFetch<any>("/official/connections", {
      method: "POST",
      body: JSON.stringify(body),
    });
  });

  if (params.webhookUrl) {
    await dapiSetWebhookConfig(params.sessionId, params.webhookUrl).catch(() => null);
  }

  return {
    success: res?.success ?? true,
    sessionId: params.sessionId,
    status: res?.status || "connected",
  };
}

/**
 * Consulta el estado actual de la sesión.
 * Usa GET /sessions/{sessionId}/status con fallback a GET /sessions/{sessionId}.
 */
export async function dapiGetStatus(sessionId: string): Promise<DapiSessionStatus> {
  try {
    const res = await dapiFetch<any>(`/sessions/${encodeURIComponent(sessionId)}/status`).catch(() => {
      return dapiFetch<any>(`/sessions/${encodeURIComponent(sessionId)}`);
    });
    const payload = res?.data || res;
    let qrcode = payload?.qrcode || payload?.qrCodeImage || res?.qrcode || res?.qrCodeImage || null;
    if (qrcode && !qrcode.startsWith("data:") && !qrcode.startsWith("http")) {
      qrcode = `data:image/png;base64,${qrcode}`;
    }
    return {
      success: true,
      status: payload?.status || res?.status || (payload?.connected || res?.connected ? "connected" : "disconnected"),
      qrcode,
      numero: payload?.numero || payload?.phoneNumber || payload?.phone || res?.numero || res?.phoneNumber || null,
      raw: res,
    };
  } catch (err: any) {
    return {
      success: false,
      status: "disconnected",
      raw: err?.message,
    };
  }
}

/**
 * Reinicia una sesión en D-API.
 */
export async function dapiRestartSession(sessionId: string): Promise<boolean> {
  const res = await dapiFetch<any>(`/sessions/${encodeURIComponent(sessionId)}/restart`, {
    method: "POST",
  });
  return res?.success ?? true;
}

/**
 * Elimina o desconecta una sesión de D-API.
 */
export async function dapiDeleteSession(sessionId: string): Promise<boolean> {
  const res = await dapiFetch<any>(`/sessions/${encodeURIComponent(sessionId)}`, {
    method: "DELETE",
  });
  return res?.success ?? true;
}

/**
 * Envío de texto con soporte a cita (quoted).
 */
export async function dapiSendText(
  sessionId: string,
  to: string,
  text: string,
  quotedMessageId?: string | null,
): Promise<{ id: string; provider: string; raw: any }> {
  const cleanTo = to.replace(/\D/g, "");
  const payload: Record<string, any> = {
    sessionId,
    to: cleanTo,
    text,
    message: text,
  };
  if (quotedMessageId) {
    payload.quotedMessageId = quotedMessageId;
  }

  const res = await dapiFetch<any>("/messages/send/text", {
    method: "POST",
    body: JSON.stringify(payload),
  }).catch(() => {
    return dapiFetch<any>("/messages/text", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  });

  const id = res?.id || res?.messageId || res?.data?.id || `dapi_${Date.now()}`;
  return { id, provider: "dapi", raw: res };
}

/**
 * Envío de multimedia (imagen, video, audio ptt o documento).
 * Soporta tanto la convención /messages/send/{type} como /messages/{type}
 * y envía propiedades compatibles (image + imageUrl, audio + audioUrl, etc.).
 */
export async function dapiSendMedia(
  sessionId: string,
  to: string,
  media: {
    url: string;
    type: "image" | "video" | "audio" | "document";
    caption?: string;
    fileName?: string;
    mime?: string;
    ptt?: boolean;
  },
): Promise<{ id: string; provider: string; raw: any }> {
  const cleanTo = to.replace(/\D/g, "");

  let primaryEndpoint = "/messages/send/image";
  let fallbackEndpoint = "/messages/image";
  const body: Record<string, any> = {
    sessionId,
    to: cleanTo,
  };

  if (media.type === "image") {
    primaryEndpoint = "/messages/send/image";
    fallbackEndpoint = "/messages/image";
    body.image = media.url;
    body.imageUrl = media.url;
    if (media.caption) body.caption = media.caption;
  } else if (media.type === "audio") {
    primaryEndpoint = "/messages/send/audio";
    fallbackEndpoint = "/messages/audio";
    body.audio = media.url;
    body.audioUrl = media.url;
    body.ptt = media.ptt ?? true;
  } else if (media.type === "video") {
    primaryEndpoint = "/messages/send/video";
    fallbackEndpoint = "/messages/video";
    body.video = media.url;
    body.videoUrl = media.url;
    if (media.caption) body.caption = media.caption;
  } else {
    primaryEndpoint = "/messages/send/document";
    fallbackEndpoint = "/messages/document";
    body.document = media.url;
    body.documentUrl = media.url;
    if (media.fileName) {
      body.fileName = media.fileName;
      body.filename = media.fileName;
    }
    if (media.mime) body.mimetype = media.mime;
    if (media.caption) body.caption = media.caption;
  }

  const res = await dapiFetch<any>(primaryEndpoint, {
    method: "POST",
    body: JSON.stringify(body),
  }).catch(() => {
    return dapiFetch<any>(fallbackEndpoint, {
      method: "POST",
      body: JSON.stringify(body),
    });
  });

  const id = res?.id || res?.messageId || res?.data?.id || `dapi_${Date.now()}`;
  return { id, provider: "dapi", raw: res };
}

/**
 * Envío directo de audio (PTT voice note).
 */
export async function dapiSendAudio(
  sessionId: string,
  to: string,
  audioBase64OrUrl: string,
): Promise<{ id: string; provider: string; raw: any }> {
  return dapiSendMedia(sessionId, to, {
    url: audioBase64OrUrl,
    type: "audio",
    ptt: true,
  });
}

/**
 * Envío de plantillas oficiales de Meta (HSM).
 */
export async function dapiSendTemplate(
  sessionId: string,
  to: string,
  template: {
    name: string;
    language: string;
    components?: any[];
  },
): Promise<{ id: string; provider: string; raw: any }> {
  const cleanTo = to.replace(/\D/g, "");
  const payload = {
    sessionId,
    to: cleanTo,
    templateName: template.name,
    name: template.name,
    language: template.language,
    components: template.components || [],
  };

  const res = await dapiFetch<any>("/messages/send/template", {
    method: "POST",
    body: JSON.stringify(payload),
  }).catch(() => {
    return dapiFetch<any>("/messages/template", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  });

  const id = res?.id || res?.messageId || res?.data?.id || `dapi_${Date.now()}`;
  return { id, provider: "dapi", raw: res };
}

/**
 * Lista las plantillas HSM de una sesión oficial en D-API.
 */
/**
 * Crea y envía para aprobación una plantilla HSM en una sesión oficial de D-API / Meta Cloud API.
 */
export async function dapiCreateTemplate(
  sessionId: string,
  template: {
    name: string;
    category: string;
    language: string;
    components: any[];
  },
): Promise<{ success: boolean; id?: string | null; status?: string; error?: string; raw?: any }> {
  try {
    const payload = {
      sessionId,
      name: template.name,
      category: template.category,
      language: template.language,
      components: template.components,
    };
    const res = await dapiFetch<any>(`/sessions/${encodeURIComponent(sessionId)}/templates`, {
      method: "POST",
      body: JSON.stringify(payload),
    }).catch(() => {
      return dapiFetch<any>(`/templates`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
    });
    const id = res?.id || res?.templateId || res?.data?.id || null;
    const status = res?.status || res?.data?.status || "PENDING";
    return { success: true, id, status, raw: res };
  } catch (err: any) {
    return { success: false, error: err?.message || "Error al enviar plantilla a D-API" };
  }
}

export async function dapiListTemplates(sessionId: string): Promise<any[]> {
  try {
    const res = await dapiFetch<any>(`/sessions/${encodeURIComponent(sessionId)}/templates`).catch(() => {
      return dapiFetch<any>(`/templates?sessionId=${encodeURIComponent(sessionId)}`);
    });
    if (Array.isArray(res)) return res;
    if (Array.isArray(res?.data)) return res.data;
    if (Array.isArray(res?.templates)) return res.templates;
    return [];
  } catch {
    return [];
  }
}

export interface DapiMediaDownloadMeta {
  direct_path?: string | null;
  media_key?: string | null;
  mimetype?: string | null;
  url?: string | null;
}

/**
 * Descarga el contenido multimedia de un mensaje recibido en base64.
 * Incluye direct_path, media_key y mimetype del evento cuando están presentes,
 * conforme al contrato POST /api/v1/media/download de D-API.
 */
export async function dapiDownloadMedia(
  sessionId: string,
  messageId: string,
  mediaMeta?: DapiMediaDownloadMeta,
): Promise<{ base64?: string; mimetype?: string; media_url?: string } | null> {
  try {
    const payload: Record<string, any> = {
      sessionId,
      messageId,
      base64: true,
    };
    if (mediaMeta?.direct_path) payload.direct_path = mediaMeta.direct_path;
    if (mediaMeta?.media_key) payload.media_key = mediaMeta.media_key;
    if (mediaMeta?.mimetype) payload.mimetype = mediaMeta.mimetype;
    if (mediaMeta?.url) payload.url = mediaMeta.url;

    const res = await dapiFetch<any>("/media/download", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return {
      base64: res?.base64 || res?.data || null,
      mimetype: res?.mimetype || res?.mime || mediaMeta?.mimetype || null,
      media_url: res?.media_url || res?.url || null,
    };
  } catch (err: any) {
    console.warn("[dapi.server] Error descargando multimedia:", err?.message);
    return null;
  }
}
