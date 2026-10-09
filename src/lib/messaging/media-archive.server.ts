import type { MessageAttachment } from "@/lib/messaging/contracts";
import { storeMediaObject } from "@/lib/storage/r2.server";

export type ProviderMediaDownload = (attachment: MessageAttachment) => Promise<{
  bytes: Uint8Array | ArrayBuffer;
  mimeType?: string | null;
  fileName?: string | null;
}>;

/**
 * El adaptador generado por Lovable aporta `download`. Asi conservamos su
 * autenticacion real sin guardar tokens ni asumir una URL publica del proveedor.
 */
export async function archiveProviderAttachment(input: {
  companyId: string;
  occurredAt: string;
  attachment: MessageAttachment;
  download: ProviderMediaDownload;
}): Promise<MessageAttachment> {
  const downloaded = await input.download(input.attachment);
  const stored = await storeMediaObject({
    companyId: input.companyId,
    occurredAt: input.occurredAt,
    bytes: downloaded.bytes,
    mimeType: downloaded.mimeType ?? input.attachment.mimeType,
    fileName: downloaded.fileName ?? input.attachment.fileName,
  });
  return {
    ...input.attachment,
    storageKey: stored.storageKey,
    storageUrl: stored.storageUrl,
    mimeType: stored.mimeType,
    fileName: stored.fileName,
    sizeBytes: stored.sizeBytes,
    sha256: stored.sha256,
  };
}
