import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function buildOrigin() {
  const { getRequest } = await import("@tanstack/react-start/server");
  const req = getRequest();
  const u = new URL(req.url);
  // No preview domain, use the official one
  if (u.host.includes("metrixcrm.com.br")) {
    return "https://metrixcrm.com.br";
  }
  // If it's localhost or anything else (like lovable.app previews), use the current host
  return `${u.protocol}//${u.host}`;
}


export const startGoogleOAuth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
    if (!clientId || (!process.env.GOOGLE_OAUTH_CLIENT_SECRET && !process.env.GOOGLE_CLIENT_SECRET)) {
      return { ok: false as const, error: "Google OAuth não configurado. Peça ao administrador para definir GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET." };
    }
    const { supabase, userId } = context;
    const { data: cu } = await supabase
      .from("company_user").select("company_id").eq("user_id", userId).eq("ativo", true)
      .order("created_at", { ascending: true }).limit(1).maybeSingle();
    if (!cu) return { ok: false as const, error: "Sem empresa." };

    const { getCompanyPlan } = await import("@/lib/plan-limits.server");
    const { featuresFor, PLAN_LABEL } = await import("@/lib/plan-features");
    const plan = await getCompanyPlan(cu.company_id);
    if (!featuresFor(plan.slug).googleCalendar) {
      return { ok: false as const, error: `Google Agenda não está incluso no plano ${PLAN_LABEL[plan.slug]}. Faça upgrade para Pro.` };
    }

    const origin = await buildOrigin();
    const redirectUri = `${origin}/api/public/google-callback`;
    const payload = Buffer.from(JSON.stringify({ companyId: cu.company_id, t: Date.now() })).toString("base64url");
    const { signState } = await import("@/lib/google.server");
    const state = signState(payload);
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
    url.searchParams.set("include_granted_scopes", "true");
    url.searchParams.set("scope", "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/userinfo.email");
    url.searchParams.set("state", state);
    return { ok: true as const, url: url.toString() };
  });

export const disconnectGoogle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: cu } = await supabase
      .from("company_user").select("company_id,role").eq("user_id", userId).eq("ativo", true)
      .order("created_at", { ascending: true }).limit(1).maybeSingle();
    if (!cu || !["owner", "admin"].includes(cu.role)) return { ok: false };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("google_integration").upsert(
      { company_id: cu.company_id, conectado: false, access_token: null, refresh_token: null, expiry: null, email: null, calendar_id: null },
      { onConflict: "company_id" },
    );
    return { ok: true };
  });

export const createGoogleCalendarEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { titulo: string; inicio: string; fim: string; cardId?: string | null; descricao?: string }) => d)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: cu } = await supabase
      .from("company_user").select("company_id").eq("user_id", userId).eq("ativo", true)
      .order("created_at", { ascending: true }).limit(1).maybeSingle();
    if (!cu) throw new Error("Sem empresa");
    const companyId = cu.company_id;

    // Tokens are not readable via authenticated RLS — use admin client server-side
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: gi } = await supabaseAdmin.from("google_integration").select("*").eq("company_id", companyId).maybeSingle();
    if (!gi?.conectado) throw new Error("Google Agenda não conectado");

    // Refresh if needed
    let accessToken = gi.access_token as string;
    if (gi.expiry && new Date(gi.expiry).getTime() < Date.now() + 60_000 && gi.refresh_token) {
      const tokRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: process.env.GOOGLE_CLIENT_ID!,
          client_secret: process.env.GOOGLE_CLIENT_SECRET!,
          refresh_token: gi.refresh_token as string,
          grant_type: "refresh_token",
        }),
      });
      const tok = await tokRes.json();
      if (tok.access_token) {
        accessToken = tok.access_token;
        await supabaseAdmin.from("google_integration").update({
          access_token: accessToken,
          expiry: new Date(Date.now() + (tok.expires_in ?? 3600) * 1000).toISOString(),
        }).eq("company_id", companyId);
      }
    }

    const calendarId = gi.calendar_id || "primary";
    const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        summary: data.titulo,
        description: data.descricao || "",
        start: { dateTime: data.inicio },
        end: { dateTime: data.fim },
      }),
    });
    if (!res.ok) throw new Error(`Google API: ${res.status}`);
    const ev = await res.json();

    await supabase.from("agendamento").insert({
      company_id: companyId,
      card_id: data.cardId ?? null,
      titulo: data.titulo,
      inicio: data.inicio,
      fim: data.fim,
      google_event_id: ev.id,
      status: "agendado",
    });
    return { ok: true, eventId: ev.id };
  });

export const getGoogleStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { resolveCompanyIdCached } = await import("./company-cache");
    const companyId = await resolveCompanyIdCached(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: gi } = await supabaseAdmin
      .from("google_integration")
      .select("conectado,email,calendar_id,expiry,ultima_sync_em,channel_expira_em,precisa_reconectar")
      .eq("company_id", companyId)
      .maybeSingle();
    return {
      configured: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
      conectado: !!gi?.conectado,
      email: gi?.email ?? null,
      calendarId: gi?.calendar_id ?? null,
      expiry: gi?.expiry ?? null,
      ultimaSync: (gi as any)?.ultima_sync_em ?? null,
      canalExpira: (gi as any)?.channel_expira_em ?? null,
      precisaReconectar: !!(gi as any)?.precisa_reconectar,
    };

  });

