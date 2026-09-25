import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { SLA_MINUTOS } from "@/lib/support-constants";

async function isSuperAdmin(supabase: any, userId: string) {
  const { data } = await supabase
    .from("user_roles").select("role")
    .eq("user_id", userId).eq("role", "super_admin").maybeSingle();
  return !!data;
}

async function resolveCompanyId(supabase: any, userId: string): Promise<string | null> {
  const { data } = await supabase
    .from("company_user").select("company_id")
    .eq("user_id", userId).eq("ativo", true)
    .order("created_at", { ascending: true }).limit(1).maybeSingle();
  return (data as any)?.company_id ?? null;
}

// ============ USER (client app) ============

export const listMyTickets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const cid = await resolveCompanyId(context.supabase, context.userId);
    if (!cid) return { rows: [] };
    const { data, error } = await context.supabase
      .from("support_ticket")
      .select("*")
      .eq("company_id", cid)
      .order("last_message_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    return { rows: data ?? [] };
  });

export const createTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { assunto?: string; message: string }) => ({
    assunto: (d.assunto || "Suporte").toString().trim().slice(0, 120) || "Suporte",
    message: String(d.message || "").trim(),
  }))
  .handler(async ({ context, data }) => {
    if (data.message.length < 1) throw new Error("Mensagem vazia");
    const cid = await resolveCompanyId(context.supabase, context.userId);
    if (!cid) throw new Error("Empresa não encontrada");
    const { data: t, error } = await context.supabase
      .from("support_ticket")
      .insert({
        company_id: cid,
        assunto: data.assunto,
        created_by: context.userId,
        unread_admin: 1,
        last_message_at: new Date().toISOString(),
      })
      .select("*").single();
    if (error) throw error;
    const { error: mErr } = await context.supabase
      .from("support_message")
      .insert({ ticket_id: t.id, sender_id: context.userId, sender_role: "user", content: data.message });
    if (mErr) throw mErr;

    // Fase 3: triagem por IA + resposta automática (best-effort)
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { runTicketAutomation } = await import("@/lib/support-automation.server");
      await runTicketAutomation(supabaseAdmin, t as any, data.message);
    } catch (e) {
      console.warn("[support automation]", (e as Error)?.message);
    }

    return { ticket: t };
  });

// ============ SHARED ============

export const listMessages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { ticket_id: string }) => ({ ticket_id: String(d.ticket_id) }))
  .handler(async ({ context, data }) => {
    const { data: rows, error } = await context.supabase
      .from("support_message")
      .select("*")
      .eq("ticket_id", data.ticket_id)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return { rows: rows ?? [] };
  });

export const sendMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { ticket_id: string; content: string; attachments?: any[] }) => ({
    ticket_id: String(d.ticket_id),
    content: String(d.content || "").trim(),
    attachments: Array.isArray(d.attachments) ? d.attachments.slice(0, 10) : [],
  }))
  .handler(async ({ context, data }) => {
    if (!data.content && data.attachments.length === 0) throw new Error("Mensagem vazia");
    const isAdmin = await isSuperAdmin(context.supabase, context.userId);
    const senderRole = isAdmin ? "admin" : "user";

    const { error } = await context.supabase.from("support_message").insert({
      ticket_id: data.ticket_id,
      sender_id: context.userId,
      sender_role: senderRole,
      content: data.content || "",
      attachments: data.attachments,
    });
    if (error) throw error;

    // Update ticket counters + timestamp
    const { data: t } = await context.supabase
      .from("support_ticket").select("unread_admin,unread_user,first_response_at")
      .eq("id", data.ticket_id).maybeSingle();
    const patch: any = { last_message_at: new Date().toISOString() };
    if (senderRole === "user") patch.unread_admin = ((t as any)?.unread_admin ?? 0) + 1;
    else {
      patch.unread_user = ((t as any)?.unread_user ?? 0) + 1;
      patch.status = "andamento";
      if (!(t as any)?.first_response_at) patch.first_response_at = new Date().toISOString();
    }
    await context.supabase.from("support_ticket").update(patch).eq("id", data.ticket_id);
    return { ok: true };
  });


export const markRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { ticket_id: string }) => ({ ticket_id: String(d.ticket_id) }))
  .handler(async ({ context, data }) => {
    const isAdmin = await isSuperAdmin(context.supabase, context.userId);
    const patch = isAdmin ? { unread_admin: 0 } : { unread_user: 0 };
    await context.supabase.from("support_ticket").update(patch).eq("id", data.ticket_id);
    // Confirmação de leitura nas mensagens do outro lado
    await context.supabase
      .from("support_message")
      .update({ read_at: new Date().toISOString() })
      .eq("ticket_id", data.ticket_id)
      .eq("sender_role", isAdmin ? "user" : "admin")
      .is("read_at", null);
    return { ok: true };
  });

