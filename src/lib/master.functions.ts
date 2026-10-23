import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { slugify } from "@/lib/tenant";

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

export const masterKpis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuper(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: companies }, { count: msgCount }, { count: cardsCount }, { data: subscriptions }] = await Promise.all([
      supabaseAdmin.from("company").select("id, status_cobranca, trial_ate, created_at"),
      supabaseAdmin.from("mensagens").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("crm_cards").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("subscription").select("status, company_id, created_at, plan:plan(id, nome, preco_cents)"),
    ]);
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const all = companies ?? [];
    const subs = subscriptions ?? [];
    const activeSubs = subs.filter((s: any) => s.status === "active");
    const mrr = activeSubs.reduce((sum: number, s: any) => sum + (s.plan?.preco_cents ?? 0), 0);
    const emAtraso = subs.filter((s: any) => s.status === "past_due").length;
    const churn = subs.filter((s: any) => s.status === "canceled").length;

    const stats = {
      total: all.length,
      ativas: all.filter((c: any) => c.status_cobranca === "ativo").length,
      trial: all.filter((c: any) => c.status_cobranca === "trial").length,
      suspensas: all.filter((c: any) => c.status_cobranca === "suspenso").length,
      novasMes: all.filter((c: any) => new Date(c.created_at).getTime() >= monthStart).length,
      mensagens: msgCount ?? 0,
      cards: cardsCount ?? 0,
      assinaturasAtivas: activeSubs.length,
      assinaturasTrial: subs.filter((s: any) => s.status === "trialing").length,
      mrr,
      arpu: activeSubs.length ? Math.round(mrr / activeSubs.length) : 0,
      emAtraso,
      churn,
    };

    // Receita por plano (MRR)
    const byPlanMap = new Map<string, { nome: string; mrr: number; workspaces: number }>();
    for (const s of activeSubs) {
      const p = (s as any).plan;
      if (!p) continue;
      const key = p.id ?? p.nome ?? "sem-plano";
      const prev = byPlanMap.get(key) ?? { nome: p.nome ?? "Sem plano", mrr: 0, workspaces: 0 };
      prev.mrr += p.preco_cents ?? 0;
      prev.workspaces += 1;
      byPlanMap.set(key, prev);
    }
    const receitaPorPlano = Array.from(byPlanMap.values()).sort((a, b) => b.mrr - a.mrr);

    // Crescimento (últimos 6 meses): novos cadastros por mês + ativos pagantes até o fim de cada mês
    const series: { mes: string; novos: number; ativos: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const next = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      const novos = all.filter((c: any) => {
        const t = new Date(c.created_at).getTime();
        return t >= d.getTime() && t < next.getTime();
      }).length;
      const ativos = activeSubs.filter((s: any) => {
        const t = new Date((s as any).created_at).getTime();
        return t < next.getTime();
      }).length;
      series.push({ mes: d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", ""), novos, ativos });
    }
    return { stats, series, receitaPorPlano };
  });

// Agregador único da Visão geral (KPIs + alertas + gráficos) em 1 request.
export const masterOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuper(context.supabase, context.userId);
    const { computeMasterOverview } = await import("./master-overview.server");
    return computeMasterOverview();
  });


export const listMasterSubscriptions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuper(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("subscription")
      .select("*, plan:plan(id,nome,slug,preco_cents,moeda,intervalo), company:company(id,nome,status_cobranca,email_corporativo,trial_ate,creditos_saldo,created_at)")
      .order("created_at", { ascending: false });
    if (error) throw error;
    const rows = data ?? [];
    const companyIds = rows.map((r: any) => r.company_id);
    let ownersByCompany: Record<string, { user_id: string; email: string | null; nome: string | null }> = {};
    if (companyIds.length) {
      const { data: cu } = await supabaseAdmin
        .from("company_user")
        .select("company_id, user_id, role, created_at, ativo")
        .in("company_id", companyIds)
        .eq("ativo", true)
        .order("created_at", { ascending: true });
      const firstByCompany: Record<string, any> = {};
      for (const r of cu ?? []) {
        const cid = (r as any).company_id;
        if ((r as any).role === "owner" && !firstByCompany[cid]) firstByCompany[cid] = r;
        else if (!firstByCompany[cid]) firstByCompany[cid] = r;
      }
      const userIds = Object.values(firstByCompany).map((r: any) => r.user_id);
      let profByUser: Record<string, any> = {};
      if (userIds.length) {
        const { data: profs } = await supabaseAdmin
          .from("profiles")
          .select("user_id, email, nome")
          .in("user_id", userIds);
        for (const p of profs ?? []) profByUser[(p as any).user_id] = p;
      }
      for (const cid of Object.keys(firstByCompany)) {
        const uid = firstByCompany[cid].user_id;
        const p = profByUser[uid];
        ownersByCompany[cid] = { user_id: uid, email: p?.email ?? null, nome: p?.nome ?? null };
      }
    }
    // Conexões WhatsApp por empresa (monitoramento no painel master)
    const conexoesByCompany: Record<string, any[]> = {};
    if (companyIds.length) {
      const { data: insts } = await supabaseAdmin
        .from("whatsapp_instances")
        .select("company_id, instance_name, display_name, numero, status, paused, provider, provider_type, updated_at")
        .in("company_id", companyIds);
      for (const i of (insts ?? []) as any[]) {
        (conexoesByCompany[i.company_id] ||= []).push({
          instance_name: i.instance_name,
          display_name: i.display_name,
          numero: i.numero,
          status: i.status,
          paused: !!i.paused,
          provider: (i.provider ?? i.provider_type ?? "dapi") as string,
          updated_at: i.updated_at,
        });
      }
    }

    const enriched = rows.map((r: any) => {
      const conexoes = conexoesByCompany[r.company_id] ?? [];
      return {
        ...r,
        owner: ownersByCompany[r.company_id] ?? null,
        conexoes,
        conexoes_total: conexoes.length,
        conexoes_online: conexoes.filter((c) => c.status === "connected" && !c.paused).length,
      };
    });
    return { rows: enriched };
  });

