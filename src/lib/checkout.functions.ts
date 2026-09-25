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

    // Trial days: do plano escolhido (ou starter como fallback).
    let trialDays = 7;
    let planSlug = data.plano_slug;
    if (planSlug) {
      const { data: plan } = await supabaseAdmin
        .from("plan")
        .select("trial_days, slug")
        .eq("slug", planSlug)
        .maybeSingle();
      if (plan?.trial_days != null) trialDays = Number(plan.trial_days) || trialDays;
    } else {
      const { data: starter } = await supabaseAdmin
        .from("plan")
        .select("trial_days, slug")
        .eq("slug", "starter")
        .maybeSingle();
      if (starter?.trial_days != null) trialDays = Number(starter.trial_days) || trialDays;
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

    return { companyId: companyId as string };
  });
