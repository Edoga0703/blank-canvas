/* eslint-disable @typescript-eslint/no-explicit-any */
import { storeMediaObject } from "@/lib/storage/r2.server";

const META_MEDIA_HOSTS = ["fbcdn.net", "cdninstagram.com", "facebook.com", "fbsbx.com"];

function safeMetaMediaUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;
    const host = url.hostname.toLowerCase();
    if (!META_MEDIA_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`))) return null;
    return url;
  } catch {
    return null;
  }
}

function fileNameFor(row: any, url: URL) {
  if (row.file_name) return String(row.file_name).slice(0, 180);
  const fromPath = decodeURIComponent(url.pathname.split("/").pop() ?? "").replace(/[^a-zA-Z0-9._-]/g, "-");
  if (fromPath && /\.[a-z0-9]{2,6}$/i.test(fromPath)) return fromPath.slice(-180);
  const ext = String(row.mime_type ?? "").split("/")[1]?.split(";")[0] || (row.kind === "video" ? "mp4" : row.kind === "audio" ? "ogg" : "jpg");
  return `meta-${row.id}.${ext}`;
}

/**
 * Arquiva anexos Meta fora do webhook. A consulta é limitada e pode ser
 * executada repetidamente; linhas já arquivadas deixam de entrar no lote.
 */
export async function archivePendingMetaMessageMedia(admin: any, options?: {
  companyId?: string;
  provider?: "meta_instagram" | "meta_messenger" | string;
  limit?: number;
}) {
  const limit = Math.min(Math.max(options?.limit ?? 10, 1), 50);
  let query = admin.from("message_attachments")
    .select("id,company_id,mensagem_id,provider_url,mime_type,file_name,kind,created_at")
    .is("storage_key", null)
    .not("provider_url", "is", null)
    .order("created_at", { ascending: true })
    .limit(Math.max(limit * 5, 50));
  if (options?.companyId) query = query.eq("company_id", options.companyId);
  const { data: attachments, error } = await query;
  if (error) throw error;
  if (!(attachments ?? []).length) return { archived: 0, failed: 0, skipped: 0, errors: [] as string[] };

  const messageIds = [...new Set((attachments ?? []).map((row: any) => row.mensagem_id).filter(Boolean))];
  const { data: messages, error: messagesError } = await admin.from("mensagens")
    .select("id,provider,provider_timestamp,created_at")
    .in("id", messageIds);
  if (messagesError) throw messagesError;
  const byMessage = new Map<string, any>((messages ?? []).map((message: any) => [message.id, message]));

  const candidates = (attachments ?? []).filter((row: any) => {
    const message = byMessage.get(row.mensagem_id);
    return message?.provider === (options?.provider ?? message?.provider) && ["meta_instagram", "meta_messenger"].includes(message?.provider);
  }).slice(0, limit);

  let archived = 0;
  let failed = 0;
  let skipped = 0;
  const errors: string[] = [];
  for (const row of candidates) {
    const url = safeMetaMediaUrl(String(row.provider_url ?? ""));
    if (!url) {
      skipped += 1;
      errors.push(`${row.id}: URL de mídia fora dos domínios permitidos da Meta.`);
      continue;
    }
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(15_000), redirect: "follow" });
      if (!response.ok) throw new Error(`download HTTP ${response.status}`);
      const message = byMessage.get(row.mensagem_id);
      const stored = await storeMediaObject({
        companyId: row.company_id,
        occurredAt: message?.provider_timestamp ?? message?.created_at ?? row.created_at ?? new Date().toISOString(),
        bytes: new Uint8Array(await response.arrayBuffer()),
        mimeType: response.headers.get("content-type") ?? row.mime_type ?? null,
        fileName: fileNameFor(row, url),
      });
      const { error: updateError } = await admin.from("message_attachments").update({
        storage_key: stored.storageKey,
        storage_url: stored.storageUrl,
        mime_type: stored.mimeType,
        file_name: stored.fileName,
        size_bytes: stored.sizeBytes,
        sha256: stored.sha256,
      }).eq("id", row.id).is("storage_key", null);
      if (updateError) throw updateError;
      archived += 1;
    } catch (error) {
      failed += 1;
      errors.push(`${row.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { archived, failed, skipped, errors: errors.slice(0, 20) };
}