// ============ MASTER (super admin) ============

export const listAllTickets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { status?: "aberto" | "andamento" | "resolvido" | "todos" }) => ({
    status: d?.status ?? "todos",
  }))
  .handler(async ({ context, data }) => {
    if (!(await isSuperAdmin(context.supabase, context.userId))) throw new Error("Acesso negado");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin
      .from("support_ticket")
      .select("*, company:company_id(id,nome,logo_url)")
      .order("last_message_at", { ascending: false })
      .limit(200);
    if (data.status !== "todos") q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw error;

    // Foto de perfil de quem abriu o chamado
    const ids = Array.from(new Set((rows ?? []).map((r: any) => r.created_by).filter(Boolean)));
    let avatars: Record<string, { avatar_url?: string; nome?: string }> = {};
    if (ids.length) {
      const { data: profs } = await supabaseAdmin
        .from("profiles").select("user_id, nome, nome_completo, avatar_url").in("user_id", ids);
      avatars = Object.fromEntries((profs ?? []).map((p: any) => [
        p.user_id,
        { avatar_url: p.avatar_url, nome: p.nome_completo || p.nome },
      ]));
    }

    return {
      rows: (rows ?? []).map((r: any) => ({
        ...r,
        criador_avatar: avatars[r.created_by]?.avatar_url ?? null,
        criador_nome: avatars[r.created_by]?.nome ?? null,
      })),
    };
  });

export const setTicketStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { ticket_id: string; status: "aberto" | "andamento" | "resolvido" }) => ({
    ticket_id: String(d.ticket_id),
    status: d.status,
  }))
  .handler(async ({ context, data }) => {
    if (!(await isSuperAdmin(context.supabase, context.userId))) throw new Error("Acesso negado");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("support_ticket")
      .update({
        status: data.status,
        resolved_at: data.status === "resolvido" ? new Date().toISOString() : null,
      })
      .eq("id", data.ticket_id);
    if (error) throw error;

    // Fase 3: dispara pesquisa de satisfação ao resolver
    if (data.status === "resolvido") {
      try {
        const { loadSupportConfig } = await import("@/lib/support-automation.server");
        const cfg = await loadSupportConfig(supabaseAdmin);
        const { data: t } = await supabaseAdmin
          .from("support_ticket").select("csat_score").eq("id", data.ticket_id).maybeSingle();
        if (cfg.csat_enabled && !(t as any)?.csat_score) {
          await supabaseAdmin.from("support_message").insert({
            ticket_id: data.ticket_id,
            sender_id: null,
            sender_role: "admin",
            content: cfg.csat_message,
          });
          await supabaseAdmin.from("support_ticket")
            .update({ unread_user: 1, last_message_at: new Date().toISOString() })
            .eq("id", data.ticket_id);
        }
      } catch (e) {
        console.warn("[support csat]", (e as Error)?.message);
      }
    }

    return { ok: true };
  });

// ============ CONTEXTO DO CLIENTE (master) ============

