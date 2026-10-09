import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Cancelamento pelo próprio cliente.
 * - Se estiver em trial → cancela imediatamente (perde acesso).
 * - Se estiver ativo → marca cancel_at_period_end=true (mantém acesso até o fim do período).
 * - Se `imediato` for true e estiver ativo, cancela na hora.
 */
export const cancelMySubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { companyId: string; imediato?: boolean }) => ({
    companyId: String(d.companyId),
    imediato: !!d.imediato,
  }))
  .handler(async ({ context, data }) => {
    // Valida acesso do usuário à empresa (owner/admin)
    const { data: membership, error: mErr } = await context.supabase
      .from("company_user")
      .select("role, ativo")
      .eq("company_id", data.companyId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (mErr) throw new Error(mErr.message);
    if (!membership?.ativo || !["owner", "admin"].includes(String(membership.role))) {
      throw new Error("Apenas o dono ou admin da empresa pode cancelar a assinatura.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: sub } = await supabaseAdmin
      .from("subscription")
      .select("id, status, current_period_end")
      .eq("company_id", data.companyId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const now = new Date().toISOString();
    const isTrial = sub?.status === "trialing";
    const isActive = sub?.status === "active";

    if (!sub) {
      // Sem subscription: apenas marca empresa como cancelada.
      await supabaseAdmin.from("company").update({ status_cobranca: "cancelado" }).eq("id", data.companyId);
      return { ok: true, mode: "immediate" as const };
    }

    if (isTrial || data.imediato || !isActive) {
      await supabaseAdmin
        .from("subscription")
        .update({ status: "canceled", canceled_at: now, cancel_at_period_end: false })
        .eq("id", sub.id);
      await supabaseAdmin.from("company").update({ status_cobranca: "cancelado" }).eq("id", data.companyId);
      try {
        await supabaseAdmin.from("audit_log").insert({
          company_id: data.companyId,
          user_id: context.userId,
          acao: "subscription_cancel_self",
          recurso: "subscription",
          detalhes: { mode: "immediate", was: sub.status },
        });
      } catch {}
      return { ok: true, mode: "immediate" as const };
    }

    // Ativo → cancela no fim do período
    await supabaseAdmin
      .from("subscription")
      .update({ cancel_at_period_end: true, canceled_at: now })
      .eq("id", sub.id);
    try {
      await supabaseAdmin.from("audit_log").insert({
        company_id: data.companyId,
        user_id: context.userId,
        acao: "subscription_cancel_self",
        recurso: "subscription",
        detalhes: { mode: "period_end", period_end: sub.current_period_end },
      });
    } catch {}
    return { ok: true, mode: "period_end" as const, periodEnd: sub.current_period_end };
  });

/** Reativa se o cancelamento ainda for cancel_at_period_end e a assinatura estiver ativa. */
export const reactivateMySubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { companyId: string }) => ({ companyId: String(d.companyId) }))
  .handler(async ({ context, data }) => {
    const { data: membership } = await context.supabase
      .from("company_user")
      .select("role, ativo")
      .eq("company_id", data.companyId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!membership?.ativo || !["owner", "admin"].includes(String(membership.role))) {
      throw new Error("Sem permissão.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("subscription")
      .update({ cancel_at_period_end: false, canceled_at: null })
      .eq("company_id", data.companyId)
      .eq("status", "active");
    return { ok: true };
  });
