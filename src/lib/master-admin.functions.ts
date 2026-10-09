import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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

/* ============================== AUDIT LOG ============================== */

export const logAdminAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { companyId: string; acao: string; recurso?: string | null; detalhes?: any }) => ({
    companyId: String(d.companyId),
    acao: String(d.acao).slice(0, 120),
    recurso: d.recurso ? String(d.recurso).slice(0, 200) : null,
    detalhes: d.detalhes ?? {},
  }))
  .handler(async ({ context, data }) => {
    await assertSuper(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: prof } = await supabaseAdmin.from("profiles").select("email").eq("user_id", context.userId).maybeSingle();
    await supabaseAdmin.from("audit_log").insert({
      company_id: data.companyId,
      user_id: context.userId,
      actor_email: (prof as any)?.email ?? null,
      acao: data.acao,
      recurso: data.recurso,
      detalhes: data.detalhes,
    });
    return { ok: true };
  });

export const listAuditLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { companyId?: string | null; limit?: number }) => ({
    companyId: d.companyId ?? null,
    limit: Math.max(20, Math.min(500, Math.floor(d.limit ?? 100))),
  }))
  .handler(async ({ context, data }) => {
    await assertSuper(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin
      .from("audit_log")
      .select("id, company_id, actor_email, acao, recurso, detalhes, created_at, company:company(nome)")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.companyId) q = q.eq("company_id", data.companyId);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  });

/* ============================== IMPERSONATION ============================== */

export const startImpersonation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { companyId: string; motivo?: string | null }) => ({
    companyId: String(d.companyId),
    motivo: d.motivo ? String(d.motivo).slice(0, 300) : null,
  }))
  .handler(async ({ context, data }) => {
    await assertSuper(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: prof } = await supabaseAdmin.from("profiles").select("email").eq("user_id", context.userId).maybeSingle();
    const { data: row, error } = await supabaseAdmin
      .from("impersonation_log")
      .insert({
        admin_user_id: context.userId,
        admin_email: (prof as any)?.email ?? null,
        company_id: data.companyId,
        motivo: data.motivo,
      })
      .select("id")
      .single();
    if (error) throw error;
    return { id: (row as any).id };
  });

export const endImpersonation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => ({ id: String(d.id) }))
  .handler(async ({ context, data }) => {
    await assertSuper(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("impersonation_log").update({ ended_at: new Date().toISOString() }).eq("id", data.id);
    return { ok: true };
  });

export const listImpersonationLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuper(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("impersonation_log")
      .select("id, admin_email, company_id, started_at, ended_at, motivo, company:company(nome)")
      .order("started_at", { ascending: false })
      .limit(200);
    return data ?? [];
  });

/* ============================== TENANT HEALTH ============================== */

export const listTenantHealth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuper(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const now = Date.now();
    const in3d = new Date(now + 3 * 86400000).toISOString();

    const { data: companies } = await supabaseAdmin
      .from("company")
      .select("id, nome, status_cobranca, trial_ate, creditos_saldo, admin_bloqueado, created_at");

    const compIds = (companies ?? []).map((c: any) => c.id);
    const { data: instances } = await supabaseAdmin
      .from("whatsapp_instances")
      .select("company_id, connection_state, updated_at")
      .in("company_id", compIds.length ? compIds : ["00000000-0000-0000-0000-000000000000"]);

    // Last message per company (best effort, 24h window)
    const dayAgo = new Date(now - 24 * 3600 * 1000).toISOString();
    const { data: recentMsgs } = await supabaseAdmin
      .from("mensagens")
      .select("company_id, created_at")
      .gte("created_at", dayAgo)
      .in("company_id", compIds.length ? compIds : ["00000000-0000-0000-0000-000000000000"])
      .limit(2000);

    const activityByCompany = new Map<string, string>();
    for (const m of recentMsgs ?? []) {
      const cid = (m as any).company_id;
      if (!activityByCompany.has(cid)) activityByCompany.set(cid, (m as any).created_at);
    }
    const instByCompany = new Map<string, any>();
    for (const i of instances ?? []) {
      const cid = (i as any).company_id;
      if (!instByCompany.has(cid)) instByCompany.set(cid, i);
    }

    const alerts: any[] = [];
    for (const c of companies ?? []) {
      const cid = (c as any).id;
      const flags: string[] = [];
      const inst = instByCompany.get(cid);
      if (inst && inst.connection_state && inst.connection_state !== "open" && inst.connection_state !== "connected") {
        const hoursAgo = inst.updated_at ? Math.round((now - new Date(inst.updated_at).getTime()) / 3600000) : null;
        flags.push(`WhatsApp ${inst.connection_state}${hoursAgo != null ? ` há ${hoursAgo}h` : ""}`);
      }
      if ((c as any).creditos_saldo != null && (c as any).creditos_saldo <= 0 && (c as any).status_cobranca === "ativo") {
        flags.push("Sem créditos de IA");
      }
      if ((c as any).status_cobranca === "trial" && (c as any).trial_ate && (c as any).trial_ate < in3d) {
        const dias = Math.max(0, Math.ceil((new Date((c as any).trial_ate).getTime() - now) / 86400000));
        flags.push(`Trial vence em ${dias}d`);
      }
      if ((c as any).status_cobranca === "pendente" || (c as any).status_cobranca === "suspenso") {
        flags.push(`Cobrança ${(c as any).status_cobranca}`);
      }
      if ((c as any).admin_bloqueado) flags.push("Bloqueado manualmente");
      if (!activityByCompany.get(cid) && (c as any).status_cobranca === "ativo") {
        flags.push("Sem atividade nas últimas 24h");
      }
      if (flags.length) {
        alerts.push({
          company_id: cid,
          nome: (c as any).nome,
          status: (c as any).status_cobranca,
          creditos: (c as any).creditos_saldo,
          trial_ate: (c as any).trial_ate,
          admin_bloqueado: (c as any).admin_bloqueado,
          flags,
        });
      }
    }
    // Order: bloqueadas primeiro, depois mais flags, depois trial vencendo
    alerts.sort((a, b) => (b.admin_bloqueado ? 1 : 0) - (a.admin_bloqueado ? 1 : 0) || b.flags.length - a.flags.length);
    return alerts;
  });