export const ticketContext = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { ticket_id: string }) => ({ ticket_id: String(d.ticket_id) }))
  .handler(async ({ context, data }) => {
    if (!(await isSuperAdmin(context.supabase, context.userId))) throw new Error("Acesso negado");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: ticket } = await supabaseAdmin
      .from("support_ticket").select("id, company_id, created_at")
      .eq("id", data.ticket_id).maybeSingle();
    if (!ticket) throw new Error("Chamado não encontrado");
    const cid = (ticket as any).company_id as string;

    const [{ data: company }, { data: sub }, { data: conns }, { data: prev }, { data: owner }] =
      await Promise.all([
        supabaseAdmin.from("company")
          .select("id, nome, nome_fantasia, logo_url, email_corporativo, telefone, segmento, status_cobranca, trial_ate, creditos_saldo, onboarding_completed, created_at, wa_provider")
          .eq("id", cid).maybeSingle(),
        supabaseAdmin.from("subscription")
          .select("status, cortesia, valor_customizado_cents, current_period_end, cancel_at_period_end, plan:plan(nome, preco_cents, creditos_mensais)")
          .eq("company_id", cid).order("created_at", { ascending: false }).limit(1).maybeSingle(),
        supabaseAdmin.from("whatsapp_instances")
          .select("id, instance_name, display_name, numero, status, paused, provider_type")
          .eq("company_id", cid).limit(10),
        supabaseAdmin.from("support_ticket")
          .select("id, assunto, status, created_at")
          .eq("company_id", cid).neq("id", data.ticket_id)
          .order("created_at", { ascending: false }).limit(3),
        supabaseAdmin.from("company_user")
          .select("user_id, role")
          .eq("company_id", cid).eq("ativo", true)
          .order("created_at", { ascending: true }).limit(1).maybeSingle(),
      ]);

    let ownerProfile: any = null;
    if ((owner as any)?.user_id) {
      const { data: prof } = await supabaseAdmin
        .from("profiles").select("nome, nome_completo, email, avatar_url, telefone")
        .eq("user_id", (owner as any).user_id).maybeSingle();
      ownerProfile = prof ?? null;
    }

    const plan: any = (sub as any)?.plan ?? null;
    const trialAte = (company as any)?.trial_ate ? new Date((company as any).trial_ate) : null;
    const trialDias = trialAte
      ? Math.ceil((trialAte.getTime() - Date.now()) / 86400000)
      : null;

    return {
      company: company ?? null,
      owner: ownerProfile,
      subscription: sub
        ? {
            status: (sub as any).status,
            cortesia: (sub as any).cortesia,
            plano: plan?.nome ?? "—",
            valor_cents: (sub as any).valor_customizado_cents ?? plan?.preco_cents ?? 0,
            creditos_mensais: plan?.creditos_mensais ?? 0,
            current_period_end: (sub as any).current_period_end,
            cancel_at_period_end: (sub as any).cancel_at_period_end,
          }
        : null,
      conexoes: conns ?? [],
      trial_dias: trialDias,
      chamados_anteriores: prev ?? [],
    };
  });

// ============ MACROS / RESPOSTAS RÁPIDAS (master) ============

export const listMacros = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!(await isSuperAdmin(context.supabase, context.userId))) return { rows: [] };
    const { data, error } = await context.supabase
      .from("support_macro").select("*")
      .order("ordem", { ascending: true }).order("titulo", { ascending: true });
    if (error) throw error;
    return { rows: data ?? [] };
  });

export const upsertMacro = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id?: string; titulo: string; atalho: string; conteudo: string; categoria?: string; ordem?: number }) => ({
    id: d.id ? String(d.id) : undefined,
    titulo: String(d.titulo || "").trim().slice(0, 80),
    atalho: String(d.atalho || "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 24),
    conteudo: String(d.conteudo || "").trim().slice(0, 4000),
    categoria: String(d.categoria || "Geral").trim().slice(0, 40) || "Geral",
    ordem: Number.isFinite(d.ordem as number) ? Number(d.ordem) : 0,
  }))
  .handler(async ({ context, data }) => {
    if (!(await isSuperAdmin(context.supabase, context.userId))) throw new Error("Acesso negado");
    if (!data.titulo || !data.atalho || !data.conteudo) throw new Error("Preencha título, atalho e conteúdo");
    const payload = {
      titulo: data.titulo, atalho: data.atalho, conteudo: data.conteudo,
      categoria: data.categoria, ordem: data.ordem, updated_at: new Date().toISOString(),
    };
    if (data.id) {
      const { error } = await context.supabase.from("support_macro").update(payload).eq("id", data.id);
      if (error) throw error;
    } else {
      const { error } = await context.supabase.from("support_macro").insert(payload);
      if (error) throw error;
    }
    return { ok: true };
  });