export const getSubscriberProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { companyId: string }) => ({ companyId: String(d.companyId) }))
  .handler(async ({ context, data }) => {
    await assertSuper(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: company } = await supabaseAdmin
      .from("company")
      .select("id, nome, email_corporativo, telefone, cnpj_cpf, status_cobranca, trial_ate, creditos_saldo, creditos_origem, creditos_resetam_em, created_at")
      .eq("id", data.companyId)
      .maybeSingle();
    if (!company) throw new Error("Empresa não encontrada");
    const { data: sub } = await supabaseAdmin
      .from("subscription")
      .select("*, plan:plan(id,nome,slug,preco_cents,moeda,intervalo)")
      .eq("company_id", data.companyId)
      .maybeSingle();
    const { data: cu } = await supabaseAdmin
      .from("company_user")
      .select("user_id, role, created_at, ativo")
      .eq("company_id", data.companyId)
      .eq("ativo", true)
      .order("created_at", { ascending: true });
    const owner = (cu ?? []).find((r: any) => r.role === "owner") ?? (cu ?? [])[0];
    let ownerProfile: any = null;
    if (owner) {
      const { data: prof } = await supabaseAdmin
        .from("profiles")
        .select("user_id, email, nome")
        .eq("user_id", (owner as any).user_id)
        .maybeSingle();
      ownerProfile = prof;
    }
    return { company, subscription: sub ?? null, owner: ownerProfile };
  });

export const updateSubscriberSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    companyId: string;
    planId?: string | null;
    ciclo?: string | null;
    status?: string | null;
    valor_customizado_cents?: number | null;
    extend_trial_days?: number;
    extend_access_days?: number;
    cortesia?: boolean;
    notas_internas?: string | null;
    extra_usuarios?: number;
    extra_conexoes?: number;
    creditos_saldo?: number | null;
  }) => {
    const ciclos = ["mensal", "trimestral", "semestral", "anual"];
    const statuses = ["trialing", "active", "past_due", "canceled", "incomplete", "paused", "expired"];
    return {
      companyId: String(d.companyId),
      planId: d.planId ?? null,
      ciclo: d.ciclo && ciclos.includes(d.ciclo) ? d.ciclo : null,
      status: d.status && statuses.includes(d.status) ? d.status : null,
      valor_customizado_cents:
        d.valor_customizado_cents === null || d.valor_customizado_cents === undefined
          ? null
          : Math.max(0, Math.round(Number(d.valor_customizado_cents))),
      extend_trial_days: Math.max(0, Math.min(3650, Math.floor(d.extend_trial_days ?? 0))),
      extend_access_days: Math.max(0, Math.min(3650, Math.floor(d.extend_access_days ?? 0))),
      cortesia: !!d.cortesia,
      notas_internas: d.notas_internas ?? null,
      extra_usuarios: Math.max(0, Math.floor(d.extra_usuarios ?? 0)),
      extra_conexoes: Math.max(0, Math.floor(d.extra_conexoes ?? 0)),
      creditos_saldo:
        d.creditos_saldo === null || d.creditos_saldo === undefined
          ? null
          : Math.max(0, Math.floor(Number(d.creditos_saldo))),
    };
  })
  .handler(async ({ context, data }) => {
    await assertSuper(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 1) Update company (trial + créditos + status_cobranca)
    const compUpdate: any = {};
    if (data.extend_trial_days > 0) {
      const { data: c } = await supabaseAdmin.from("company").select("trial_ate").eq("id", data.companyId).maybeSingle();
      const base = c?.trial_ate ? new Date(c.trial_ate as string) : new Date();
      const next = new Date(Math.max(base.getTime(), Date.now()) + data.extend_trial_days * 86400000);
      compUpdate.trial_ate = next.toISOString();
    }
    if (data.creditos_saldo !== null) {
      compUpdate.creditos_saldo = data.creditos_saldo;
    }
    if (data.status) {
      const mapStatus: Record<string, string> = {
        active: "ativo",
        trialing: "trial",
        past_due: "inadimplente",
        canceled: "cancelado",
        expired: "expirado",
        paused: "suspenso",
        incomplete: "trial",
      };
      compUpdate.status_cobranca = mapStatus[data.status] ?? "ativo";
    }
    if (Object.keys(compUpdate).length) {
      const { error } = await supabaseAdmin.from("company").update(compUpdate).eq("id", data.companyId);
      if (error) throw error;
    }

    // 2) Upsert subscription
    const { data: existing } = await supabaseAdmin
      .from("subscription")
      .select("id, current_period_end, trial_ends_at")
      .eq("company_id", data.companyId)
      .maybeSingle();

    const subUpdate: any = {
      ciclo: data.ciclo ?? undefined,
      status: data.status ?? undefined,
      valor_customizado_cents: data.valor_customizado_cents,
      cortesia: data.cortesia,
      notas_internas: data.notas_internas,
      extra_usuarios: data.extra_usuarios,
      extra_conexoes: data.extra_conexoes,
    };
    if (data.planId) subUpdate.plan_id = data.planId;

    if (data.extend_trial_days > 0) {
      const base = existing?.trial_ends_at ? new Date(existing.trial_ends_at as string) : new Date();
      subUpdate.trial_ends_at = new Date(Math.max(base.getTime(), Date.now()) + data.extend_trial_days * 86400000).toISOString();
    }
    if (data.extend_access_days > 0) {
      const base = existing?.current_period_end ? new Date(existing.current_period_end as string) : new Date();
      subUpdate.current_period_end = new Date(Math.max(base.getTime(), Date.now()) + data.extend_access_days * 86400000).toISOString();
    }

    // Remove undefined
    for (const k of Object.keys(subUpdate)) if (subUpdate[k] === undefined) delete subUpdate[k];

    if (existing) {
      const { error } = await supabaseAdmin.from("subscription").update(subUpdate).eq("id", existing.id);
      if (error) throw error;
    } else {
      const { error } = await supabaseAdmin.from("subscription").insert({
        company_id: data.companyId,
        status: data.status ?? "active",
        provider: "manual",
        ...subUpdate,
      });
      if (error) throw error;
    }

    // Audit
    try {
      const { data: prof } = await supabaseAdmin.from("profiles").select("email").eq("user_id", context.userId).maybeSingle();
      await supabaseAdmin.from("audit_log").insert({
        company_id: data.companyId, user_id: context.userId, actor_email: (prof as any)?.email ?? null,
        acao: "subscription_update", recurso: "subscription",
        detalhes: { planId: data.planId, ciclo: data.ciclo, status: data.status, valor_customizado_cents: data.valor_customizado_cents, extend_trial_days: data.extend_trial_days, extend_access_days: data.extend_access_days, extra_usuarios: data.extra_usuarios, extra_conexoes: data.extra_conexoes, creditos_saldo: data.creditos_saldo, cortesia: data.cortesia },
      });
    } catch {}

    return { ok: true };
  });