export const listGoogleCalendars = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { resolveCompanyIdCached } = await import("./company-cache");
    const companyId = await resolveCompanyIdCached(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getValidAccessToken } = await import("./google.server");
    const auth = await getValidAccessToken(supabaseAdmin, companyId);
    if (!auth) return { ok: false as const, error: "Google Agenda não conectado", items: [] };
    const res = await fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList", {
      headers: { Authorization: `Bearer ${auth.token}` },
    });
    if (!res.ok) return { ok: false as const, error: `Google API: ${res.status} ${await res.text()}`, items: [] };
    const json = await res.json();
    return {
      ok: true as const,
      error: null,
      items: (json.items ?? []).map((c: any) => ({ id: c.id as string, summary: (c.summaryOverride || c.summary) as string, primary: !!c.primary })),
    };
  });

export const setGoogleCalendar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { calendarId: string }) => d)
  .handler(async ({ context, data }) => {
    const { resolveCompanyIdCached } = await import("./company-cache");
    const companyId = await resolveCompanyIdCached(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("google_integration")
      .update({ calendar_id: data.calendarId })
      .eq("company_id", companyId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const testGoogleCalendar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { resolveCompanyIdCached } = await import("./company-cache");
    const companyId = await resolveCompanyIdCached(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getValidAccessToken } = await import("./google.server");
    const auth = await getValidAccessToken(supabaseAdmin, companyId);
    if (!auth) return { ok: false as const, error: "Google Agenda não conectado" };
    const calendarId = auth.gi.calendar_id || "primary";
    const inicio = new Date(Date.now() + 3600_000);
    const fim = new Date(Date.now() + 5400_000);
    const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`, {
      method: "POST",
      headers: { Authorization: `Bearer ${auth.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        summary: "Teste de integração — Metrix CRM",
        description: "Evento de teste criado pelo plugin Google Calendar.",
        start: { dateTime: inicio.toISOString() },
        end: { dateTime: fim.toISOString() },
      }),
    });
    if (!res.ok) return { ok: false as const, error: `Google API: ${res.status} ${await res.text()}` };
    const ev = await res.json();
    return { ok: true as const, link: (ev.htmlLink as string) ?? null };
  });

// ---------- Sincronização bidirecional / disponibilidade ----------

async function companyOf(supabase: any, userId: string) {
  const { resolveCompanyIdCached } = await import("./company-cache");
  return resolveCompanyIdCached(supabase, userId);
}

/** Horários ocupados na agenda conectada (para sugerir horários livres). */
export const listFreeBusy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { from: string; to: string }) => d)
  .handler(async ({ context, data }) => {
    const companyId = await companyOf(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { requireCapacidade } = await import("./plugin-gate.server");
    await requireCapacidade(context.supabase, companyId, "google-calendar");
    const { getFreeBusy } = await import("./google.server");
    const busy = await getFreeBusy(supabaseAdmin, companyId, data.from, data.to);
    if (!busy) return { ok: false as const, busy: [] as { start: string; end: string }[] };
    return { ok: true as const, busy };
  });

/** (Re)ativa o canal de notificações push do Google para esta empresa. */
export const startCalendarSync = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const companyId = await companyOf(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { startCalendarWatch } = await import("./google.server");
    const origin = await buildOrigin();
    return startCalendarWatch(supabaseAdmin, companyId, `${origin}/api/public/hooks/google-calendar`);
  });

/** Puxa agora as mudanças feitas direto no Google. */
export const syncGoogleNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const companyId = await companyOf(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { pullCalendarChanges } = await import("./google.server");
    return pullCalendarChanges(supabaseAdmin, companyId);
  });

export const gerarLinkMeet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    agendamentoId?: string | null;
    titulo?: string | null;
    mensagem?: string | null;
    agendado_para: string;
    duracao_min?: number | null;
    local?: string | null;
  }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: cu } = await supabase
      .from("company_user").select("company_id").eq("user_id", userId).eq("ativo", true)
      .order("created_at", { ascending: true }).limit(1).maybeSingle();
    if (!cu) return { ok: false as const, error: "Sem empresa." };

    const { capacidadeAtiva } = await import("@/lib/plugin-gate.server");
    if (!(await capacidadeAtiva(supabase, cu.company_id, "google-meet"))) {
      return {
        ok: false as const,
        error: "Instale o plugin Google Meet na Loja de Plugins para gerar links de reunião.",
      };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { ensureMeetLink } = await import("@/lib/google.server");

    let eventId: string | null = null;
    let calendarId: string | null = null;
    if (data.agendamentoId) {
      const { data: ag } = await supabase
        .from("mensagem_agendada")
        .select("google_event_id,google_calendar_id")
        .eq("id", data.agendamentoId)
        .eq("company_id", cu.company_id)
        .maybeSingle();
      eventId = ag?.google_event_id ?? null;
      calendarId = ag?.google_calendar_id ?? null;
    }

    const r = await ensureMeetLink(supabaseAdmin as any, cu.company_id, {
      eventId,
      calendarId,
      titulo: data.titulo,
      mensagem: data.mensagem,
      inicio: data.agendado_para,
      duracaoMin: data.duracao_min,
      local: data.local,
    });
    if (!r.ok) return { ok: false as const, error: r.error };

    if (data.agendamentoId) {
      await supabase
        .from("mensagem_agendada")
        .update({
          link_reuniao: r.link,
          google_event_id: r.eventId,
          google_calendar_id: r.calendarId,
        })
        .eq("id", data.agendamentoId)
        .eq("company_id", cu.company_id);
    }
    return { ok: true as const, link: r.link, eventId: r.eventId, calendarId: r.calendarId };
  });
