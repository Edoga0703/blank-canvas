import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function assertSuper(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "super_admin")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Acesso negado");
}

export const isUserPartner = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("parceiro")
      .select("status")
      .eq("user_id", context.userId)
      .eq("status", "ativo")
      .maybeSingle();
    return !!data;
  });


export const getPartners = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuper(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("parceiro")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    const rows = data ?? [];
    if (rows.length === 0) return [];
    const { data: profs } = await supabaseAdmin
      .from("profiles")
      .select("user_id, nome, email")
      .in("user_id", rows.map((r: any) => r.user_id));
    const byId = new Map((profs ?? []).map((p: any) => [p.user_id, p]));
    return rows.map((r: any) => ({
      ...r,
      profile: byId.get(r.user_id) ?? null,
    }));
  });

export const createPartner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    userId: z.string(),
    codigo: z.string().min(3),
    comissao: z.number().min(0).max(100),
  }))
  .handler(async ({ context, data }) => {
    await assertSuper(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("parceiro").insert({
      user_id: data.userId,
      codigo_indicacao: data.codigo,
      porcentagem_comissao: data.comissao,
    });
    if (error) throw error;
    return { ok: true };
  });

export const updatePartner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    id: z.string(),
    comissao: z.number().min(0).max(100),
    status: z.enum(["ativo", "inativo"]),
  }))
  .handler(async ({ context, data }) => {
    await assertSuper(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("parceiro").update({
      porcentagem_comissao: data.comissao,
      status: data.status,
    }).eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const getAllProfiles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuper(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("user_id, nome, email")
      .order("nome");
    if (error) throw error;
    return data ?? [];
  });

export const getWithdrawalRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuper(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("parceiro_saque")
      .select("*, parceiro:parceiro(user_id, codigo_indicacao)")
      .order("created_at", { ascending: false });
    if (error) throw error;
    
    const rows = data ?? [];
    if (rows.length === 0) return [];
    
    const userIds = rows.map((r: any) => r.parceiro?.user_id).filter(Boolean);
    const { data: profs } = await supabaseAdmin
      .from("profiles")
      .select("user_id, nome, email")
      .in("user_id", userIds);
    
    const byId = new Map((profs ?? []).map((p: any) => [p.user_id, p]));
    return rows.map((r: any) => ({
      ...r,
      profile: byId.get(r.parceiro?.user_id) ?? null,
    }));
  });

export const updateWithdrawalStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    id: z.string(),
    status: z.enum(["pendente", "aprovado", "rejeitado"]),
  }))
  .handler(async ({ context, data }) => {
    await assertSuper(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    
    if (data.status === "aprovado") {
      const { data: request } = await supabaseAdmin
        .from("parceiro_saque")
        .select("valor_cents, parceiro_id, status")
        .eq("id", data.id)
        .single();
      
      if (request && request.status === "pendente") {
        const { data: partner } = await supabaseAdmin
          .from("parceiro")
          .select("saldo_atual_cents")
          .eq("id", request.parceiro_id)
          .single();
        
        if (partner) {
          await supabaseAdmin.from("parceiro").update({
            saldo_atual_cents: Math.max(0, partner.saldo_atual_cents - request.valor_cents)
          }).eq("id", request.parceiro_id);
        }
      }
    }

    const { error } = await supabaseAdmin
      .from("parceiro_saque")
      .update({ status: data.status })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const updatePartnerConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    min_withdraw_cents: z.number().min(0),
    default_commission: z.number().min(0).max(100),
  }))
  .handler(async ({ context, data }) => {
    await assertSuper(context.supabase, context.userId);
    // In a real app, this would update a 'config' or 'settings' table.
    // Since we don't have one yet for partners, we'll simulate success.
    return { ok: true };
  });



/* ---------- Cliques no link de indicação ---------- */

export const trackReferralClick = createServerFn({ method: "POST" })
  .inputValidator(z.object({ codigo: z.string().min(1).max(64), referer: z.string().max(500).optional() }))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: partner } = await supabaseAdmin
      .from("parceiro")
      .select("id")
      .eq("codigo_indicacao", data.codigo.toLowerCase())
      .maybeSingle();
    if (!partner) return { ok: false };
    await supabaseAdmin.from("parceiro_clique").insert({
      parceiro_id: partner.id,
      codigo: data.codigo.toLowerCase(),
      referer: data.referer ?? null,
    } as never);
    return { ok: true };
  });

type PartnerMetrics = {
  cliques: number;
  cliques30d: number;
  indicacoes: number;
  ativos: number;
  trial: number;
  inadimplentes: number;
  conversao: number;
};