export const sendSubscriberResetLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { companyId: string }) => ({ companyId: String(d.companyId) }))
  .handler(async ({ context, data }) => {
    await assertSuper(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: cu } = await supabaseAdmin
      .from("company_user")
      .select("user_id, role")
      .eq("company_id", data.companyId)
      .eq("ativo", true)
      .order("created_at", { ascending: true });
    const owner = (cu ?? []).find((r: any) => r.role === "owner") ?? (cu ?? [])[0];
    if (!owner) throw new Error("Empresa sem responsável");
    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("email")
      .eq("user_id", (owner as any).user_id)
      .maybeSingle();
    const email = (prof as any)?.email;
    if (!email) throw new Error("Responsável sem e-mail");
    const { error } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email,
    });
    if (error) throw error;
    try {
      await supabaseAdmin.from("audit_log").insert({
        company_id: data.companyId, user_id: context.userId, actor_email: (prof as any)?.email ?? null,
        acao: "password_reset_sent", recurso: "auth", detalhes: { target_email: email },
      });
    } catch {}
    return { ok: true, email };
  });

export const cancelSubscriber = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { companyId: string }) => ({ companyId: String(d.companyId) }))
  .handler(async ({ context, data }) => {
    await assertSuper(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("subscription").update({ status: "canceled", canceled_at: new Date().toISOString() }).eq("company_id", data.companyId);
    await supabaseAdmin.from("company").update({ status_cobranca: "cancelado" }).eq("id", data.companyId);
    try {
      const { data: prof } = await supabaseAdmin.from("profiles").select("email").eq("user_id", context.userId).maybeSingle();
      await supabaseAdmin.from("audit_log").insert({
        company_id: data.companyId, user_id: context.userId, actor_email: (prof as any)?.email ?? null,
        acao: "subscription_cancel", recurso: "subscription", detalhes: {},
      });
    } catch {}
    return { ok: true };
  });

export const deleteSubscriber = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { companyId: string }) => ({ companyId: String(d.companyId) }))
  .handler(async ({ context, data }) => {
    await assertSuper(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 1. Descobrir usuários vinculados exclusivamente a esta empresa (para não apagar super admins ou usuários em múltiplas empresas)
    const { data: members } = await supabaseAdmin
      .from("company_user")
      .select("user_id")
      .eq("company_id", data.companyId);

    const userIds = (members ?? []).map((m: any) => m.user_id);

    // 2. Apagar a empresa (o cascade deve cuidar de quase tudo, mas fazemos seguro)
    // Relações em cascata no banco geralmente cuidam de mensagens, cards, etc.
    const { error: delError } = await supabaseAdmin.from("company").delete().eq("id", data.companyId);
    if (delError) throw new Error(`Falha ao excluir empresa: ${delError.message}`);

    // 3. Apagar usuários que ficaram "órfãos" e não são super admins
    if (userIds.length > 0) {
      for (const uid of userIds) {
        // Verifica se o usuário tem outras empresas ativas
        const { count } = await supabaseAdmin
          .from("company_user")
          .select("id", { count: "exact", head: true })
          .eq("user_id", uid);

        // Se count for 0 (ou seja, não sobrou nenhum vínculo após o delete acima), podemos tentar apagar da Auth
        if (count === 0) {
          // Verifica se é super admin antes de apagar a conta
          const { data: isSuper } = await supabaseAdmin
            .from("user_roles")
            .select("id")
            .eq("user_id", uid)
            .eq("role", "super_admin")
            .maybeSingle();

          if (!isSuper) {
            await supabaseAdmin.auth.admin.deleteUser(uid).catch(e => console.warn(`Auth delete failed for ${uid}:`, e));
          }
        }
      }
    }

    return { ok: true };
  });



export const listCompanies = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { search?: string; page?: number }) => ({
    search: (d.search ?? "").trim().toLowerCase(),
    page: Math.max(0, d.page ?? 0),
  }))
  .handler(async ({ context, data }) => {
    await assertSuper(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const pageSize = 20;
    let q = supabaseAdmin
      .from("company")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(data.page * pageSize, data.page * pageSize + pageSize - 1);
    if (data.search) q = q.ilike("nome", `%${data.search}%`);
    const { data: rows, count, error } = await q;
    if (error) throw error;
    const ids = (rows ?? []).map((c: any) => c.id);
    let ultByCompany: Record<string, string> = {};
    if (ids.length) {
      const { data: msgs } = await supabaseAdmin
        .from("mensagens")
        .select("company_id, created_at")
        .in("company_id", ids)
        .order("created_at", { ascending: false })
        .limit(500);
      for (const m of msgs ?? []) {
        if (!ultByCompany[(m as any).company_id]) ultByCompany[(m as any).company_id] = (m as any).created_at;
      }
    }
    const list = (rows ?? []).map((c: any) => ({ ...c, ultima_atividade: ultByCompany[c.id] ?? null }));
    return { rows: list, total: count ?? 0, pageSize };
  });

export const suspendCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { companyId: string; suspend: boolean }) => d)
  .handler(async ({ context, data }) => {
    await assertSuper(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("company")
      .update({ status_cobranca: data.suspend ? "suspenso" : "ativo" })
      .eq("id", data.companyId);
    if (error) throw error;
    try {
      const { data: prof } = await supabaseAdmin.from("profiles").select("email").eq("user_id", context.userId).maybeSingle();
      await supabaseAdmin.from("audit_log").insert({
        company_id: data.companyId, user_id: context.userId, actor_email: (prof as any)?.email ?? null,
        acao: data.suspend ? "company_suspend" : "company_unsuspend", recurso: "company", detalhes: {},
      });
    } catch {}
    return { ok: true };
  });

export const extendTrial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { companyId: string; days: number }) => ({
    companyId: d.companyId,
    days: Math.max(1, Math.min(365, Math.floor(d.days))),
  }))
  .handler(async ({ context, data }) => {
    await assertSuper(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: c } = await supabaseAdmin.from("company").select("trial_ate").eq("id", data.companyId).maybeSingle();
    const base = c?.trial_ate ? new Date(c.trial_ate as string) : new Date();
    const next = new Date(Math.max(base.getTime(), Date.now()) + data.days * 86400000);
    const { error } = await supabaseAdmin
      .from("company")
      .update({ trial_ate: next.toISOString(), status_cobranca: "trial" })
      .eq("id", data.companyId);
    if (error) throw error;

    // Mantém a assinatura em sincronia (a lista exibe subscription.trial_ends_at)
    const { data: sub } = await supabaseAdmin
      .from("subscription")
      .select("id")
      .eq("company_id", data.companyId)
      .maybeSingle();
    if (sub?.id) {
      await supabaseAdmin
        .from("subscription")
        .update({ trial_ends_at: next.toISOString(), status: "trialing" })
        .eq("id", sub.id);
    } else {
      await supabaseAdmin.from("subscription").insert({
        company_id: data.companyId,
        status: "trialing",
        provider: "manual",
        trial_ends_at: next.toISOString(),
      });
    }

    try {
      const { data: prof } = await supabaseAdmin.from("profiles").select("email").eq("user_id", context.userId).maybeSingle();
      await supabaseAdmin.from("audit_log").insert({
        company_id: data.companyId, user_id: context.userId, actor_email: (prof as any)?.email ?? null,
        acao: "trial_extend", recurso: "company", detalhes: { days: data.days, trial_ate: next.toISOString() },
      });
    } catch {}
    return { trial_ate: next.toISOString() };
  });