export const deleteMacro = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => ({ id: String(d.id) }))
  .handler(async ({ context, data }) => {
    if (!(await isSuperAdmin(context.supabase, context.userId))) throw new Error("Acesso negado");
    const { error } = await context.supabase.from("support_macro").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

// ============ FASE 2: PRIORIDADE / CATEGORIA / ATRIBUIÇÃO / SLA ============

export const setTicketMeta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    ticket_id: string;
    prioridade?: "baixa" | "normal" | "alta" | "urgente";
    categoria?: string;
    assigned_to?: string | null;
  }) => ({
    ticket_id: String(d.ticket_id),
    prioridade: d.prioridade,
    categoria: d.categoria ? String(d.categoria).slice(0, 40) : undefined,
    assigned_to: d.assigned_to === undefined ? undefined : (d.assigned_to ? String(d.assigned_to) : null),
  }))
  .handler(async ({ context, data }) => {
    if (!(await isSuperAdmin(context.supabase, context.userId))) throw new Error("Acesso negado");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const patch: any = {};
    if (data.prioridade) patch.prioridade = data.prioridade;
    if (data.categoria) patch.categoria = data.categoria;
    if (data.assigned_to !== undefined) patch.assigned_to = data.assigned_to;

    if (data.prioridade) {
      const { data: t } = await supabaseAdmin
        .from("support_ticket").select("created_at, first_response_at")
        .eq("id", data.ticket_id).maybeSingle();
      if (t && !(t as any).first_response_at) {
        const base = new Date((t as any).created_at).getTime();
        patch.sla_due_at = new Date(base + (SLA_MINUTOS[data.prioridade] ?? 480) * 60000).toISOString();
      }
    }

    if (Object.keys(patch).length === 0) return { ok: true };
    const { error } = await supabaseAdmin.from("support_ticket").update(patch).eq("id", data.ticket_id);
    if (error) throw error;
    return { ok: true };
  });

export const listSupportAgents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!(await isSuperAdmin(context.supabase, context.userId))) return { rows: [] };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: roles } = await supabaseAdmin
      .from("user_roles").select("user_id").eq("role", "super_admin");
    const ids = (roles ?? []).map((r: any) => r.user_id);
    if (ids.length === 0) return { rows: [] };
    const { data: profs } = await supabaseAdmin
      .from("profiles").select("user_id, nome, nome_completo, email, avatar_url")
      .in("user_id", ids);
    return {
      rows: (profs ?? []).map((p: any) => ({
        user_id: p.user_id,
        nome: p.nome_completo || p.nome || p.email || "Agente",
        email: p.email,
        avatar_url: p.avatar_url,
      })),
    };
  });

// ============ NOTAS INTERNAS ============

export const listNotes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { ticket_id: string }) => ({ ticket_id: String(d.ticket_id) }))
  .handler(async ({ context, data }) => {
    if (!(await isSuperAdmin(context.supabase, context.userId))) return { rows: [] };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("support_note").select("*")
      .eq("ticket_id", data.ticket_id)
      .order("created_at", { ascending: false }).limit(100);
    if (error) throw error;
    const ids = Array.from(new Set((rows ?? []).map((r: any) => r.author_id).filter(Boolean)));
    let map: Record<string, string> = {};
    if (ids.length) {
      const { data: profs } = await supabaseAdmin
        .from("profiles").select("user_id, nome, nome_completo, email").in("user_id", ids);
      map = Object.fromEntries((profs ?? []).map((p: any) => [
        p.user_id, p.nome_completo || p.nome || p.email || "Agente",
      ]));
    }
    return {
      rows: (rows ?? []).map((r: any) => ({ ...r, author_nome: map[r.author_id] ?? "Agente" })),
    };
  });

export const addNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { ticket_id: string; content: string }) => ({
    ticket_id: String(d.ticket_id),
    content: String(d.content || "").trim().slice(0, 4000),
  }))
  .handler(async ({ context, data }) => {
    if (!(await isSuperAdmin(context.supabase, context.userId))) throw new Error("Acesso negado");
    if (!data.content) throw new Error("Nota vazia");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("support_note").insert({
      ticket_id: data.ticket_id, author_id: context.userId, content: data.content,
    });
    if (error) throw error;
    return { ok: true };
  });

export const deleteNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => ({ id: String(d.id) }))
  .handler(async ({ context, data }) => {
    if (!(await isSuperAdmin(context.supabase, context.userId))) throw new Error("Acesso negado");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("support_note").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

// ============ FASE 3: CONFIG / AUTOMAÇÃO / CSAT / MÉTRICAS ============

export const getSupportConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: Record<string, any>) => d ?? {})
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { loadSupportConfig } = await import("@/lib/support-automation.server");
    return { config: await loadSupportConfig(supabaseAdmin) };
  });

