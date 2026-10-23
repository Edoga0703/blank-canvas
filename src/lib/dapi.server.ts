/**
 * Cliente servidor para D-API WhatsApp (https://docs.d-api.cloud/whatsapp/introducao).
 * Proveedor unificado para WhatsApp No Oficial (QR / Pairing Code) y Oficial (Meta Cloud API).
 */

const DEFAULT_BASE_URL = "https://api.d-api.cloud/api/v1";

function getBaseUrl(): string {
  let url = process.env.DAPI_BASE_URL || DEFAULT_BASE_URL;
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
    "User-Agent": "Capiconversa-CRM/1.1.9",
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
  connectionMode?: "qr" | "pairing";
  webhookUrl?: string;
  phoneNumber?: string;
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
 */
export async function dapiCreateSession(params: DapiCreateSessionParams): Promise<{
  success: boolean;
  sessionId: string;
  qrcode?: string | null;
  status?: string;
}> {
  const body: Record<string, any> = {
    sessionId: params.sessionId,
    type: params.type || "unofficial",
    connectionMode: params.connectionMode || "qr",
  };
  if (params.webhookUrl) {
    body.webhookUrl = params.webhookUrl;
  }
  if (params.phoneNumber) {
    body.phoneNumber = params.phoneNumber.replace(/\D/g, "");
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
 * Normaliza a formato data URI base64 para renderizar directo en <img src={qr} />.
 */
export async function dapiGetQr(sessionId: string): Promise<{
  success: boolean;
  qrcode: string | null;
  status: string;
}> {
  try {
    const res = await dapiFetch<any>(`/sessions/${encodeURIComponent(sessionId)}/qr-code`);
    let qrcode = res?.qrcode || res?.qrCodeImage || res?.data?.qrcode || null;
    if (qrcode && !qrcode.startsWith("data:") && !qrcode.startsWith("http")) {
      qrcode = `data:image/png;base64,${qrcode}`;
    }
    return {
      success: res?.success ?? true,
      qrcode,
      status: res?.status || "connecting",
    };
  } catch (err: any) {
    // Fallback alternativo a /sessions/{sessionId}/qr
    try {
      const alt = await dapiFetch<any>(`/sessions/${encodeURIComponent(sessionId)}/qr`);
      let qrcode = alt?.qrcode || alt?.qrCodeImage || null;
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
 * Genera el código de emparejamiento de 8 dígitos para WhatsApp.
 */
export async function dapiGetPairingCode(
  sessionId: string,
  phoneNumber: string,
): Promise<{ success: boolean; code: string }> {
  const cleanPhone = phoneNumber.replace(/\D/g, "");
  const res = await dapiFetch<any>(`/sessions/${encodeURIComponent(sessionId)}/pairing-code`, {
    method: "POST",
    body: JSON.stringify({ phoneNumber: cleanPhone }),
  });

  const code = res?.code || res?.pairingCode || res?.data?.code || "";
  return {
    success: !!code,
    code,
  };
}

/**
 * Conecta una cuenta oficial de Meta Cloud API.
 */
export async function dapiCreateOfficialConnection(params: {
  sessionId: string;
  wabaId: string;
  phoneNumberId: string;
  accessToken: string;
  webhookUrl?: string;
}): Promise<{ success: boolean; sessionId: string; status: string }> {
  const body: Record<string, any> = {
    sessionId: params.sessionId,
    type: "cloud_api",
    wabaId: params.wabaId,
    phoneNumberId: params.phoneNumberId,
    accessToken: params.accessToken,
  };
  if (params.webhookUrl) body.webhookUrl = params.webhookUrl;

  const res = await dapiFetch<any>("/official/connections", {
    method: "POST",
    body: JSON.stringify(body),
  }).catch(() => {
    // Si no existe /official/connections, intenta /sessions con type: cloud_api
    return dapiFetch<any>("/sessions", {
      method: "POST",
      body: JSON.stringify(body),
    });
  });

  return {
    success: res?.success ?? true,
    sessionId: params.sessionId,
    status: res?.status || "connected",
  };
}

/**
 * Consulta el estado actual de la sesión.
 */
export async function dapiGetStatus(sessionId: string): Promise<DapiSessionStatus> {
  try {
    const res = await dapiFetch<any>(`/sessions/${encodeURIComponent(sessionId)}/status`);
    let qrcode = res?.qrcode || res?.qrCodeImage || null;
    if (qrcode && !qrcode.startsWith("data:") && !qrcode.startsWith("http")) {
      qrcode = `data:image/png;base64,${qrcode}`;
    }
    return {
      success: true,
      status: res?.status || (res?.connected ? "connected" : "disconnected"),
      qrcode,
      numero: res?.numero || res?.phoneNumber || res?.phone || null,
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
    // Fallback a /messages/text
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

  let endpoint = "/messages/send/image";
  const body: Record<string, any> = {
    sessionId,
    to: cleanTo,
  };

  if (media.type === "image") {
    endpoint = "/messages/send/image";
    body.image = media.url;
    if (media.caption) body.caption = media.caption;
  } else if (media.type === "audio") {
    endpoint = "/messages/send/audio";
    body.audio = media.url;
    body.ptt = media.ptt ?? true; // Voice note por defecto para IA
  } else if (media.type === "video") {
    endpoint = "/messages/send/video";
    body.video = media.url;
    if (media.caption) body.caption = media.caption;
  } else {
    endpoint = "/messages/send/document";
    body.document = media.url;
    if (media.fileName) body.fileName = media.fileName;
    if (media.mime) body.mimetype = media.mime;
    if (media.caption) body.caption = media.caption;
  }

  const res = await dapiFetch<any>(endpoint, {
    method: "POST",
    body: JSON.stringify(body),
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
 * Descarga el contenido multimedia de un mensaje recibido en base64 o buffer.
 */
export async function dapiDownloadMedia(
  sessionId: string,
  messageId: string,
): Promise<{ base64?: string; mimetype?: string } | null> {
  try {
    const res = await dapiFetch<any>("/media/download", {
      method: "POST",
      body: JSON.stringify({ sessionId, messageId, base64: true }),
    });
    return {
      base64: res?.base64 || res?.data || null,
      mimetype: res?.mimetype || res?.mime || null,
    };
  } catch (err: any) {
    console.warn("[dapi.server] Error descargando multimedia:", err?.message);
    return null;
  }
}
