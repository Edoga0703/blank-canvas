import * as QRCode from "qrcode";

// Wrapper server-only para a Evolution API v2.
// Arquivo *.server.ts é bloqueado do bundle client.

const SUPPORT_SUFFIX = " Se persistir, abra um chamado no chat de suporte dentro do sistema.";

export class EvolutionApiError extends Error {
  status: number;
  details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = "EvolutionApiError";
    this.status = status;
    this.details = details;
  }
}

function env() {
  const url = process.env.EVOLUTION_API_URL;
  const key = process.env.EVOLUTION_API_KEY;
  if (!url || !key) {
    throw new Error(`Servidor do WhatsApp não configurado. Configure EVOLUTION_API_URL e EVOLUTION_API_KEY nos segredos do backend.${SUPPORT_SUFFIX}`);
  }
  return { url: url.replace(/\/+$/, ""), key };
}

async function evo<T = any>(
  path: string,
  init: RequestInit & { json?: any } = {},
): Promise<T> {
  const { url, key } = env();
  const headers: Record<string, string> = {
    apikey: key,
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string> | undefined),
  };
  let res: Response;
  try {
    res = await fetch(`${url}${path}`, {
      ...init,
      headers,
      body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
    });
  } catch (e: any) {
    throw new Error(`Evolution API indisponível: ${e?.message || "falha de rede"}.${SUPPORT_SUFFIX}`);
  }
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const msg = data?.message || data?.error || text || `HTTP ${res.status}`;
    const friendly = res.status === 401 || res.status === 403
      ? `Credenciais da Evolution API inválidas ou sem permissão (${res.status}). Verifique EVOLUTION_API_URL e EVOLUTION_API_KEY nos segredos do backend.${SUPPORT_SUFFIX}`
      : `Evolution API: ${msg}.${SUPPORT_SUFFIX}`;
    throw new EvolutionApiError(res.status, friendly, data);
  }
  return data as T;
}

export async function evoCreateInstance(instanceName: string, webhookUrl?: string) {
  // Evolution v2: POST /instance/create
  const body: any = {
    instanceName,
    integration: "WHATSAPP-BAILEYS",
    qrcode: true,
  };
  if (webhookUrl) {
    body.webhook = {
      url: webhookUrl,
      byEvents: false,
      base64: false,
      events: ["MESSAGES_UPSERT", "MESSAGES_UPDATE", "SEND_MESSAGE", "CONNECTION_UPDATE", "QRCODE_UPDATED"],
    };
  }
  return evo(`/instance/create`, { method: "POST", json: body });
}

export async function evoConnect(instanceName: string, phone?: string | null): Promise<{ base64?: string; code?: string; pairingCode?: string }> {
  // GET /instance/connect/{instance}?number=… → { base64, code, pairingCode }
  // Com `number`, a Evolution gera o código de pareamento (conexão por número).
  const qs = phone ? `?number=${encodeURIComponent(phone)}` : "";
  return evo(`/instance/connect/${encodeURIComponent(instanceName)}${qs}`, { method: "GET" });
}

function asImageDataUrl(value: unknown, allowRawBase64 = false): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return null;
  if (text.startsWith("data:image/")) return text;
  const base64 = text.includes("base64,") ? text.split("base64,").pop()?.trim() : text;
  if (allowRawBase64 && base64 && base64.length > 120 && /^[A-Za-z0-9+/=\s]+$/.test(base64) && looksLikeImageBase64(base64)) {
    return `data:image/png;base64,${base64.replace(/\s/g, "")}`;
  }
  return null;
}

function looksLikeImageBase64(base64: string) {
  try {
    const bin = atob(base64.replace(/\s/g, "").slice(0, 64));
    return (
      (bin.charCodeAt(0) === 0x89 && bin.slice(1, 4) === "PNG") ||
      (bin.charCodeAt(0) === 0xff && bin.charCodeAt(1) === 0xd8) ||
      (bin.slice(0, 4) === "RIFF" && bin.slice(8, 12) === "WEBP")
    );
  } catch {
    return false;
  }
}

function extractQrCode(payload: any): string | null {
  const candidates = [
    payload?.code,
    payload?.qrcode?.code,
    payload?.qrCode,
    payload?.qrcode,
    payload?.qr,
  ];
  for (const value of candidates) {
    if (typeof value === "string" && value.trim() && !asImageDataUrl(value, false)) return value.trim();
  }
  return null;
}

