// Adapter Telegram Bot API (multi-tenant: cada empresa usa seu próprio bot token).
// Server-only. O token do bot fica em whatsapp_instances.instance_token.
const API = "https://api.telegram.org";

export class TelegramApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function cleanToken(token: string) {
  return token.normalize("NFKC").trim().replace(/^["']|["']$/g, "");
}

async function tg(token: string, method: string, body?: any) {
  const res = await fetch(`${API}/bot${cleanToken(token)}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
    signal: AbortSignal.timeout(20_000),
  });
  const json: any = await res.json().catch(() => null);
  if (!res.ok || json?.ok === false) {
    const msg = json?.description || res.statusText || "Falha na API do Telegram";
    throw new TelegramApiError(msg, res.status);
  }
  return json?.result;
}

export async function tgGetMe(token: string) {
  return tg(token, "getMe") as Promise<{ id: number; username?: string; first_name?: string }>;
}

export async function tgSetWebhook(token: string, url: string, secret: string) {
  return tg(token, "setWebhook", {
    url,
    secret_token: secret,
    allowed_updates: [
      "message",
      "edited_message",
      "business_connection",
      "business_message",
      "edited_business_message",
      "deleted_business_messages",
    ],
    drop_pending_updates: false,
  });
}

export async function tgDeleteWebhook(token: string) {
  return tg(token, "deleteWebhook", { drop_pending_updates: false });
}

export async function tgGetWebhookInfo(token: string) {
  return tg(token, "getWebhookInfo") as Promise<any>;
}

function parseNumericMessageId(rawId?: string | number | null): number | null {
  if (rawId === null || rawId === undefined) return null;
  const digits = String(rawId).replace(/\D/g, "");
  if (!digits) return null;
  const n = parseInt(digits, 10);
  return !isNaN(n) && n > 0 ? n : null;
}

export async function tgSendText(
  token: string,
  chatId: string,
  text: string,
  options?: {
    businessConnectionId?: string | null;
    replyToMessageId?: string | number | null;
  },
) {
  const payload: any = { chat_id: chatId, text };
  if (options?.businessConnectionId) {
    payload.business_connection_id = options.businessConnectionId;
  }
  const replyId = parseNumericMessageId(options?.replyToMessageId);
  if (replyId) {
    payload.reply_parameters = { message_id: replyId };
  }
  const r: any = await tg(token, "sendMessage", payload);
  return { key: { id: String(r?.message_id ?? "") }, messageId: r?.message_id };
}

export async function tgSendBusinessText(
  token: string,
  businessConnectionId: string,
  chatId: string,
  text: string,
  replyToMessageId?: string | number | null,
) {
  return tgSendText(token, chatId, text, {
    businessConnectionId,
    replyToMessageId,
  });
}

export async function tgSendPresence(
  token: string,
  chatId: string,
  presence: string,
  businessConnectionId?: string | null,
) {
  if (presence !== "composing") return { ok: true };
  try {
    const payload: any = { chat_id: chatId, action: "typing" };
    if (businessConnectionId) {
      payload.business_connection_id = businessConnectionId;
    }
    await tg(token, "sendChatAction", payload);
  } catch {
    /* presença é best-effort */
  }
  return { ok: true };
}

/** media pode ser URL pública ou base64 (data URI ou puro). */
async function sendFile(
  token: string,
  chatId: string,
  method: "sendPhoto" | "sendVideo" | "sendDocument" | "sendVoice",
  field: "photo" | "video" | "document" | "voice",
  media: string,
  opts?: {
    caption?: string;
    fileName?: string;
    mimetype?: string;
    businessConnectionId?: string | null;
    replyToMessageId?: string | number | null;
  },
) {
  let blob: Blob;
  const filename =
    opts?.fileName ||
    (field === "voice"
      ? "audio.ogg"
      : field === "photo"
      ? "image.jpg"
      : field === "video"
      ? "video.mp4"
      : "arquivo");

  const isUrl = /^https?:\/\//i.test(media);
  if (isUrl) {
    try {
      const resp = await fetch(media, { signal: AbortSignal.timeout(30_000) });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const arrayBuffer = await resp.arrayBuffer();
      const cType = opts?.mimetype || resp.headers.get("content-type") || "application/octet-stream";
      blob = new Blob([arrayBuffer], { type: cType });
    } catch (e: any) {
      console.warn(`[tg sendFile] Falha ao baixar mídia no servidor (${e?.message}), tentando URL direta...`);
      const payload: any = {
        chat_id: chatId,
        [field]: media,
        ...(opts?.caption ? { caption: opts.caption } : {}),
      };
      if (opts?.businessConnectionId) {
        payload.business_connection_id = opts.businessConnectionId;
      }
      const replyId = parseNumericMessageId(opts?.replyToMessageId);
      if (replyId) {
        payload.reply_parameters = { message_id: replyId };
      }
      const r: any = await tg(token, method, payload);
      return { key: { id: String(r?.message_id ?? "") }, messageId: r?.message_id };
    }
  } else {
    const base64 = media.includes(",") ? media.split(",").pop()! : media;
    const bytes = Buffer.from(base64, "base64");
    blob = new Blob([bytes], {
      type: opts?.mimetype || (field === "voice" ? "audio/ogg" : "application/octet-stream"),
    });
  }

  const form = new FormData();
  form.append("chat_id", chatId);
  if (opts?.businessConnectionId) {
    form.append("business_connection_id", opts.businessConnectionId);
  }
  if (opts?.caption) form.append("caption", opts.caption);
  const replyIdForm = parseNumericMessageId(opts?.replyToMessageId);
  if (replyIdForm) {
    form.append("reply_parameters", JSON.stringify({ message_id: replyIdForm }));
  }
  form.append(field, blob, filename);

  const res = await fetch(`${API}/bot${cleanToken(token)}/${method}`, {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(60_000),
  });
  const json: any = await res.json().catch(() => null);
  if (!res.ok || json?.ok === false) {
    throw new TelegramApiError(json?.description || res.statusText, res.status);
  }
  return { key: { id: String(json?.result?.message_id ?? "") }, messageId: json?.result?.message_id };
}

export async function tgSendMedia(
  token: string,
  chatId: string,
  params: {
    mediatype: "image" | "video" | "document" | "audio";
    media: string;
    mimetype?: string;
    fileName?: string;
    caption?: string;
    businessConnectionId?: string | null;
    replyToMessageId?: string | number | null;
  },
) {
  const map = {
    image: ["sendPhoto", "photo"],
    video: ["sendVideo", "video"],
    document: ["sendDocument", "document"],
    audio: ["sendVoice", "voice"],
  } as const;
  const [method, field] = map[params.mediatype] ?? map.document;
  return sendFile(token, chatId, method as any, field as any, params.media, {
    caption: params.caption,
    fileName: params.fileName,
    mimetype: params.mimetype,
    businessConnectionId: params.businessConnectionId,
    replyToMessageId: params.replyToMessageId,
  });
}

export async function tgSendBusinessMedia(
  token: string,
  businessConnectionId: string,
  chatId: string,
  params: {
    mediatype: "image" | "video" | "document" | "audio";
    media: string;
    mimetype?: string;
    fileName?: string;
    caption?: string;
    replyToMessageId?: string | number | null;
  },
) {
  return tgSendMedia(token, chatId, {
    ...params,
    businessConnectionId,
  });
}

export async function tgSendAudio(
  token: string,
  chatId: string,
  audio: string,
  options?: {
    businessConnectionId?: string | null;
    replyToMessageId?: string | number | null;
  },
) {
  return sendFile(token, chatId, "sendVoice", "voice", audio, {
    fileName: "audio.ogg",
    mimetype: "audio/ogg",
    businessConnectionId: options?.businessConnectionId,
    replyToMessageId: options?.replyToMessageId,
  });
}

/**
 * Pipeline Seguro R2 Media Vault:
 * Descarga medios de Telegram en el servidor y los persiste en Cloudflare R2 (capiversa-media).
 * NUNCA almacena ni expone tokens de bot (api.telegram.org/file/bot<TOKEN>) en la BD ni al cliente.
 */
export async function tgDownloadAndStoreMedia(input: {
  botToken: string;
  fileId: string;
  companyId: string;
  fileName?: string | null;
  mimeType?: string | null;
}): Promise<import("@/lib/storage/r2.server").StoredMediaObject | null> {
  const { botToken, fileId, companyId, fileName, mimeType } = input;
  try {
    const fileInfo: any = await tg(botToken, "getFile", { file_id: fileId });
    if (!fileInfo?.file_path) return null;

    const fileDownloadUrl = `${API}/file/bot${cleanToken(botToken)}/${fileInfo.file_path}`;
    const resp = await fetch(fileDownloadUrl, {
      signal: AbortSignal.timeout(60_000),
    });
    if (!resp.ok) {
      console.warn(`[tgDownloadAndStoreMedia] Download failed HTTP ${resp.status}`);
      return null;
    }

    const arrayBuffer = await resp.arrayBuffer();
    const finalMime =
      mimeType ||
      resp.headers.get("content-type") ||
      (fileInfo.file_path.endsWith(".jpg") || fileInfo.file_path.endsWith(".jpeg")
        ? "image/jpeg"
        : fileInfo.file_path.endsWith(".png")
        ? "image/png"
        : fileInfo.file_path.endsWith(".oga") || fileInfo.file_path.endsWith(".ogg")
        ? "audio/ogg"
        : fileInfo.file_path.endsWith(".mp4")
        ? "video/mp4"
        : "application/octet-stream");

    const safeName = fileName || fileInfo.file_path.split("/").pop() || "archivo";

    const { storeMediaObject } = await import("@/lib/storage/r2.server");
    const stored = await storeMediaObject({
      companyId,
      bytes: arrayBuffer,
      mimeType: finalMime,
      fileName: safeName,
    });

    return stored;
  } catch (err: any) {
    console.warn("[tgDownloadAndStoreMedia] Error downloading/storing Telegram media:", err?.message);
    return null;
  }
}

/** URL pública de download de um file_id do Telegram (best-effort interna). */
export async function tgFileUrl(token: string, fileId: string): Promise<string | null> {
  try {
    const f: any = await tg(token, "getFile", { file_id: fileId });
    if (!f?.file_path) return null;
    return `${API}/file/bot${cleanToken(token)}/${f.file_path}`;
  } catch {
    return null;
  }
}

export async function tgFetchProfilePic(token: string, userId: string): Promise<string | null> {
  try {
    const r: any = await tg(token, "getUserProfilePhotos", { user_id: Number(userId), limit: 1 });
    const fileId = r?.photos?.[0]?.slice(-1)?.[0]?.file_id;
    if (!fileId) return null;
    return await tgFileUrl(token, fileId);
  } catch {
    return null;
  }
}