export const createCompanyWithOwner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    nome: string; ownerEmail: string;
    planId?: string | null; trialDays?: number; password?: string | null;
  }) => {
    const nome = String(d.nome || "").trim();
    const ownerEmail = String(d.ownerEmail || "").trim().toLowerCase();
    if (nome.length < 2) throw new Error("Nome inválido");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail)) throw new Error("Email inválido");
    const password = d.password ? String(d.password) : null;
    if (password && password.length < 8) throw new Error("Senha mínima de 8 caracteres");
    return {
      nome, ownerEmail,
      planId: d.planId || null,
      trialDays: Math.max(0, Math.min(90, Math.floor(d.trialDays ?? 3))),
      password,
    };
  })
  .handler(async ({ context, data }) => {
    await assertSuper(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // owner
    let ownerId: string | null = null;
    const { data: prof } = await supabaseAdmin.from("profiles").select("user_id").eq("email", data.ownerEmail).maybeSingle();
    if (prof) ownerId = prof.user_id;
    let tempPassword: string | null = null;
    if (!ownerId) {
      tempPassword = data.password ?? (Math.random().toString(36).slice(2, 10) + "A1!");
      const { data: c, error } = await supabaseAdmin.auth.admin.createUser({
        email: data.ownerEmail, password: tempPassword, email_confirm: true,
      });
      if (error || !c.user) throw new Error(error?.message || "Falha ao criar usuário");
      ownerId = c.user.id;
      await supabaseAdmin.from("profiles").upsert({ user_id: ownerId, email: data.ownerEmail });
    } else if (data.password) {
      // Reset de senha do owner já existente
      const { error: upErr } = await supabaseAdmin.auth.admin.updateUserById(ownerId, {
        password: data.password, email_confirm: true,
      });
      if (upErr) throw upErr;
      tempPassword = data.password;
    }

    // company com slug único
    let baseSlug = slugify(data.nome);
    let slug = baseSlug;
    for (let i = 1; i < 20; i++) {
      const { data: ex } = await supabaseAdmin.from("company").select("id").eq("slug", slug).maybeSingle();
      if (!ex) break;
      slug = `${baseSlug}-${i}`;
    }
    const trialMs = data.trialDays * 86400000;
    const trialEnd = new Date(Date.now() + trialMs).toISOString();
    const { data: comp, error: cErr } = await supabaseAdmin
      .from("company")
      .insert({
        nome: data.nome,
        slug,
        created_by: ownerId,
        status_cobranca: data.trialDays > 0 ? "trial" : "ativo",
        trial_ate: trialEnd,
      })
      .select("id")
      .single();
    if (cErr || !comp) throw new Error(cErr?.message || "Falha ao criar empresa");

    await supabaseAdmin.from("company_user").insert({
      company_id: comp.id, user_id: ownerId, role: "owner", ativo: true, forcar_troca_senha: !data.password && !!tempPassword,
    });

    // Cria subscription em trialing já com o plano selecionado
    if (data.planId) {
      await supabaseAdmin.from("subscription").insert({
        company_id: comp.id,
        plan_id: data.planId,
        status: data.trialDays > 0 ? "trialing" : "active",
        trial_ends_at: trialEnd,
        current_period_end: trialEnd,
      });
    }

    return { ok: true, companyId: comp.id, tempPassword };
  });

export const listPlansBasic = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuper(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("plan")
      .select("id, nome, preco_cents, moeda, intervalo, trial_days")
      .eq("ativo", true)
      .order("preco_cents", { ascending: true });
    return { plans: data ?? [] };
  });

