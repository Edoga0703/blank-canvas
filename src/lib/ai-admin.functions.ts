import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveCompanyIdCached } from "@/lib/company-cache";
import { z } from "zod";

async function assertSuperAdmin(supabase: any) {
  const { data, error } = await supabase.rpc("is_super_admin");
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Acesso negado");
}

const SavePoolKeySchema = z.object({
  id: z.string().uuid().optional(),
  provider: z.enum(["drael", "gemini", "openai", "anthropic", "groq"]).default("drael"),
  alias: z.string().trim().min(1, "Informe um apelido").max(80),
  api_key: z.string().optional(),
  max_concurrency: z.number().int().min(1).max(50).default(4),
  priority: z.number().int().min(1).max(1000).default(1),
  active: z.boolean().default(true),
});

export const listAiPoolKeysFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperAdmin(context.supabase);
    const { listAiPoolKeysServer } = await import("./ai-admin.server");
    return listAiPoolKeysServer();
  });

export const saveAiPoolKeyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => SavePoolKeySchema.parse(data))
  .handler(async ({ context, data }) => {
    await assertSuperAdmin(context.supabase);
    const { saveAiPoolKeyServer } = await import("./ai-admin.server");
    return saveAiPoolKeyServer(data);
  });

export const deleteAiPoolKeyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ context, data }) => {
    await assertSuperAdmin(context.supabase);
    const { deleteAiPoolKeyServer } = await import("./ai-admin.server");
    return deleteAiPoolKeyServer(data.id);
  });

export const resetAiPoolKeyCooldownFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ context, data }) => {
    await assertSuperAdmin(context.supabase);
    const { resetAiPoolKeyCooldownServer } = await import("./ai-admin.server");
    return resetAiPoolKeyCooldownServer(data.id);
  });

export const testAiPoolKeyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ context, data }) => {
    await assertSuperAdmin(context.supabase);
    const { testAiPoolKeyServer } = await import("./ai-admin.server");
    return testAiPoolKeyServer(data.id);
  });

export const getMasterAiUsageSummaryFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        range: z.enum(["24h", "7d", "30d", "mes"]).default("30d"),
      })
      .optional()
      .transform((v) => v ?? { range: "30d" as const })
      .parse(data),
  )
  .handler(async ({ context, data }) => {
    await assertSuperAdmin(context.supabase);
    const { getMasterAiUsageSummaryServer } = await import("./ai-admin.server");
    return getMasterAiUsageSummaryServer(data.range);
  });

export const getMyCompanyAiUsageFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        days: z.number().int().min(1).max(365).optional(),
      })
      .optional()
      .transform((v) => ({ days: v?.days ?? 30 }))
      .parse(data),
  )
  .handler(async ({ context, data }) => {
    const companyId = await resolveCompanyIdCached(context.supabase, context.userId);
    const { assertPermission } = await import("./permissions.server");
    await assertPermission(context.supabase, companyId, context.userId, "ai_usage.view");
    const { getMyCompanyAiUsageServer } = await import("./ai-admin.server");
    return getMyCompanyAiUsageServer(companyId, data.days);
  });