export async function extractQrFromPayload(payload: any): Promise<{ qrBase64: string | null; code: string | null; pairingCode: string | null }> {
  const image =
    asImageDataUrl(payload?.base64, true) ||
    asImageDataUrl(payload?.qrcode?.base64, true) ||
    asImageDataUrl(payload?.qr?.base64, true) ||
    asImageDataUrl(payload?.qrcode, true) ||
    asImageDataUrl(payload?.qr, true);
  const code = extractQrCode(payload);
  const pairingCode = payload?.pairingCode ?? payload?.qrcode?.pairingCode ?? null;
  if (image) return { qrBase64: image, code, pairingCode };
  if (code) {
    const qrBase64 = await QRCode.toDataURL(code, { width: 320, margin: 2, errorCorrectionLevel: "M" });
    return { qrBase64, code, pairingCode };
  }
  return { qrBase64: null, code: null, pairingCode };
}

export async function evoGetQr(instanceName: string) {
  const payload: any = await evoConnect(instanceName);
  return extractQrFromPayload(payload);
}


export async function evoState(instanceName: string): Promise<{ instance?: { state?: string }; state?: string }> {
  return evo(`/instance/connectionState/${encodeURIComponent(instanceName)}`, { method: "GET" });
}

export async function evoFetchInstance(instanceName: string): Promise<any | null> {
  const data: any = await evo(`/instance/fetchInstances?instanceName=${encodeURIComponent(instanceName)}`, {
    method: "GET",
  });
  return Array.isArray(data) ? data[0] ?? null : data?.[0] ?? data ?? null;
}

export async function evoSetWebhook(instanceName: string, webhookUrl: string) {
  return evo(`/webhook/set/${encodeURIComponent(instanceName)}`, {
    method: "POST",
    json: {
      webhook: {
        enabled: true,
        url: webhookUrl,
        byEvents: false,
        base64: false,
        events: ["MESSAGES_UPSERT", "MESSAGES_UPDATE", "SEND_MESSAGE", "CONNECTION_UPDATE", "QRCODE_UPDATED"],
      },
    },
  });
}

export async function evoSendText(
  instanceName: string,
  number: string,
  text: string,
  opts?: { quoted?: { key: { id: string; remoteJid: string; fromMe: boolean }; message: any } },
): Promise<any> {
  const json: any = { number, text };
  if (opts?.quoted) json.quoted = opts.quoted;
  return evo(`/message/sendText/${encodeURIComponent(instanceName)}`, {
    method: "POST",
    json,
  });
}

export async function evoSendReaction(
  instanceName: string,
  remoteJid: string,
  messageId: string,
  fromMe: boolean,
  reaction: string,
) {
  return evo(`/message/sendReaction/${encodeURIComponent(instanceName)}`, {
    method: "POST",
    json: { key: { remoteJid, fromMe, id: messageId }, reaction },
  });
}

export async function evoEditMessage(
  instanceName: string,
  remoteJid: string,
  messageId: string,
  fromMe: boolean,
  newText: string,
) {
  const number = remoteJid.split("@")[0];
  return evo(`/chat/updateMessage/${encodeURIComponent(instanceName)}`, {
    method: "POST",
    json: { number, key: { remoteJid, fromMe, id: messageId }, text: newText },
  });
}

export async function evoSendPresence(instanceName: string, number: string, presence: "composing" | "paused" | "available", delayMs = 1500) {
  try {
    await evo(`/chat/sendPresence/${encodeURIComponent(instanceName)}`, {
      method: "POST",
      json: { number, presence, delay: delayMs },
    });
  } catch {
    // best-effort
  }
}

export async function evoLogout(instanceName: string) {
  return evo(`/instance/logout/${encodeURIComponent(instanceName)}`, { method: "DELETE" });
}

export async function evoRestart(instanceName: string) {
  // Evolution v2: tenta reiniciar/reconectar usando credenciais salvas, sem pedir QR novo.
  // Algumas instalações expõem /restart; outras usam POST /connect para recarregar a sessão.
  try {
    return await evo(`/instance/restart/${encodeURIComponent(instanceName)}`, { method: "POST" });
  } catch (restartError: any) {
    if ([401, 403, 406].includes(Number(restartError?.status || 0))) throw restartError;
    return evo(`/instance/connect/${encodeURIComponent(instanceName)}`, { method: "POST", json: {} });
  }
}

export async function evoDelete(instanceName: string) {
  return evo(`/instance/delete/${encodeURIComponent(instanceName)}`, { method: "DELETE" });
}

