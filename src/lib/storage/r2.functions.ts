import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveCompanyIdFor } from "@/lib/company-cache";

export const prepareR2Upload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId?: string | null; fileName?: string | null; mimeType?: string | null; sizeBytes: number }) => ({
    companyId: input?.companyId?.trim() || null,
    fileName: input?.fileName?.trim().slice(0, 160) || "archivo",
    mimeType: input?.mimeType?.trim().slice(0, 120) || "application/octet-stream",
    sizeBytes: Number(input?.sizeBytes || 0),
  }))
  .handler(async ({ context, data }) => {
    if (!Number.isSafeInteger(data.sizeBytes) || data.sizeBytes <= 0) throw new Error("Tamaño de archivo inválido.");
    const companyId = await resolveCompanyIdFor(context.supabase, context.userId, data.companyId);
    const { createR2UploadTarget } = await import("@/lib/storage/r2.server");
    return createR2UploadTarget({ companyId, fileName: data.fileName, mimeType: data.mimeType, sizeBytes: data.sizeBytes });
  });