export const getSuperAdminEmails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuper(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin.from("app_config").select("super_admin_emails").eq("id", true).maybeSingle();
    return { emails: (data?.super_admin_emails ?? []) as string[] };
  });

export const setSuperAdminEmails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { emails: string[] }) => {
    const clean = Array.from(new Set((d.emails ?? []).map((e) => String(e).trim().toLowerCase()).filter(Boolean)));
    for (const e of clean) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw new Error(`Email inválido: ${e}`);
    }
    return { emails: clean };
  })
  .handler(async ({ context, data }) => {
    await assertSuper(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("app_config")
      .upsert({ id: true, super_admin_emails: data.emails });
    if (error) throw error;
    // promove novos super_admin existentes
    if (data.emails.length) {
      const { data: profs } = await supabaseAdmin.from("profiles").select("user_id, email").in("email", data.emails);
      for (const p of profs ?? []) {
        await supabaseAdmin.from("user_roles").upsert(
          { user_id: p.user_id, role: "super_admin" as any },
          { onConflict: "user_id,role" } as any,
        );
      }
    }
    return { ok: true };
  });

export const resetCompanyOwnerPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { companyId: string; newPassword?: string }) => ({
    companyId: String(d.companyId),
    newPassword: d.newPassword ? String(d.newPassword) : undefined,
  }))
  .handler(async ({ context, data }) => {
    await assertSuper(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Descobre o owner ativo
    const { data: cu } = await supabaseAdmin
      .from("company_user")
      .select("user_id, role")
      .eq("company_id", data.companyId)
      .eq("ativo", true)
      .order("created_at", { ascending: true });
    const owner = (cu ?? []).find((r: any) => r.role === "owner") ?? (cu ?? [])[0];
    if (!owner) throw new Error("Empresa sem usuário responsável");

    const password =
      data.newPassword && data.newPassword.length >= 8
        ? data.newPassword
        : Math.random().toString(36).slice(2, 10) + "A1!";

    const { error: uErr } = await supabaseAdmin.auth.admin.updateUserById(owner.user_id, {
      password,
      email_confirm: true,
    });
    if (uErr) throw uErr;

    // Força troca no próximo login (se foi senha auto-gerada)
    if (!data.newPassword) {
      await supabaseAdmin
        .from("company_user")
        .update({ forcar_troca_senha: true })
        .eq("company_id", data.companyId)
        .eq("user_id", owner.user_id);
    }

    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("email")
      .eq("user_id", owner.user_id)
      .maybeSingle();

    return { ok: true, tempPassword: data.newPassword ? null : password, ownerEmail: prof?.email ?? null };
  });

export const getCompanyDetails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { companyId: string }) => ({ companyId: String(d.companyId) }))
  .handler(async ({ context, data }) => {
    await assertSuper(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: company, error } = await supabaseAdmin
      .from("company")
      .select("*")
      .eq("id", data.companyId)
      .maybeSingle();
    if (error) throw error;
    if (!company) throw new Error("Empresa não encontrada");

    const { data: members } = await supabaseAdmin
      .from("company_user")
      .select("user_id, role, ativo, created_at")
      .eq("company_id", data.companyId)
      .order("created_at", { ascending: true });

    const userIds = (members ?? []).map((m: any) => m.user_id);
    let profilesById: Record<string, any> = {};
    if (userIds.length) {
      const { data: profs } = await supabaseAdmin
        .from("profiles")
        .select("user_id, email, nome, telefone")
        .in("user_id", userIds);
      for (const p of profs ?? []) profilesById[(p as any).user_id] = p;
    }
    const membersFull = (members ?? []).map((m: any) => ({
      ...m,
      profile: profilesById[m.user_id] ?? null,
    }));

    const { data: subscription } = await supabaseAdmin
      .from("subscription")
      .select("*, plan:plan(nome, preco_cents, moeda, intervalo)")
      .eq("company_id", data.companyId)
      .maybeSingle();

    const [{ count: msgCount }, { count: contactsCount }, { count: cardsCount }] = await Promise.all([
      supabaseAdmin.from("mensagens").select("id", { count: "exact", head: true }).eq("company_id", data.companyId),
      supabaseAdmin.from("crm_cards").select("id", { count: "exact", head: true }).eq("company_id", data.companyId),
      supabaseAdmin.from("crm_cards").select("id", { count: "exact", head: true }).eq("company_id", data.companyId),
    ]);

    return {
      company,
      members: membersFull,
      subscription,
      stats: {
        mensagens: msgCount ?? 0,
        contatos: contactsCount ?? 0,
        cards: cardsCount ?? 0,
      },
    };
  });

