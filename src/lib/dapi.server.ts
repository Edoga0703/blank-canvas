/**
 * Cliente servidor para D-API WhatsApp (https://docs.d-api.cloud/whatsapp/introducao) — v1.1.14.
 * Proveedor unificado para WhatsApp No Oficial (QR / Pairing Code) y Oficial SaaS (Meta Cloud API).
 */

const DEFAULT_BASE_URL = "https://api.d-api.cloud/api/v1";

function getBaseUrl(): string {
  const url = process.env.DAPI_BASE_URL || DEFAULT_BASE_URL;
  return url.replace(/\/+$/, "");
}

const DEFAULT_DAPI_API_KEY = "098aeda184429bc8201ba60d88116821906397caa5fd5b935b615318a245da03";

function getApiKey(customKey?: string | null): string {
  const key = (customKey || process.env.DAPI_API_KEY || DEFAULT_DAPI_API_KEY || "").trim();
  return key || DEFAULT_DAPI_API_KEY;
}

function getHeaders(customKey?: string | null): Record<string, string> {
  const key = getApiKey(customKey);
  return {
    "Authorization": key,
    "Content-Type": "application/json",
    "User-Agent": "Capiconversa-CRM/1.2.06",
  };
}

async function dapiFetch<T = any>(
  endpoint: string,
  options: RequestInit = {},
  timeoutMs = 15_000,
  customKey?: string | null,
): Promise<T> {
  const baseUrl = getBaseUrl();
  const url = `${baseUrl}${endpoint.startsWith("/") ? "" : "/"}${endpoint}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      ...options,
      headers: {
        ...getHeaders(customKey),
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
 * Normaliza cualquier salida de QR de D-API a un Data URI base64 válido (data:image/png;base64,...)
 * para que el navegador SIEMPRE pueda renderizarlo dentro de <img src={qr} /> sin romperse.
 * Si recibe una URL o cadena raw de WhatsApp (e.g. https://wa.me/settings/linked_devices/... o 2@123...),
 * la convierte a un PNG Data URI usando la biblioteca oficial 'qrcode'.
 */
export async function normalizeQrToDataUrl(raw: string | null | undefined): Promise<string | null> {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;

  // 1. Ya es un data URI de imagen válido
  if (trimmed.startsWith("data:image/")) {
    return trimmed;
  }

  // 2. Es un base64 directo de PNG o JPEG (cabecera típica de PNG iVBORw0KGgo o JPEG /9j/)
  if (trimmed.startsWith("iVBORw0KGgo") || trimmed.startsWith("/9j/")) {
    return `data:image/png;base64,${trimmed}`;
  }

  // 3. Es una URL o string de emparejamiento de WhatsApp (e.g. https://wa.me/... o 2@...)
  try {
    const { default: QRCode } = await import("qrcode");
    const dataUrl = await QRCode.toDataURL(trimmed, {
      margin: 2,
      width: 320,
      color: { dark: "#000000", light: "#ffffff" },
    });
    return dataUrl;
  } catch (err: any) {
    console.warn("[dapi.server] Erro ao converter string QR via lib qrcode:", err?.message);
    return null;
  }
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

  const candidate =
    res?.qrCodeImage ||
    res?.qrcode ||
    res?.qrCode ||
    res?.session?.qrCodeImage ||
    res?.data?.qrCodeImage ||
    null;
  const qrcode = await normalizeQrToDataUrl(candidate);

  return {
    success: res?.success ?? true,
    sessionId: params.sessionId,
    qrcode,
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
    const candidate =
      res?.qrCodeImage ||
      res?.qrcode ||
      res?.qrCode ||
      res?.data?.qrCodeImage ||
      res?.data?.qrcode ||
      null;
    const qrcode = await normalizeQrToDataUrl(candidate);
    return {
      success: !!qrcode,
      qrcode,
      status: res?.status || (qrcode ? "connecting" : "initialising"),
    };
  } catch {
    try {
      const alt = await dapiFetch<any>(`/sessions/${encodeURIComponent(sessionId)}/qr-code`);
      const candidate =
        alt?.qrCodeImage ||
        alt?.qrcode ||
        alt?.qrCode ||
        alt?.data?.qrCodeImage ||
        alt?.data?.qrcode ||
        null;
      const qrcode = await normalizeQrToDataUrl(candidate);
      return { success: !!qrcode, qrcode, status: alt?.status || "connecting" };
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
 * Configura o actualiza la URL del webhook de una sesión en D-API.
 * Usa POST /sessions/{sessionId}/webhook con { webhookUrl } verificado en la API de D-API.
 */
export async function dapiSetWebhookConfig(
  sessionId: string,
  webhookUrl: string,
): Promise<{ success: boolean; raw?: any }> {
  try {
    const resBase = await dapiFetch<any>(`/sessions/${encodeURIComponent(sessionId)}/webhook`, {
      method: "POST",
      body: JSON.stringify({ webhookUrl, enabled: true }),
    }).catch(() => null);

    const allEvents = [
      "messages.received",
      "messages.upsert",
      "messages.sent",
      "message.status",
      "messages.status",
      "message.delivered",
      "message.read",
      "message.deleted",
      "message.edited",
      "connection.status",
      "connection.qrcode",
      "connection.paircode",
    ];

    const eventsMap: Record<string, { enabled: boolean; webhookUrl: string }> = {};
    for (const ev of allEvents) {
      eventsMap[ev] = { enabled: true, webhookUrl };
    }

    const resConfig = await dapiFetch<any>(`/sessions/${encodeURIComponent(sessionId)}/webhook-config`, {
      method: "POST",
      body: JSON.stringify({
        enabled: true,
        type: "single",
        webhookUrl,
        events: eventsMap,
      }),
    }).catch(() => null);

    const ok = Boolean(resConfig?.success ?? resBase?.success ?? true);
    return { success: ok, raw: { base: resBase, config: resConfig } };
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
    const res = await dapiFetch<any>(`/sessions/${encodeURIComponent(sessionId)}`).catch(() => {
      return dapiFetch<any>(`/sessions/${encodeURIComponent(sessionId)}/status`);
    });
    const sessionObj = res?.session || res?.data?.session || null;
    const payload = res?.data || res;
    const candidateQr =
      payload?.qrCodeImage ||
      res?.qrCodeImage ||
      sessionObj?.qrCodeImage ||
      payload?.qrcode ||
      res?.qrcode ||
      sessionObj?.qrCode ||
      null;
    const qrcode = await normalizeQrToDataUrl(candidateQr);
    const rawStatus = sessionObj?.status || payload?.status || res?.status || (sessionObj?.connected || payload?.connected || res?.connected ? "connected" : "disconnected");
    const numero = sessionObj?.phone || sessionObj?.number || sessionObj?.phoneNumber || res?.profile?.phone || payload?.numero || payload?.phoneNumber || payload?.phone || res?.numero || null;
    return {
      success: true,
      status: rawStatus,
      qrcode,
      numero: numero ? String(numero).replace(/\D/g, "") : null,
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
  contextInfo?: any,
  apiKey?: string | null,
): Promise<{ id: string; provider: string; raw: any }> {
  const cleanTo = to.includes("@g.us") ? to.trim() : to.replace(/\D/g, "");
  const payload: Record<string, any> = {
    sessionId,
    to: cleanTo,
    text,
    message: text,
  };
  if (quotedMessageId) {
    payload.quotedMessageId = quotedMessageId;
    payload.context = { message_id: quotedMessageId }; // Suporte oficial Meta Cloud API
    if (contextInfo) {
      payload.contextInfo = contextInfo;
    } else {
      payload.contextInfo = {
        stanzaId: quotedMessageId,
        participant: `${cleanTo}@s.whatsapp.net`,
      };
    }
  }

  const res = await dapiFetch<any>("/messages/send/text", {
    method: "POST",
    body: JSON.stringify(payload),
  }, 15_000, apiKey).catch(() => {
    return dapiFetch<any>("/messages/text", {
      method: "POST",
      body: JSON.stringify(payload),
    }, 15_000, apiKey);
  });

  const id = extractDapiResponseId(res);
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
  apiKey?: string | null,
): Promise<{ id: string; provider: string; raw: any }> {
  const cleanTo = to.includes("@g.us") ? to.trim() : to.replace(/\D/g, "");

  let formattedUrl = String(media.url || "").trim();
  const defaultMime =
    media.mime ||
    (media.type === "audio"
      ? "audio/ogg"
      : media.type === "image"
        ? "image/jpeg"
        : media.type === "video"
          ? "video/mp4"
          : "application/octet-stream");

  if (
    formattedUrl &&
    !formattedUrl.startsWith("http://") &&
    !formattedUrl.startsWith("https://") &&
    !formattedUrl.startsWith("data:")
  ) {
    formattedUrl = `data:${defaultMime};base64,${formattedUrl}`;
  }

  // Si la URL es una URL presignada de Cloudflare R2 (.r2.cloudflarestorage.com),
  // la descargamos en el servidor y la convertimos a Data URI Base64 para evitar rechazos de D-API
  if (formattedUrl.startsWith("http") && formattedUrl.includes("r2.cloudflarestorage.com")) {
    try {
      const r2Res = await fetch(formattedUrl, { signal: AbortSignal.timeout(15_000) });
      if (r2Res.ok) {
        const arrBuf = await r2Res.arrayBuffer();
        if (arrBuf.byteLength > 0 && arrBuf.byteLength <= 16 * 1024 * 1024) {
          const b64 = Buffer.from(arrBuf).toString("base64");
          const detectedMime = (r2Res.headers.get("content-type") || defaultMime).split(";")[0].trim();
          formattedUrl = `data:${detectedMime};base64,${b64}`;
        }
      }
    } catch (dlErr: any) {
      console.warn("[dapiSendMedia] No se pudo pre-convertir URL R2 a base64, usando URL directa:", dlErr?.message);
    }
  }

  const buildMediaBody = (targetUrl: string) => {
    const body: Record<string, any> = {
      sessionId,
      to: cleanTo,
    };
    if (media.type === "image") {
      body.image = targetUrl;
      body.imageUrl = targetUrl;
      body.url = targetUrl;
      if (media.caption) body.caption = media.caption;
      if (media.mime) body.mimetype = media.mime;
    } else if (media.type === "audio") {
      body.audio = targetUrl;
      body.audioUrl = targetUrl;
      body.url = targetUrl;
      body.ptt = media.ptt ?? true;
      if (media.mime) body.mimetype = media.mime;
    } else if (media.type === "video") {
      body.video = targetUrl;
      body.videoUrl = targetUrl;
      body.url = targetUrl;
      if (media.caption) body.caption = media.caption;
      if (media.mime) body.mimetype = media.mime;
    } else {
      body.document = targetUrl;
      body.documentUrl = targetUrl;
      body.url = targetUrl;
      if (media.fileName) {
        body.fileName = media.fileName;
        body.filename = media.fileName;
      }
      if (media.mime) body.mimetype = media.mime;
      if (media.caption) body.caption = media.caption;
    }
    return body;
  };

  const primaryEndpoint =
    media.type === "image"
      ? "/messages/send/image"
      : media.type === "audio"
        ? "/messages/send/audio"
        : media.type === "video"
          ? "/messages/send/video"
          : "/messages/send/document";

  const fallbackEndpoint =
    media.type === "image"
      ? "/messages/image"
      : media.type === "audio"
        ? "/messages/audio"
        : media.type === "video"
          ? "/messages/video"
          : "/messages/document";

  const body = buildMediaBody(formattedUrl);

  let res: any;
  try {
    res = await dapiFetch<any>(
      primaryEndpoint,
      { method: "POST", body: JSON.stringify(body) },
      35_000,
      apiKey,
    ).catch(() =>
      dapiFetch<any>(
        fallbackEndpoint,
        { method: "POST", body: JSON.stringify(body) },
        35_000,
        apiKey,
      ),
    );
  } catch (sendErr: any) {
    // Último fallback: si era una URL HTTP pública y D-API falló al descargarla, convertir a Base64 en servidor y reintentar
    if (formattedUrl.startsWith("http")) {
      const dlRes = await fetch(formattedUrl, { signal: AbortSignal.timeout(15_000) }).catch(() => null);
      if (dlRes && dlRes.ok) {
        const buf = Buffer.from(await dlRes.arrayBuffer());
        const b64Url = `data:${defaultMime.split(";")[0]};base64,${buf.toString("base64")}`;
        const retryBody = buildMediaBody(b64Url);
        res = await dapiFetch<any>(
          primaryEndpoint,
          { method: "POST", body: JSON.stringify(retryBody) },
          35_000,
          apiKey,
        ).catch(() =>
          dapiFetch<any>(
            fallbackEndpoint,
            { method: "POST", body: JSON.stringify(retryBody) },
            35_000,
            apiKey,
          ),
        );
      } else {
        throw sendErr;
      }
    } else {
      throw sendErr;
    }
  }

  const id = extractDapiResponseId(res);
  return { id, provider: "dapi", raw: res };
}

export async function dapiSendAudio(
  sessionId: string,
  to: string,
  audioBase64OrUrl: string,
  ptt?: boolean,
  apiKey?: string | null,
): Promise<{ id: string; provider: string; raw: any }> {
  const isOgg =
    audioBase64OrUrl.includes("audio/ogg") ||
    audioBase64OrUrl.includes("codecs=opus") ||
    audioBase64OrUrl.endsWith(".ogg");
  const usePtt = ptt !== undefined ? ptt : isOgg;
  return dapiSendMedia(
    sessionId,
    to,
    {
      url: audioBase64OrUrl,
      type: "audio",
      ptt: usePtt,
    },
    apiKey,
  );
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
  apiKey?: string | null,
): Promise<{ id: string; provider: string; raw: any }> {
  const cleanTo = to.includes("@g.us") ? to.trim() : to.replace(/\D/g, "");
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
  }, 15_000, apiKey).catch(() => {
    return dapiFetch<any>("/messages/template", {
      method: "POST",
      body: JSON.stringify(payload),
    }, 15_000, apiKey);
  });

  const id = extractDapiResponseId(res);
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
  apiKey?: string | null,
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
    }, 20_000, apiKey);
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


/** [Ambas] Envía una reacción (emoji) a un mensaje en WhatsApp */
export async function dapiSendReaction(
  sessionId: string,
  to: string,
  messageId: string,
  emoji: string,
  apiKey?: string | null,
): Promise<{ success: boolean; raw?: any }> {
  const cleanTo = to.includes("@g.us") ? to.trim() : to.replace(/\D/g, "");
  const payload = {
    sessionId,
    to: cleanTo,
    messageId,
    id: messageId,
    emoji: emoji || "",
    reaction: emoji || "",
  };
  const res = await dapiFetch<any>("/messages/send/reaction", {
    method: "POST",
    body: JSON.stringify(payload),
  }, 15_000, apiKey).catch(() =>
    dapiFetch<any>("/messages/reaction", {
      method: "POST",
      body: JSON.stringify(payload),
    }, 15_000, apiKey),
  );
  return { success: true, raw: res };
}

/** [Solo API No Oficial - dapi] Edita el texto de un mensaje ya enviado */
export async function dapiEditMessage(
  sessionId: string,
  to: string,
  messageId: string,
  newText: string,
  apiKey?: string | null,
): Promise<{ success: boolean; raw?: any }> {
  const cleanTo = to.includes("@g.us") ? to.trim() : to.replace(/\D/g, "");
  const payload = {
    sessionId,
    to: cleanTo,
    text: newText,
  };
  const res = await dapiFetch<any>(`/messages/${encodeURIComponent(messageId)}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  }, 15_000, apiKey);
  return { success: res?.success ?? true, raw: res };
}

