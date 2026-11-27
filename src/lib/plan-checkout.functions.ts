import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveCompanyIdCached } from "@/lib/company-cache";
import { z } from "zod";

export const createPlanCheckoutBrlFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        planSlug: z.string().trim().min(1).max(60),
        cycle: z.enum(["month", "annual"]).default("month"),
        metodo: z.enum(["pix", "card"]).default("pix"),
      })
      .parse(data),
  )
  .handler(async ({ context, data }) => {
    const companyId = await resolveCompanyIdCached(context.supabase, context.userId);
    if (!companyId) throw new Error("Empresa não encontrada.");
    const { assertPermission } = await import("./permissions.server");
    await assertPermission(context.supabase, companyId, context.userId, "configuracoes.billing");
    const { createPlanChargeBrl } = await import("./billing/charges.server");
    return createPlanChargeBrl({
      companyId,
      planSlug: data.planSlug,
      cycle: data.cycle,
      metodo: data.metodo,
    });
  });

export const requestManualUsdChargeFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        planSlug: z.string().trim().min(1).max(60),
        cycle: z.enum(["month", "annual"]).default("month"),
        metodo: z.enum(["binance_usdt", "zelle", "pago_movil"]),
        reference: z.string().trim().min(3, "Informe a referência do comprovante").max(120),
        notes: z.string().max(200).optional(),
      })
      .parse(data),
  )
  .handler(async ({ context, data }) => {
    const companyId = await resolveCompanyIdCached(context.supabase, context.userId);
    if (!companyId) throw new Error("Empresa não encontrada.");
    const { assertPermission } = await import("./permissions.server");
    await assertPermission(context.supabase, companyId, context.userId, "configuracoes.billing");
    const { createManualUsdCharge } = await import("./billing/charges.server");
    return createManualUsdCharge({
      companyId,
      planSlug: data.planSlug,
      cycle: data.cycle,
      metodo: data.metodo,
      reference: data.reference,
      notes: data.notes,
    });
  });

export const reconcileAnnualAndUsdChargeMasterFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ chargeId: z.string().uuid() }).parse(data))
  .handler(async ({ context, data }) => {
    const { data: isSuper } = await context.supabase.rpc("is_super_admin");
    if (!isSuper) throw new Error("Acesso negado");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: charge } = await (supabaseAdmin as any)
      .from("billing_charge")
      .select("id, company_id, provider, ciclo_ref, status")
      .eq("id", data.chargeId)
      .maybeSingle();
    if (!charge || charge.status !== "paid") return { adjusted: false };

    const { data: item } = await (supabaseAdmin as any)
      .from("billing_charge_item")
      .select("ref_id, ref_slug, tipo")
      .eq("charge_id", charge.id)
      .in("tipo", ["plan", "plano"])
      .maybeSingle();

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (charge.provider === "manual_usd") {
      updates.moeda = "USD";
      updates.provider = "manual_usd";
    }
    if (String(charge.ciclo_ref || "").startsWith("annual:")) {
      const oneYear = new Date(Date.now() + 365 * 86400000).toISOString();
      updates.current_period_end = oneYear;
    }
    if (item?.ref_id) {
      updates.plan_id = item.ref_id;
    }
    await (supabaseAdmin as any)
      .from("subscription")
      .update(updates)
      .eq("company_id", charge.company_id);

    if (item?.ref_id) {
      const { data: plan } = await (supabaseAdmin as any)
        .from("plan")
        .select("creditos_mensais")
        .eq("id", item.ref_id)
        .maybeSingle();
      if (plan?.creditos_mensais) {
        const { data: comp } = await (supabaseAdmin as any)
          .from("company")
          .select("creditos_saldo")
          .eq("id", charge.company_id)
          .maybeSingle();
        if (Number(comp?.creditos_saldo ?? 0) < Number(plan.creditos_mensais)) {
          await (supabaseAdmin as any)
            .from("company")
            .update({ creditos_saldo: Number(plan.creditos_mensais) })
            .eq("id", charge.company_id);
        }
      }
    }
    return { adjusted: true };
  });
