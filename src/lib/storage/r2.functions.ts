import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveCompanyIdCached } from "@/lib/company-cache";

export const prepareR2Upload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { fileName?: string | null; mimeType?: string | null; sizeBytes: number }) => ({
      fileName: input?.fileName?.trim().slice(0, 160) || "archivo",
      mimeType: input?.mimeType?.trim().slice(0, 120) || "application/octet-stream",
      sizeBytes: Number(input?.sizeBytes || 0),
    }),
  )
  .handler(async ({ context, data }) => {
    const companyId = await resolveCompanyIdCached(context.supabase, context.userId);
    const { createR2UploadTarget } = await import("@/lib/storage/r2.server");
    return createR2UploadTarget({ companyId, ...data });
  });