/** [Solo API No Oficial - dapi] Elimina un mensaje para todos en WhatsApp */
export async function dapiDeleteMessage(
  sessionId: string,
  to: string,
  messageId: string,
  apiKey?: string | null,
): Promise<{ success: boolean; raw?: any }> {
  const cleanTo = to.includes("@g.us") ? to.trim() : to.replace(/\D/g, "");
  const payload = {
    sessionId,
    to: cleanTo,
    forEveryone: true,
  };
  const res = await dapiFetch<any>(`/chats/messages/${encodeURIComponent(messageId)}`, {
    method: "DELETE",
    body: JSON.stringify(payload),
  }, 15_000, apiKey);
  return { success: res?.success ?? true, raw: res };
}

/** [Ambas] Envía una tarjeta de contacto vCard nativa */
export async function dapiSendContact(
  sessionId: string,
  to: string,
  contact: { fullName?: string; phoneNumber?: string; name?: string; phone?: string; organization?: string },
  apiKey?: string | null,
): Promise<{ id: string; provider: string; raw: any }> {
  const cleanTo = to.includes("@g.us") ? to.trim() : to.replace(/\D/g, "");
  const contactFullName = contact.fullName || contact.name || "Contato";
  const rawPhone = contact.phoneNumber || contact.phone || "";
  const cleanContactPhone = rawPhone.replace(/\D/g, "");
  const payload = {
    sessionId,
    to: cleanTo,
    contactName: contactFullName,
    fullName: contactFullName,
    phoneNumber: cleanContactPhone,
    phone: `+${cleanContactPhone}`,
    organization: contact.organization || "",
    contact: {
      fullName: contact.fullName,
      phoneNumber: `+${cleanContactPhone}`,
      organization: contact.organization || "",
    },
  };
  const res = await dapiFetch<any>("/messages/send/contact", {
    method: "POST",
    body: JSON.stringify(payload),
  }, 15_000, apiKey).catch(() =>
    dapiFetch<any>("/messages/contact", {
      method: "POST",
      body: JSON.stringify(payload),
    }, 15_000, apiKey),
  );
  const id = extractDapiResponseId(res);
  return { id, provider: "dapi", raw: res };
}

