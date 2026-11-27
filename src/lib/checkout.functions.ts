import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { slugify } from "@/lib/tenant";

export const createCheckoutCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { nome: string; plano_slug?: string }) => {
    const nome = String(d.nome || "").trim();
    if (nome.length < 2) throw new Error("Informe o nome da sua empresa.");
    const plano_slug = d.plano_slug ? String(d.plano_slug).toLowerCase().trim() : null;
    return { nome, plano_slug };
  })
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Trial days e créditos iniciais do plano escolhido (ou starter como fallback).
    let trialDays = 7;
    let creditosTrial = 300;
    let planSlug = data.plano_slug;
    if (planSlug) {
      const { data: plan } = await supabaseAdmin
        .from("plan")
        .select("trial_days, slug, creditos_trial")
        .eq("slug", planSlug)
        .maybeSingle();
      if (plan?.trial_days != null) trialDays = Number(plan.trial_days) || trialDays;
      if ((plan as any)?.creditos_trial != null && Number((plan as any).creditos_trial) > 0) {
        creditosTrial = Number((plan as any).creditos_trial);
      }
    } else {
      const { data: starter } = await supabaseAdmin
        .from("plan")
        .select("trial_days, slug, creditos_trial")
        .eq("slug", "starter")
        .maybeSingle();
      if (starter?.trial_days != null) trialDays = Number(starter.trial_days) || trialDays;
      if ((starter as any)?.creditos_trial != null && Number((starter as any).creditos_trial) > 0) {
        creditosTrial = Number((starter as any).creditos_trial);
      }
      planSlug = starter?.slug ?? null;
    }

    const slug = `${slugify(data.nome)}-${Math.random().toString(36).slice(2, 6)}`;
    const trialAte = new Date(Date.now() + trialDays * 86400000).toISOString();

    // A trava por usuário no banco torna a verificação + criação atômicas.
    // Chamadas simultâneas recebem o mesmo companyId, sem criar duplicatas.
    const { data: companyId, error: provisionError } = await supabaseAdmin.rpc("provision_company_atomic", {
      _user_id: context.userId,
      _nome: data.nome,
      _slug: slug,
      _trial_ate: trialAte,
      _plan_slug: planSlug ?? undefined,
    });
    if (provisionError || !companyId) {
      throw new Error(provisionError?.message || "Falha ao criar empresa");
    }

    // Garantir saldo inicial de créditos de IA no trial caso provision_company_atomic tenha deixado em 0
    try {
      const { data: compRow } = await supabaseAdmin
        .from("company")
        .select("creditos_saldo")
        .eq("id", companyId)
        .maybeSingle();
      if (Number(compRow?.creditos_saldo ?? 0) <= 0 && creditosTrial > 0) {
        await supabaseAdmin
          .from("company")
          .update({ creditos_saldo: creditosTrial })
          .eq("id", companyId);
      }
    } catch {}

    return { companyId: companyId as string };
  });