export const saveSupportConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: Record<string, any>) => d ?? {})
  .handler(async ({ context, data }) => {
    if (!(await isSuperAdmin(context.supabase, context.userId))) throw new Error("Acesso negado");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch: any = {
      auto_reply_enabled: !!data.auto_reply_enabled,
      auto_reply_message: String(data.auto_reply_message || "").slice(0, 2000),
      offhours_enabled: !!data.offhours_enabled,
      offhours_message: String(data.offhours_message || "").slice(0, 2000),
      horario_inicio: Math.min(23, Math.max(0, Number(data.horario_inicio ?? 9))),
      horario_fim: Math.min(24, Math.max(1, Number(data.horario_fim ?? 18))),
      dias_semana: Array.isArray(data.dias_semana) ? data.dias_semana.map(Number) : [1, 2, 3, 4, 5],
      csat_enabled: !!data.csat_enabled,
      csat_message: String(data.csat_message || "").slice(0, 500),
      auto_resolve_dias: Math.min(30, Math.max(0, Number(data.auto_resolve_dias ?? 0))),
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabaseAdmin.from("support_config").update(patch).eq("id", true);
    if (error) throw error;
    return { ok: true };
  });

/** Cliente responde a pesquisa de satisfação do chamado */
export const submitTicketCsat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { ticket_id: string; score: number; comment?: string }) => ({
    ticket_id: String(d.ticket_id),
    score: Math.min(5, Math.max(1, Number(d.score) || 0)),
    comment: String(d.comment || "").trim().slice(0, 500),
  }))
  .handler(async ({ context, data }) => {
    if (!data.score) throw new Error("Nota inválida");
    const cid = await resolveCompanyId(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: t } = await supabaseAdmin
      .from("support_ticket").select("id, company_id, csat_score")
      .eq("id", data.ticket_id).maybeSingle();
    if (!t) throw new Error("Chamado não encontrado");
    if ((t as any).company_id !== cid) throw new Error("Acesso negado");
    if ((t as any).csat_score) return { ok: true, already: true };
    const { error } = await supabaseAdmin.from("support_ticket").update({
      csat_score: data.score,
      csat_comment: data.comment || null,
      csat_at: new Date().toISOString(),
    }).eq("id", data.ticket_id);
    if (error) throw error;
    return { ok: true };
  });

/** Métricas do suporte (master) */
export const supportMetrics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { dias?: number }) => ({ dias: Math.min(180, Math.max(7, Number(d?.dias) || 30)) }))
  .handler(async ({ context, data }) => {
    if (!(await isSuperAdmin(context.supabase, context.userId))) throw new Error("Acesso negado");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const desde = new Date(Date.now() - data.dias * 86400000).toISOString();
    const { data: rows, error } = await supabaseAdmin
      .from("support_ticket")
      .select("id, status, prioridade, categoria, created_at, first_response_at, resolved_at, sla_due_at, csat_score")
      .gte("created_at", desde)
      .limit(2000);
    if (error) throw error;
    const list = (rows ?? []) as any[];

    const abertos = list.filter((t) => t.status !== "resolvido").length;
    const resolvidos = list.filter((t) => t.status === "resolvido").length;

    const frTimes = list.filter((t) => t.first_response_at)
      .map((t) => (new Date(t.first_response_at).getTime() - new Date(t.created_at).getTime()) / 60000);
    const resTimes = list.filter((t) => t.resolved_at)
      .map((t) => (new Date(t.resolved_at).getTime() - new Date(t.created_at).getTime()) / 60000);
    const avg = (a: number[]) => (a.length ? Math.round(a.reduce((s, x) => s + x, 0) / a.length) : 0);

    const comSla = list.filter((t) => t.sla_due_at);
    const slaOk = comSla.filter((t) => t.first_response_at && new Date(t.first_response_at) <= new Date(t.sla_due_at)).length;

    const csats = list.filter((t) => t.csat_score).map((t) => Number(t.csat_score));
    const csatMedio = csats.length ? Number((csats.reduce((s, x) => s + x, 0) / csats.length).toFixed(2)) : 0;

    const byKey = (key: string) => {
      const m: Record<string, number> = {};
      for (const t of list) m[t[key] || "—"] = (m[t[key] || "—"] ?? 0) + 1;
      return Object.entries(m).map(([nome, total]) => ({ nome, total })).sort((a, b) => b.total - a.total);
    };

    const porDia: { dia: string; total: number }[] = [];
    for (let i = data.dias - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      const key = d.toISOString().slice(0, 10);
      porDia.push({ dia: key, total: list.filter((t) => String(t.created_at).slice(0, 10) === key).length });
    }

    return {
      total: list.length,
      abertos,
      resolvidos,
      tempo_primeira_resposta_min: avg(frTimes),
      tempo_resolucao_min: avg(resTimes),
      sla_percent: comSla.length ? Math.round((slaOk / comSla.length) * 100) : 100,
      csat_medio: csatMedio,
      csat_respostas: csats.length,
      por_categoria: byKey("categoria"),
      por_prioridade: byKey("prioridade"),
      por_dia: porDia,
    };
  });
