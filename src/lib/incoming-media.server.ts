import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { uazGetMediaBase64 } from "@/lib/uazapi.server";


/** URLs internas do WhatsApp (criptografadas) não abrem no navegador. */
export function isRenderableMediaUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  if (!/^https?:\/\//i.test(url)) return false;
  const u = url.toLowerCase();
  if (u.includes("mmg.whatsapp.net") || u.includes("whatsapp.net/o1/") || u.includes(".enc")) return false;
  return true;
}

type StoredMedia = {
  url: string;
  mime: string;
  name: string;
};

function extensionFor(mime: string, fileName?: string) {
  const fromName = fileName?.split(".").pop()?.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
  if (fromName) return fromName;
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("webm")) return "webm";
  if (mime.includes("mpeg")) return "mp3";
  if (mime.includes("mp4")) return "mp4";
  if (mime.includes("wav")) return "wav";
  if (mime.includes("jpeg")) return "jpg";
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("gif")) return "gif";
  if (mime.includes("pdf")) return "pdf";
  if (mime.includes("wordprocessingml")) return "docx";
  if (mime.includes("msword")) return "doc";
  if (mime.includes("pkcs12")) return "pfx";
  if (mime.includes("spreadsheetml")) return "xlsx";
  if (mime.includes("zip")) return "zip";
  if (mime.includes("rar")) return "rar";
  if (mime.includes("xml")) return "xml";
  if (mime.includes("text/plain")) return "txt";
  return "bin";
}

export async function storeIncomingUazapiMedia(params: {
  instanceToken: string | null | undefined;
  companyId: string;
  number: string;
  messageId: string;
  message: unknown;
  fallbackMime?: string | null;
  fileName?: string | null;
}): Promise<StoredMedia | null> {
  if (!params.instanceToken || !params.messageId) return null;

  const downloaded = await uazGetMediaBase64(params.instanceToken, {
    key: { id: params.messageId },
    message: params.message,
  });
  if (!downloaded?.base64) return null;
  if (!downloaded.fileName && params.fileName) downloaded.fileName = params.fileName;

  const mime = downloaded.mimetype || params.fallbackMime || "application/octet-stream";
  const extension = extensionFor(mime, downloaded.fileName);
  const safeMessageId = params.messageId.replace(/[^a-zA-Z0-9_-]/g, "-");
  const path = `${params.companyId}/${params.number}/${safeMessageId}.${extension}`;
  const rawBase64 = downloaded.base64.replace(/^data:[^;]+;base64,/, "");
  const bytes = Uint8Array.from(Buffer.from(rawBase64, "base64"));

  // R2 is opt-in until the first production upload is validated. The current
  // Supabase bucket remains the fallback so old installations keep working.
  if (process.env.MEDIA_STORAGE_BACKEND?.trim().toLowerCase() === "r2") {
    const { createR2DownloadUrl, isR2Configured, storeMediaObject } = await import("@/lib/storage/r2.server");
    if (!isR2Configured()) throw new Error("MEDIA_STORAGE_BACKEND=r2, mas as credenciais R2 estão incompletas.");
    const stored = await storeMediaObject({
      companyId: params.companyId,
      bytes,
      mimeType: mime,
      fileName: downloaded.fileName || `${safeMessageId}.${extension}`,
    });
    return {
      url: stored.storageUrl || createR2DownloadUrl(stored.storageKey),
      mime,
      name: stored.fileName,
    };
  }

  const { error: uploadError } = await supabaseAdmin.storage
    .from("chat-media")
    .upload(path, bytes, { contentType: mime, upsert: true });
  if (uploadError) {
    console.error("[incoming-media] upload failed", uploadError.message);
    return null;
  }

  const { data, error: signError } = await supabaseAdmin.storage
    .from("chat-media")
    .createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
  if (signError || !data?.signedUrl) {
    console.error("[incoming-media] signed URL failed", signError?.message);
    return null;
  }

  return {
    url: data.signedUrl,
    mime,
    name: downloaded.fileName || `${safeMessageId}.${extension}`,
  };
}
