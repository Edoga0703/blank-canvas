import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function assertSuper(supabase: any) {
  const { data, error } = await supabase.rpc("is_super_admin");
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Acesso negado");
}

const SavePlanSchema = z.object({
  id: z.string().uuid().optional().nullable(),
  slug: z.string().trim().min(2).max(60),
  nome: z.string().trim().min(2).max(100),
  descricao: z.string().max(500).optional().nullable(),
  preco_cents: z.number().int().min(0),
  preco_usd_cents: z.number().int().min(0).default(0),
  preco_anual_brl_cents: z.number().int().min(0).default(0),
  preco_anual_usd_cents: z.number().int().min(0).default(0),
  desconto_anual_pct: z.number().int().min(0).max(90).default(20),
  moeda: z.string().trim().min(3).max(6).default("BRL"),
  intervalo: z.enum(["month", "year"]).default("month"),
  trial_days: z.number().int().min(0).max(365).default(7),
  limite_instancias: z.number().int().min(0).max(10000).default(1),
  limite_conexoes_oficiais: z.number().int().min(0).max(100000).default(10),
  limite_usuarios: z.number().int().min(1).max(10000).default(1),
  creditos_mensais: z.number().int().min(0).default(1500),
  creditos_trial: z.number().int().min(0).default(300),
  features: z.record(z.string(), z.boolean()).default({}),
  checkout_url: z.string().max(500).optional().nullable(),
  paddle_product_id: z.string().max(200).optional().nullable(),
  paddle_price_id: z.string().max(200).optional().nullable(),
  destaque: z.boolean().default(false),
  ativo: z.boolean().default(true),
  ordem: z.number().int().default(0),
});

export const listPlansMasterFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuper(context.supabase);
    const { listPlansMasterServer } = await import("./plan-admin.server");
    return listPlansMasterServer();
  });

export const savePlanMasterFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => SavePlanSchema.parse(data))
  .handler(async ({ context, data }) => {
    await assertSuper(context.supabase);
    const { savePlanMasterServer } = await import("./plan-admin.server");
    return savePlanMasterServer(data);
  });

export const togglePlanActiveMasterFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ id: z.string().uuid(), ativo: z.boolean() }).parse(data),
  )
  .handler(async ({ context, data }) => {
    await assertSuper(context.supabase);
    const { togglePlanActiveMasterServer } = await import("./plan-admin.server");
    return togglePlanActiveMasterServer(data.id, data.ativo);
  });

export const deletePlanMasterFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ context, data }) => {
    await assertSuper(context.supabase);
    const { deletePlanMasterServer } = await import("./plan-admin.server");
    return deletePlanMasterServer(data.id);
  });

export const listPublicPlansFn = createServerFn({ method: "GET" })
  .handler(async () => {
    const { listPublicPlansServer } = await import("./plan-admin.server");
    return listPublicPlansServer();
  });