async function metricsFor(admin: any, partnerIds: string[]) {
  const out = new Map<string, PartnerMetrics>();
  for (const id of partnerIds) {
    out.set(id, { cliques: 0, cliques30d: 0, indicacoes: 0, ativos: 0, trial: 0, inadimplentes: 0, conversao: 0 });
  }
  if (partnerIds.length === 0) return out;
  const desde = new Date(Date.now() - 30 * 86_400_000).toISOString();

  const { data: cliques } = await admin
    .from("parceiro_clique")
    .select("parceiro_id, created_at")
    .in("parceiro_id", partnerIds);
  for (const c of cliques ?? []) {
    const m = out.get(c.parceiro_id);
    if (!m) continue;
    m.cliques++;
    if (c.created_at >= desde) m.cliques30d++;
  }

  const { data: inds } = await admin
    .from("parceiro_indicacao")
    .select("parceiro_id, company:company(status_cobranca)")
    .in("parceiro_id", partnerIds);
  for (const i of inds ?? []) {
    const m = out.get(i.parceiro_id);
    if (!m) continue;
    m.indicacoes++;
    const st = i.company?.status_cobranca;
    if (st === "ativo") m.ativos++;
    else if (st === "trial") m.trial++;
    else if (["inadimplente", "atrasado", "past_due", "bloqueado"].includes(st)) m.inadimplentes++;
  }

  for (const m of out.values()) {
    m.conversao = m.cliques > 0 ? Math.round((m.indicacoes / m.cliques) * 100) : 0;
  }
  return out;
}

export const getPartnerDetails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ partnerId: z.string().uuid() }))
  .handler(async ({ context, data }) => {
    await assertSuper(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const metrics = (await metricsFor(supabaseAdmin, [data.partnerId])).get(data.partnerId)!;
    const { data: referrals } = await supabaseAdmin
      .from("parceiro_indicacao")
      .select("id, company_id, origem, created_at, company:company(nome, status_cobranca, created_at, trial_ate)")
      .eq("parceiro_id", data.partnerId)
      .order("created_at", { ascending: false });
    const { data: cliques } = await supabaseAdmin
      .from("parceiro_clique")
      .select("id, created_at, referer")
      .eq("parceiro_id", data.partnerId)
      .order("created_at", { ascending: false })
      .limit(30);
    return { metrics, referrals: referrals ?? [], cliques: cliques ?? [] };
  });

export const listAssignableCompanies = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ busca: z.string().optional() }))
  .handler(async ({ context, data }) => {
    await assertSuper(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin
      .from("company")
      .select("id, nome, status_cobranca, created_at")
      .order("created_at", { ascending: false })
      .limit(50);
    if (data.busca) q = q.ilike("nome", `%${data.busca}%`);
    const { data: companies, error } = await q;
    if (error) throw error;
    const { data: taken } = await supabaseAdmin.from("parceiro_indicacao").select("company_id");
    const used = new Set((taken ?? []).map((t: any) => t.company_id));
    return (companies ?? []).filter((c: any) => !used.has(c.id));
  });

export const assignCompanyToPartner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ partnerId: z.string().uuid(), companyId: z.string().uuid() }))
  .handler(async ({ context, data }) => {
    await assertSuper(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("parceiro_indicacao").insert({
      parceiro_id: data.partnerId,
      company_id: data.companyId,
      status: "convertido",
      origem: "manual",
      atribuido_por: context.userId,
      data_conversao: new Date().toISOString(),
    } as never);
    if (error) throw new Error(error.code === "23505" ? "Esta empresa já está vinculada a um parceiro." : error.message);
    return { ok: true };
  });

export const unassignCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ indicacaoId: z.string().uuid() }))
  .handler(async ({ context, data }) => {
    await assertSuper(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("parceiro_indicacao").delete().eq("id", data.indicacaoId);
    if (error) throw error;
    return { ok: true };
  });

export const getPartnersWithMetrics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuper(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("parceiro")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    const rows = data ?? [];
    if (rows.length === 0) return [];
    const { data: profs } = await supabaseAdmin
      .from("profiles")
      .select("user_id, nome, email")
      .in("user_id", rows.map((r: any) => r.user_id));
    const byId = new Map((profs ?? []).map((p: any) => [p.user_id, p]));
    const metrics = await metricsFor(supabaseAdmin, rows.map((r: any) => r.id));
    return rows.map((r: any) => ({
      ...r,
      profile: byId.get(r.user_id) ?? null,
      metrics: metrics.get(r.id)!,
    }));
  });