export async function evoFetchNumberFromInstance(instanceName: string): Promise<string | null> {
  try {
    const inst = await evoFetchInstance(instanceName);
    const raw =
      inst?.ownerJid ||
      inst?.instance?.owner ||
      inst?.owner ||
      inst?.number ||
      inst?.instance?.wuid ||
      null;
    if (!raw) return null;
    return String(raw).split("@")[0].replace(/\D/g, "") || null;
  } catch {
    return null;
  }
}

export async function evoSendMedia(
  instanceName: string,
  number: string,
  params: { mediatype: "image" | "video" | "document"; media: string; mimetype: string; fileName?: string; caption?: string },
) {
  return evo(`/message/sendMedia/${encodeURIComponent(instanceName)}`, {
    method: "POST",
    json: {
      number,
      mediatype: params.mediatype,
      media: params.media,
      mimetype: params.mimetype,
      fileName: params.fileName,
      caption: params.caption,
    },
  });
}

/** Envia um cartão de contato nativo do WhatsApp (vCard). */
export async function evoSendContact(
  instanceName: string,
  number: string,
  contato: { fullName: string; phoneNumber: string; organization?: string | null },
) {
  const digits = String(contato.phoneNumber).replace(/\D/g, "");
  return evo(`/message/sendContact/${encodeURIComponent(instanceName)}`, {
    method: "POST",
    json: {
      number,
      contact: [{
        fullName: contato.fullName,
        wuid: digits,
        phoneNumber: contato.phoneNumber,
        ...(contato.organization ? { organization: contato.organization } : {}),
      }],
    },
  });
}

export async function evoSendAudio(instanceName: string, number: string, audioBase64OrUrl: string) {

  const isUrl = /^https?:\/\//i.test(audioBase64OrUrl);
  const clean = isUrl ? audioBase64OrUrl : audioBase64OrUrl.replace(/^data:[^;]+;base64,/, "");
  return evo(`/message/sendWhatsAppAudio/${encodeURIComponent(instanceName)}`, {
    method: "POST",
    json: isUrl ? { number, audio: clean } : { number, audio: clean, encoding: true },
  });
}

export async function evoFetchProfilePic(instanceName: string, number: string): Promise<string | null> {
  try {
    const data: any = await evo(`/chat/fetchProfilePictureUrl/${encodeURIComponent(instanceName)}`, {
      method: "POST",
      json: { number },
    });
    return data?.profilePictureUrl || data?.profilePicUrl || data?.url || null;
  } catch {
    return null;
  }
}

export async function evoGetMediaBase64(
  instanceName: string,
  message: any,
): Promise<{ base64: string; mimetype?: string; fileName?: string } | null> {
  try {
    const data: any = await evo(`/chat/getBase64FromMediaMessage/${encodeURIComponent(instanceName)}`, {
      method: "POST",
      json: { message: { key: message?.key, message: message?.message }, convertToMp4: false },
    });
    const base64 = data?.base64 || data?.data?.base64 || data?.buffer || null;
    if (!base64 || typeof base64 !== "string") return null;
    return {
      base64,
      mimetype: data?.mimetype || data?.mediaType || data?.data?.mimetype,
      fileName: data?.fileName || data?.data?.fileName,
    };
  } catch (e: any) {
    console.warn("[evoGetMediaBase64]", e?.message);
    return null;
  }
}

export async function evoDeleteChat(instanceName: string, number: string) {
  return evo(`/chat/deleteChat/${encodeURIComponent(instanceName)}`, {
    method: "DELETE",
    json: { number },
  });
}

export async function evoArchiveChat(instanceName: string, number: string, archive: boolean) {
  return evo(`/chat/archiveChat/${encodeURIComponent(instanceName)}`, {
    method: "POST",
    json: { number, archive },
  });
}

export async function evoBlockContact(instanceName: string, number: string, block: "block" | "unblock") {
  return evo(`/chat/blockContact/${encodeURIComponent(instanceName)}`, {
    method: "POST",
    json: { number, block },
  });
}




/** Apaga uma mensagem no WhatsApp (para todos). */
export async function evoDeleteMessage(
  instanceName: string,
  remoteJid: string,
  messageId: string,
  fromMe: boolean,
) {
  return evo(`/message/delete/${encodeURIComponent(instanceName)}`, {
    method: "DELETE",
    json: { id: messageId, remoteJid, fromMe, participant: undefined },
  });
}
