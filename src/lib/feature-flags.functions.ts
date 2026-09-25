import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type FeatureRollout = "interno" | "beta" | "publico";

export type FeatureFlag = {
  id: string;
  key: string;
  nome: string;
  descricao: string | null;
  categoria: string;
  rollout: FeatureRollout;
  beta_company_ids: string[];
  parent_key: string | null;
  ordem: number;
};

export const listFeatureFlags = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("feature_flags")
      .select("*")
      .order("categoria", { ascending: true })
      .order("ordem", { ascending: true })
      .order("nome", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as FeatureFlag[];
  });

export const updateFeatureFlag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    key: string;
    rollout?: FeatureRollout;
    beta_company_ids?: string[];
  }) => input)
  .handler(async ({ data, context }) => {
    const { data: isSuper } = await context.supabase.rpc("is_super_admin");
    if (!isSuper) throw new Error("Acesso negado");

    const { data: before } = await context.supabase
      .from("feature_flags").select("*").eq("key", data.key).maybeSingle();
    if (!before) throw new Error("Flag não encontrada");

    const patch: { rollout?: FeatureRollout; beta_company_ids?: string[] } = {};
    if (data.rollout) patch.rollout = data.rollout;
    if (data.beta_company_ids) patch.beta_company_ids = data.beta_company_ids;

    const { data: after, error } = await context.supabase
      .from("feature_flags").update(patch).eq("key", data.key).select("*").maybeSingle();
    if (error) throw new Error(error.message);

    await context.supabase.from("feature_flag_audit").insert({
      flag_key: data.key,
      changed_by: context.userId,
      antes: before,
      depois: after,
    });

    return after as FeatureFlag;
  });
