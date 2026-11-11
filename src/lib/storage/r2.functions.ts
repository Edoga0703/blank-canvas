import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveCompanyIdCached } from "@/lib/company-cache";

export const prepareR2Upload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: { fileName?: string | null; mimeType?: string | null; sizeBytes: number; storageAccountId?: string | null }) => ({
      fileName: input?.fileName?.trim().slice(0, 160) || "archivo",
      mimeType: input?.mimeType?.trim().slice(0, 120) || "application/octet-stream",
      sizeBytes: Number(input?.sizeBytes || 0),
      storageAccountId: input?.storageAccountId || null,
    }),
  )
  .handler(async ({ context, data }) => {
    const companyId = await resolveCompanyIdCached(context.supabase, context.userId);
    const { createR2UploadTarget } = await import("@/lib/storage/r2.server");
    return await createR2UploadTarget({ companyId, ...data });
  });

export const uploadR2Direct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: { fileName?: string | null; mimeType?: string | null; base64: string; storageAccountId?: string | null }) => ({
      fileName: input?.fileName?.trim().slice(0, 160) || "archivo",
      mimeType: input?.mimeType?.trim().slice(0, 120) || "application/octet-stream",
      base64: String(input?.base64 || ""),
      storageAccountId: input?.storageAccountId || null,
    }),
  )
  .handler(async ({ context, data }) => {
    const companyId = await resolveCompanyIdCached(context.supabase, context.userId);
    const { storeMediaObject, createR2DownloadUrl } = await import("@/lib/storage/r2.server");
    const commaIdx = data.base64.indexOf(",");
    const rawB64 = commaIdx !== -1 ? data.base64.slice(commaIdx + 1) : data.base64;
    const bytes = Buffer.from(rawB64, "base64");
    const stored = await storeMediaObject({
      companyId,
      bytes,
      mimeType: data.mimeType,
      fileName: data.fileName,
      storageAccountId: data.storageAccountId,
    });
    const downloadUrl = stored.storageUrl || createR2DownloadUrl(stored.storageKey, undefined, stored.storageAccountId);
    return {
      storageKey: stored.storageKey,
      downloadUrl,
      mimeType: stored.mimeType,
      storageAccountId: stored.storageAccountId,
    };
  });