export const listSignups = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { search?: string; filter?: "todos" | "pendentes" | "confirmados" | "sem_empresa"; page?: number }) => ({
    search: (d.search ?? "").trim().toLowerCase(),
    filter: d.filter ?? "todos",
    page: Math.max(0, d.page ?? 0),
  }))
  .handler(async ({ context, data }) => {
    await assertSuper(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Pagina pela auth.admin API (até 1000 por página, seguro para dashboards)
    const perPage = 200;
    const { data: page, error } = await supabaseAdmin.auth.admin.listUsers({
      page: data.page + 1,
      perPage,
    });
    if (error) throw error;
    const users = page?.users ?? [];
    const userIds = users.map((u) => u.id);

    // Enriquece com profile + primeira company_user (ativa)
    let profilesById: Record<string, any> = {};
    let companyByUser: Record<string, any> = {};
    if (userIds.length) {
      const { data: profs } = await supabaseAdmin
        .from("profiles").select("user_id, email, nome, telefone").in("user_id", userIds);
      for (const p of profs ?? []) profilesById[(p as any).user_id] = p;

      const { data: cus } = await supabaseAdmin
        .from("company_user")
        .select("user_id, company_id, role, ativo, created_at, company:company(id, nome, status_cobranca, trial_ate)")
        .in("user_id", userIds)
        .eq("ativo", true)
        .order("created_at", { ascending: true });
      for (const cu of cus ?? []) {
        const uid = (cu as any).user_id;
        if (!companyByUser[uid]) companyByUser[uid] = cu;
      }
    }

    let rows = users.map((u: any) => {
      const p = profilesById[u.id];
      const cu = companyByUser[u.id];
      return {
        user_id: u.id,
        email: u.email ?? p?.email ?? null,
        nome: p?.nome ?? (u.user_metadata?.full_name ?? null),
        telefone: p?.telefone ?? (u.phone ?? null),
        created_at: u.created_at,
        confirmed_at: u.confirmed_at ?? u.email_confirmed_at ?? null,
        last_sign_in_at: u.last_sign_in_at ?? null,
        provider: u.app_metadata?.provider ?? "email",
        company: cu?.company ?? null,
        role: cu?.role ?? null,
      };
    });

    // Cadastros = acompanhamento prévio: exclui quem já entrou no sistema
    // (tem empresa provisionada). Esses aparecem em Assinaturas.
    rows = rows.filter((r) => !r.company);

    if (data.search) {
      const q = data.search;
      rows = rows.filter((r) =>
        (r.email ?? "").toLowerCase().includes(q) ||
        (r.nome ?? "").toLowerCase().includes(q) ||
        (r.telefone ?? "").toLowerCase().includes(q)
      );
    }
    if (data.filter === "pendentes") rows = rows.filter((r) => !r.confirmed_at);
    else if (data.filter === "confirmados") rows = rows.filter((r) => !!r.confirmed_at);

    rows.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return {
      rows,
      total: rows.length,
      perPage,
      hasMore: users.length >= perPage,
      counts: {
        pendentes: rows.filter((r) => !r.confirmed_at).length,
        confirmados: rows.filter((r) => !!r.confirmed_at).length,
      },
    };
  });

export const resendSignupConfirmation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { email: string }) => ({ email: String(d.email || "").trim().toLowerCase() }))
  .handler(async ({ context, data }) => {
    await assertSuper(context.supabase, context.userId);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) throw new Error("Email inválido");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin.auth as any).resend({ type: "signup", email: data.email });
    if (error) throw error;
    try {
      await (supabaseAdmin.from("audit_log") as any).insert({
        user_id: context.userId, acao: "signup_resend", recurso: "auth", detalhes: { target_email: data.email },
      });
    } catch {}
    return { ok: true };
  });

export const confirmSignupManually = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string }) => ({ userId: String(d.userId) }))
  .handler(async ({ context, data }) => {
    await assertSuper(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, { email_confirm: true });
    if (error) throw error;
    try {
      await (supabaseAdmin.from("audit_log") as any).insert({
        user_id: context.userId, acao: "signup_confirm_manual", recurso: "auth", detalhes: { target_user_id: data.userId },
      });
    } catch {}
    return { ok: true };
  });

export const setUserPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string; password: string }) => ({
    userId: String(d.userId),
    password: String(d.password || ""),
  }))
  .handler(async ({ context, data }) => {
    await assertSuper(context.supabase, context.userId);
    if (data.password.length < 8) throw new Error("A senha precisa ter ao menos 8 caracteres");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, { password: data.password });
    if (error) throw error;
    try {
      await (supabaseAdmin.from("audit_log") as any).insert({
        user_id: context.userId, acao: "password_set_by_admin", recurso: "auth", detalhes: { target_user_id: data.userId },
      });
    } catch {}
    return { ok: true };
  });

export const getGlobalAiConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuper(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("master_settings")
      .select("value")
      .eq("key", "global_ai_config")
      .maybeSingle();

    const val = (data?.value as any) || {};
    return {
      openai_api_key: val.openai_api_key || process.env.OPENAI_API_KEY || "",
      anthropic_api_key: val.anthropic_api_key || process.env.ANTHROPIC_API_KEY || "",
      ai_provider: val.ai_provider || process.env.GLOBAL_AI_PROVIDER || "gemini",
      ai_model: val.ai_model || process.env.GLOBAL_AI_MODEL || "google/gemini-2.0-flash-exp",
    };
  });