/* ============================== BILLING RECONCILIATION ============================== */

export const listBillingEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { onlyFailed?: boolean; limit?: number }) => ({
    onlyFailed: !!d.onlyFailed,
    limit: Math.max(20, Math.min(500, Math.floor(d.limit ?? 100))),
  }))
  .handler(async ({ context, data }) => {
    await assertSuper(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin
      .from("billing_event_log")
      .select("id, provider, event_type, buyer_email, matched_company_id, processed, error, payload, created_at")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.onlyFailed) q = q.eq("processed", false);
    const { data: rows } = await q;
    return rows ?? [];
  });

export const reprocessBillingEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => ({ id: String(d.id) }))
  .handler(async ({ context, data }) => {
    await assertSuper(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("billing_event_log")
      .select("payload")
      .eq("id", data.id)
      .maybeSingle();
    if (error || !row) throw new Error("Evento não encontrado");
    const evt = (row as any).payload;
    if (!evt || !evt.provider) throw new Error("Payload inválido para reprocessar");
    const { applyBillingEvent } = await import("@/lib/billing/apply.server");
    const r = await applyBillingEvent(evt);
    // marca o log original como reprocessado
    await supabaseAdmin.from("billing_event_log").update({ processed: true, error: r.ok ? null : `retry: ${(r as any).reason ?? "erro"}` }).eq("id", data.id);
    return r;
  });

export const deleteBillingEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => ({ id: String(d.id) }))
  .handler(async ({ context, data }) => {
    await assertSuper(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("billing_event_log").delete().eq("id", data.id);
    return { ok: true };
  });

/* ============================== BLOQUEIO MANUAL ============================== */

export const setCompanyAdminBlock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { companyId: string; bloqueado: boolean; motivo?: string | null }) => ({
    companyId: String(d.companyId),
    bloqueado: !!d.bloqueado,
    motivo: d.motivo ? String(d.motivo).slice(0, 300) : null,
  }))
  .handler(async ({ context, data }) => {
    await assertSuper(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch: any = { admin_bloqueado: data.bloqueado, admin_bloqueado_motivo: data.bloqueado ? data.motivo : null };
    if (data.bloqueado) patch.status_cobranca = "suspenso";
    await supabaseAdmin.from("company").update(patch).eq("id", data.companyId);
    const { data: prof } = await supabaseAdmin.from("profiles").select("email").eq("user_id", context.userId).maybeSingle();
    await supabaseAdmin.from("audit_log").insert({
      company_id: data.companyId,
      user_id: context.userId,
      actor_email: (prof as any)?.email ?? null,
      acao: data.bloqueado ? "admin_block" : "admin_unblock",
      recurso: "company",
      detalhes: { motivo: data.motivo ?? null },
    });
    return { ok: true };
  });