/** [Solo API No Oficial - dapi] Envía indicador "Escribiendo..." o "Grabando audio..." */
export async function dapiSendPresence(
  sessionId: string,
  to: string,
  presence: "composing" | "typing" | "recording" | "paused" = "typing",
  durationMs: number = 4000,
  apiKey?: string | null,
): Promise<void> {
  const cleanTo = to.includes("@g.us") ? to.trim() : to.replace(/\D/g, "");
  const normalizedPresence = presence === "composing" ? "typing" : presence;
  await dapiFetch<any>("/chats/presence", {
    method: "POST",
    body: JSON.stringify({ sessionId, to: cleanTo, presence: normalizedPresence, durationMs }),
  }, 10_000, apiKey).catch(() => null);
}

/** [Solo API Oficial - dapi_official] Elimina una plantilla HSM en D-API / Meta */
export async function dapiDeleteTemplate(
  sessionId: string,
  templateNameOrId: string,
): Promise<{ success: boolean }> {
  try {
    await dapiFetch<any>(`/sessions/${encodeURIComponent(sessionId)}/templates/${encodeURIComponent(templateNameOrId)}`, {
      method: "DELETE",
    }).catch(() =>
      dapiFetch<any>(`/official/templates/${encodeURIComponent(templateNameOrId)}?sessionId=${encodeURIComponent(sessionId)}`, {
        method: "DELETE",
      }),
    );
    return { success: true };
  } catch {
    return { success: false };
  }
}