export const saveGlobalAiConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: any) => data)
  .handler(async ({ context, data }) => {
    await assertSuper(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any)
      .from("master_settings")
      .upsert({ 
        key: "global_ai_config", 
        value: data,
        updated_at: new Date().toISOString()
      });
      
    if (error) throw error;
    return { ok: true };
  });

/** Testa a configuração global de IA fazendo uma chamada real ao provedor. */
export const testGlobalAiConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuper(context.supabase, context.userId);
    const { lovableAiChat } = await import("@/lib/lovable-ai.server");
    const t0 = Date.now();
    try {
      const txt = await lovableAiChat([
        { role: "system", content: "Responda apenas: OK" },
        { role: "user", content: "teste de conexão" },
      ]);
      return { ok: true, ms: Date.now() - t0, sample: txt.slice(0, 120) };
    } catch (e: any) {
      return { ok: false, ms: Date.now() - t0, error: String(e?.message ?? e).slice(0, 300) };
    }
  });





/**
 * Contingência: cadastro que nunca virou empresa (onboarding incompleto).
 * Cria a empresa + vínculo owner + assinatura em trial para o usuário já cadastrado,
 * de forma que ele consiga entrar e concluir o onboarding.
 */
export const provisionSignupCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string; nome?: string | null; trialDays?: number; planId?: string | null }) => ({
    userId: String(d.userId),
    nome: (d.nome ?? "").toString().trim(),
    trialDays: Math.max(1, Math.min(365, Math.floor(d.trialDays ?? 7))),
    planId: d.planId || null,
  }))
  .handler(async ({ context, data }) => {
    await assertSuper(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: existing } = await supabaseAdmin
      .from("company_user")
      .select("company_id")
      .eq("user_id", data.userId)
      .eq("ativo", true)
      .maybeSingle();
    if (existing?.company_id) {
      return { ok: true, companyId: existing.company_id as string, alreadyExisted: true };
    }

    const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(data.userId);
    const email = authUser?.user?.email ?? null;
    const { data: prof } = await supabaseAdmin
      .from("profiles").select("nome, email, telefone").eq("user_id", data.userId).maybeSingle();

    const nome =
      data.nome ||
      (prof as any)?.nome ||
      (authUser?.user?.user_metadata as any)?.full_name ||
      (email ? email.split("@")[0] : "") ||
      "Nova empresa";

    let baseSlug = slugify(nome) || "empresa";
    let slug = baseSlug;
    for (let i = 1; i < 30; i++) {
      const { data: ex } = await supabaseAdmin.from("company").select("id").eq("slug", slug).maybeSingle();
      if (!ex) break;
      slug = `${baseSlug}-${i}`;
    }

    const trialEnd = new Date(Date.now() + data.trialDays * 86400000).toISOString();
    const { data: comp, error: cErr } = await supabaseAdmin
      .from("company")
      .insert({
        nome,
        slug,
        created_by: data.userId,
        status_cobranca: "trial",
        trial_ate: trialEnd,
        email_corporativo: email,
        telefone: (prof as any)?.telefone ?? null,
        onboarding_completed: false,
        onboarding_step: 0,
      })
      .select("id")
      .single();
    if (cErr || !comp) throw new Error(cErr?.message || "Falha ao criar empresa");

    const { data: link } = await supabaseAdmin
      .from("company_user").select("id").eq("company_id", comp.id).eq("user_id", data.userId).maybeSingle();
    if (!link) {
      await supabaseAdmin.from("company_user").insert({
        company_id: comp.id, user_id: data.userId, role: "owner", ativo: true,
      });
    }

    const { data: sub } = await supabaseAdmin
      .from("subscription").select("id").eq("company_id", comp.id).maybeSingle();
    if (sub?.id) {
      await supabaseAdmin.from("subscription").update({
        status: "trialing", trial_ends_at: trialEnd, current_period_end: trialEnd,
        ...(data.planId ? { plan_id: data.planId } : {}),
      }).eq("id", sub.id);
    } else {
      await supabaseAdmin.from("subscription").insert({
        company_id: comp.id,
        plan_id: data.planId,
        status: "trialing",
        provider: "manual",
        trial_ends_at: trialEnd,
        current_period_end: trialEnd,
      } as any);
    }

    try {
      await supabaseAdmin.from("audit_log").insert({
        company_id: comp.id, user_id: context.userId,
        acao: "signup_provision_company", recurso: "company",
        detalhes: { target_user_id: data.userId, trialDays: data.trialDays },
      } as any);
    } catch {}

    return { ok: true, companyId: comp.id as string, alreadyExisted: false };
  });

/**
 * Contingência: reabre o onboarding de uma empresa e (opcionalmente) renova o trial,
 * para clientes que ficaram travados sem concluir o cadastro inicial.
 */
