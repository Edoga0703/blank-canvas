import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/**
 * Busca estatísticas de indicação do parceiro logado.
 */
export const getPartnerReferralStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: partner, error: pErr } = await context.supabase
      .from("parceiro")
      .select("*")
      .eq("user_id", context.userId)
      .maybeSingle();
    
    if (pErr) throw pErr;
    if (!partner) return null;

    // Busca as indicações vinculadas
    const { data: referrals, count, error: rErr } = await context.supabase
      .from("parceiro_indicacao")
      .select("*, company:company(nome, status_cobranca, created_at, trial_ate)", { count: "exact" })
      .eq("parceiro_id", partner.id)
      .order("created_at", { ascending: false });

    if (rErr) throw rErr;

    const desde = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const { data: cliques } = await context.supabase
      .from("parceiro_clique")
      .select("created_at")
      .eq("parceiro_id", partner.id);

    const list = referrals ?? [];
    const statusOf = (r: any) => (r.company as any)?.status_cobranca as string | undefined;
    const cliquesTotal = (cliques ?? []).length;

    return {
      partner,
      referrals: list,
      totalCount: count ?? 0,
      metrics: {
        cliques: cliquesTotal,
        cliques30d: (cliques ?? []).filter((c: any) => c.created_at >= desde).length,
        indicacoes: list.length,
        ativos: list.filter((r) => statusOf(r) === "ativo").length,
        trial: list.filter((r) => statusOf(r) === "trial").length,
        inadimplentes: list.filter((r) =>
          ["inadimplente", "atrasado", "past_due", "bloqueado"].includes(statusOf(r) ?? ""),
        ).length,
        conversao: cliquesTotal > 0 ? Math.round((list.length / cliquesTotal) * 100) : 0,
      },
    };
  });

/**
 * Solicita o saque de comissões disponíveis.
 */
export const requestPartnerWithdrawal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ amountCents: z.number().positive() }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: partner } = await context.supabase
      .from("parceiro")
      .select("id, saldo_atual_cents")
      .eq("user_id", context.userId)
      .maybeSingle();

    if (!partner) throw new Error("Parceiro não encontrado.");
    if (partner.saldo_atual_cents < data.amountCents) {
      throw new Error("Saldo insuficiente.");
    }

    const { error } = await context.supabase
      .from("parceiro_saque")
      .insert({
        parceiro_id: partner.id,
        valor_cents: data.amountCents,
        status: "pendente"
      });

    if (error) throw error;
    return { ok: true };
  });
