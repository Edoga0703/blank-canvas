import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Saldo + últimos 20 lançamentos para a empresa atual
export const getMyCredits = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: cu } = await context.supabase
      .from("company_user")
      .select("company_id")
      .eq("user_id", context.userId)
      .eq("ativo", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!cu) return { saldo: 0, origem: "trial", resetam_em: null, ledger: [] as any[] };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [comp, led] = await Promise.all([
      supabaseAdmin.from("company").select("creditos_saldo, creditos_origem, creditos_resetam_em").eq("id", cu.company_id).maybeSingle(),
      supabaseAdmin.from("credit_ledger").select("delta, saldo_apos, motivo, ref, created_at").eq("company_id", cu.company_id).order("created_at", { ascending: false }).limit(20),
    ]);
    return {
      saldo: comp.data?.creditos_saldo ?? 0,
      origem: comp.data?.creditos_origem ?? "trial",
      resetam_em: comp.data?.creditos_resetam_em ?? null,
      ledger: led.data ?? [],
    };
  });

// Admin: adiciona/remove créditos numa empresa
export const adminGrantCredits = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { companyId: string; qtd: number; motivo?: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: isSuper } = await context.supabase.rpc("is_super_admin");
    if (!isSuper) throw new Error("Apenas super admin");
    if (!data.qtd) throw new Error("Quantidade inválida");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: comp, error: e1 } = await supabaseAdmin
      .from("company")
      .select("creditos_saldo")
      .eq("id", data.companyId)
      .maybeSingle();
    if (e1 || !comp) throw new Error("Empresa não encontrada");
    const novo = Math.max(0, (comp.creditos_saldo ?? 0) + data.qtd);
    const { error: e2 } = await supabaseAdmin
      .from("company")
      .update({ creditos_saldo: novo })
      .eq("id", data.companyId);
    if (e2) throw new Error(e2.message);
    await supabaseAdmin.from("credit_ledger").insert({
      company_id: data.companyId,
      delta: data.qtd,
      saldo_apos: novo,
      motivo: data.motivo || "bonus_admin",
      created_by: context.userId,
    });
    return { saldo: novo };
  });