export const reopenOnboarding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { companyId: string; trialDays?: number }) => ({
    companyId: String(d.companyId),
    trialDays: Math.max(0, Math.min(365, Math.floor(d.trialDays ?? 7))),
  }))
  .handler(async ({ context, data }) => {
    await assertSuper(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const patch: any = { onboarding_completed: false, onboarding_step: 0 };
    let trialEnd: string | null = null;
    if (data.trialDays > 0) {
      trialEnd = new Date(Date.now() + data.trialDays * 86400000).toISOString();
      patch.trial_ate = trialEnd;
      patch.status_cobranca = "trial";
    }
    const { error } = await supabaseAdmin.from("company").update(patch).eq("id", data.companyId);
    if (error) throw error;

    if (trialEnd) {
      const { data: sub } = await supabaseAdmin
        .from("subscription").select("id").eq("company_id", data.companyId).maybeSingle();
      if (sub?.id) {
        await supabaseAdmin.from("subscription")
          .update({ status: "trialing", trial_ends_at: trialEnd, current_period_end: trialEnd })
          .eq("id", sub.id);
      }
    }

    try {
      await supabaseAdmin.from("audit_log").insert({
        company_id: data.companyId, user_id: context.userId,
        acao: "onboarding_reopen", recurso: "company", detalhes: { trialDays: data.trialDays },
      } as any);
    } catch {}

    return { ok: true, trial_ate: trialEnd };
  });

/** Confirma manualmente um pagamento (PIX na conta da empresa, etc.) e reativa o plano. */
export const markCompanyPaidManual = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { companyId: string; dias?: number; valorCents?: number | null; observacao?: string | null }) => ({
    companyId: String(d.companyId),
    dias: Math.max(1, Math.min(365, Math.floor(Number(d.dias ?? 30)))),
    valorCents: d.valorCents == null ? null : Math.max(0, Math.floor(Number(d.valorCents))),
    observacao: (d.observacao ?? "").toString().slice(0, 300) || null,
  }))
  .handler(async ({ context, data }) => {
    await assertSuper(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: sub }, { data: comp }] = await Promise.all([
      supabaseAdmin
        .from("subscription")
        .select("id, plan_id, status, current_period_end, valor_customizado_cents, cortesia")
        .eq("company_id", data.companyId)
        .maybeSingle(),
      supabaseAdmin
        .from("company")
        .select("id, nome, email_corporativo, selected_plan_slug")
        .eq("id", data.companyId)
        .maybeSingle(),
    ]);
    if (!comp) throw new Error("Empresa não encontrada");

    let plano: any = null;
    if ((sub as any)?.plan_id) {
      const { data: p } = await supabaseAdmin.from("plan").select("id, slug, preco_cents").eq("id", (sub as any).plan_id).maybeSingle();
      plano = p;
    } else if ((comp as any).selected_plan_slug) {
      const { data: p } = await supabaseAdmin.from("plan").select("id, slug, preco_cents").eq("slug", (comp as any).selected_plan_slug).maybeSingle();
      plano = p;
    }

    const base = (sub as any)?.current_period_end ? new Date((sub as any).current_period_end) : new Date();
    const fim = new Date(Math.max(base.getTime(), Date.now()) + data.dias * 86400000);
    const valor = data.valorCents ?? Number((sub as any)?.valor_customizado_cents || plano?.preco_cents || 0);

    if ((sub as any)?.id) {
      await supabaseAdmin
        .from("subscription")
        .update({
          status: "active",
          current_period_end: fim.toISOString(),
          proxima_cobranca: fim.toISOString(),
          cancel_at_period_end: false,
          trial_ends_at: null,
          metodo_pagamento: "pix_manual",
        } as any)
        .eq("id", (sub as any).id);
    } else {
      await supabaseAdmin.from("subscription").insert({
        company_id: data.companyId,
        plan_id: plano?.id ?? null,
        status: "active",
        provider: "manual",
        current_period_end: fim.toISOString(),
        proxima_cobranca: fim.toISOString(),
        metodo_pagamento: "pix_manual",
      } as any);
    }

    // trial_ate é NOT NULL: alinhamos com o fim do período pago em vez de limpar.
    const { error: compErr } = await supabaseAdmin
      .from("company")
      .update({ status_cobranca: "ativo", trial_ate: fim.toISOString() } as any)
      .eq("id", data.companyId);
    if (compErr) throw new Error(`Falha ao liberar acesso: ${compErr.message}`);

    // Recarrega os créditos de IA do plano e impede saldo antigo após a confirmação.
    if (plano?.slug) {
      const { data: novoSaldo, error: creditError } = await supabaseAdmin.rpc("topup_plan_credits", {
        _company_id: data.companyId,
        _plan_slug: plano.slug,
      });
      // Não bloqueia a confirmação: o pagamento precisa ser registrado mesmo
      // quando o plano está inativo no catálogo e não tem créditos definidos.
      if (creditError || novoSaldo == null) {
        console.warn("[billing] créditos não renovados", {
          companyId: data.companyId,
          slug: plano.slug,
          motivo: creditError?.message ?? "plano sem créditos configurados",
        });
      }
    }

    // Entra no financeiro como pagamento recebido.
    try {
      await supabaseAdmin.from("billing_event_log").insert({
        provider: "manual",
        event_type: "purchase_approved",
        matched_company_id: data.companyId,
        processed: true,
        buyer_email: (comp as any).email_corporativo ?? null,
        payload: {
          eventType: "purchase_approved",
          amountCents: valor,
          manual: true,
          observacao: data.observacao,
          confirmado_em: new Date().toISOString(),
        } as any,
      } as any);
    } catch {}

    try {
      const { data: prof } = await supabaseAdmin.from("profiles").select("email").eq("user_id", context.userId).maybeSingle();
      await supabaseAdmin.from("audit_log").insert({
        company_id: data.companyId,
        user_id: context.userId,
        actor_email: (prof as any)?.email ?? null,
        acao: "pagamento_manual_confirmado",
        recurso: "subscription",
        detalhes: { dias: data.dias, valor_cents: valor, observacao: data.observacao } as any,
      } as any);
    } catch {}

    return { ok: true, ate: fim.toISOString(), valor_cents: valor };
  });
