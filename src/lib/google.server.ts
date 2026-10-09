import { createHmac } from "node:crypto";

export function signState(payload: string) {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY || "fallback";
  const sig = createHmac("sha256", secret).update(payload).digest("hex").slice(0, 16);
  return `${payload}.${sig}`;
}

export function verifyState(state: string): { companyId: string } | null {
  const parts = state.split(".");
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY || "fallback";
  const expected = createHmac("sha256", secret).update(payload).digest("hex").slice(0, 16);
  if (sig !== expected) return null;
  try {
    const obj = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!obj.companyId) return null;
    return { companyId: obj.companyId as string };
  } catch {
    return null;
  }
}

// Cria evento no Google Agenda usando os tokens armazenados da empresa.
// Refresca o access_token se expirou. Insere também na tabela agendamento.
export async function createCalendarEventForCompany(
  admin: any,
  companyId: string,
  data: { titulo: string; inicio: string; fim: string; descricao?: string; cardId?: string | null },
) {
  const { data: gi } = await admin.from("google_integration").select("*").eq("company_id", companyId).maybeSingle();
  if (!gi?.conectado) throw new Error("Google Agenda não conectado");

  let accessToken = gi.access_token as string;
  if (gi.expiry && new Date(gi.expiry).getTime() < Date.now() + 60_000 && gi.refresh_token) {
    const tokRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_OAUTH_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || "",
        client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET || "",
        refresh_token: gi.refresh_token as string,
        grant_type: "refresh_token",
      }),
    });
    const tok = await tokRes.json();
    if (tok.access_token) {
      accessToken = tok.access_token;
      await admin.from("google_integration").update({
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

  await admin.from("agendamento").insert({
    company_id: companyId,
    card_id: data.cardId ?? null,
    titulo: data.titulo,
    inicio: data.inicio,
    fim: data.fim,
    google_event_id: ev.id,
    status: "agendado",
  });
  return { eventId: ev.id };
}

// Retorna um access_token válido (refresca se necessário) para a empresa.
export async function getValidAccessToken(admin: any, companyId: string): Promise<{ token: string; gi: any } | null> {
  const { data: gi } = await admin.from("google_integration").select("*").eq("company_id", companyId).maybeSingle();
  if (!gi?.conectado || !gi.access_token) return null;
  let token = gi.access_token as string;
  if (gi.expiry && new Date(gi.expiry).getTime() < Date.now() + 60_000 && gi.refresh_token) {
    const tokRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID || "",
        client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
        refresh_token: gi.refresh_token as string,
        grant_type: "refresh_token",
      }),
    });
    const tok = await tokRes.json();
    if (tok.access_token) {
      token = tok.access_token;
      await admin.from("google_integration").update({
        access_token: token,
        expiry: new Date(Date.now() + (tok.expires_in ?? 3600) * 1000).toISOString(),
      }).eq("company_id", companyId);
    }
  }
  return { token, gi };
}

// ---------- Google Calendar: helpers de sincronização ----------

const GCAL = "https://www.googleapis.com/calendar/v3";

async function gcalFetch(token: string, path: string, init?: RequestInit) {
  const res = await fetch(`${GCAL}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  return res;
}

export function buildEventBody(a: {
  titulo?: string | null;
  mensagem?: string | null;
  inicio: string;
  duracaoMin?: number | null;
  local?: string | null;
  link?: string | null;
}) {
  const start = new Date(a.inicio);
  const end = new Date(start.getTime() + (a.duracaoMin || 30) * 60_000);
  return {
    summary: a.titulo || "Compromisso Metrix CRM",
    description: [a.mensagem || "", a.link ? `Link: ${a.link}` : ""].filter(Boolean).join("\n"),
    location: a.local || undefined,
    start: { dateTime: start.toISOString() },
    end: { dateTime: end.toISOString() },
  };
}

/** Cria ou atualiza o evento no Google. Retorna o id do evento ou null. */
export async function upsertCalendarEvent(
  admin: any,
  companyId: string,
  agendamento: {
    id: string;
    google_event_id?: string | null;
    titulo?: string | null;
    mensagem?: string | null;
    agendado_para: string;
    duracao_min?: number | null;
    local?: string | null;
    link_reuniao?: string | null;
  },
): Promise<{ eventId: string; calendarId: string } | null> {
  const auth = await getValidAccessToken(admin, companyId);
  if (!auth?.gi?.conectado) return null;
  const calendarId = auth.gi.calendar_id || "primary";
  const body = buildEventBody({
    titulo: agendamento.titulo,
    mensagem: agendamento.mensagem,
    inicio: agendamento.agendado_para,
    duracaoMin: agendamento.duracao_min,
    local: agendamento.local,
    link: agendamento.link_reuniao,
  });
  const base = `/calendars/${encodeURIComponent(calendarId)}/events`;
  let res = agendamento.google_event_id
    ? await gcalFetch(auth.token, `${base}/${encodeURIComponent(agendamento.google_event_id)}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      })
    : await gcalFetch(auth.token, base, { method: "POST", body: JSON.stringify(body) });

  // Evento sumiu do Google: recria.
  if (!res.ok && res.status === 404 && agendamento.google_event_id) {
    res = await gcalFetch(auth.token, base, { method: "POST", body: JSON.stringify(body) });
  }
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      await admin.from("google_integration").update({ precisa_reconectar: true }).eq("company_id", companyId);
    }
    console.error("[gcal] upsert falhou", res.status, await res.text());
    return null;
  }
  const ev = await res.json();
  await admin
    .from("mensagem_agendada")
    .update({
      google_event_id: ev.id,
      google_calendar_id: calendarId,
      sincronizado_em: new Date().toISOString(),
    })
    .eq("id", agendamento.id);
  return { eventId: ev.id as string, calendarId };
}

/** Remove o evento no Google (ignora 404/410). */
export async function deleteCalendarEvent(
  admin: any,
  companyId: string,
  eventId: string,
  calendarIdIn?: string | null,
): Promise<boolean> {
  const auth = await getValidAccessToken(admin, companyId);
  if (!auth?.gi?.conectado) return false;
  const calendarId = calendarIdIn || auth.gi.calendar_id || "primary";
  const res = await gcalFetch(
    auth.token,
    `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    { method: "DELETE" },
  );
  return res.ok || res.status === 404 || res.status === 410;
}

/** Períodos ocupados na agenda conectada. */
export async function getFreeBusy(
  admin: any,
  companyId: string,
  timeMin: string,
  timeMax: string,
): Promise<{ start: string; end: string }[] | null> {
  const auth = await getValidAccessToken(admin, companyId);
  if (!auth?.gi?.conectado) return null;
  const calendarId = auth.gi.calendar_id || "primary";
  const res = await gcalFetch(auth.token, `/freeBusy`, {
    method: "POST",
    body: JSON.stringify({ timeMin, timeMax, items: [{ id: calendarId }] }),
  });
  if (!res.ok) {
    console.error("[gcal] freeBusy falhou", res.status, await res.text());
    return null;
  }
  const json = await res.json();
  return (json.calendars?.[calendarId]?.busy ?? []) as { start: string; end: string }[];
}

/** Abre (ou renova) o canal de notificações push do Google para a empresa. */
export async function startCalendarWatch(admin: any, companyId: string, callbackUrl: string) {
  const auth = await getValidAccessToken(admin, companyId);
  if (!auth?.gi?.conectado) return { ok: false as const, error: "Google Agenda não conectado" };
  const calendarId = auth.gi.calendar_id || "primary";

  // Encerra canal anterior, se houver.
  if (auth.gi.channel_id && auth.gi.resource_id) {
    try {
      await gcalFetch(auth.token, "/channels/stop", {
        method: "POST",
        body: JSON.stringify({ id: auth.gi.channel_id, resourceId: auth.gi.resource_id }),
      });
    } catch {}
  }

  const channelId = crypto.randomUUID();
  const token = crypto.randomUUID().replace(/-/g, "");
  const res = await gcalFetch(auth.token, `/calendars/${encodeURIComponent(calendarId)}/events/watch`, {
    method: "POST",
    body: JSON.stringify({ id: channelId, type: "web_hook", address: callbackUrl, token }),
  });
  if (!res.ok) {
    const text = await res.text();
    console.error("[gcal] watch falhou", res.status, text);
    return { ok: false as const, error: `Google API: ${res.status}` };
  }
  const json = await res.json();
  await admin
    .from("google_integration")
    .update({
      channel_id: channelId,
      resource_id: json.resourceId ?? null,
      channel_token: token,
      channel_expira_em: json.expiration ? new Date(Number(json.expiration)).toISOString() : null,
    })
    .eq("company_id", companyId);
  return { ok: true as const, channelId };
}

/**
 * Puxa mudanças do Google para o CRM (incremental via syncToken).
 * Atualiza horário/título e cancela compromissos apagados no Google.
 */
export async function pullCalendarChanges(admin: any, companyId: string) {
  const auth = await getValidAccessToken(admin, companyId);
  if (!auth?.gi?.conectado) return { ok: false as const, error: "não conectado" };
  const calendarId = auth.gi.calendar_id || "primary";

  const params = new URLSearchParams({ showDeleted: "true", maxResults: "250", singleEvents: "true" });
  if (auth.gi.sync_token) params.set("syncToken", auth.gi.sync_token);
  else params.set("timeMin", new Date(Date.now() - 7 * 86400_000).toISOString());

  let res = await gcalFetch(auth.token, `/calendars/${encodeURIComponent(calendarId)}/events?${params}`);
  if (res.status === 410) {
    // syncToken expirou — recomeça sem ele
    params.delete("syncToken");
    params.set("timeMin", new Date(Date.now() - 7 * 86400_000).toISOString());
    res = await gcalFetch(auth.token, `/calendars/${encodeURIComponent(calendarId)}/events?${params}`);
  }
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      await admin.from("google_integration").update({ precisa_reconectar: true }).eq("company_id", companyId);
    }
    return { ok: false as const, error: `Google API: ${res.status}` };
  }
  const json = await res.json();
  let atualizados = 0;

  for (const ev of json.items ?? []) {
    const { data: row } = await admin
      .from("mensagem_agendada")
      .select("id,agendado_para,duracao_min,titulo")
      .eq("company_id", companyId)
      .eq("google_event_id", ev.id)
      .maybeSingle();
    if (!row) continue;

    if (ev.status === "cancelled") {
      await admin.from("mensagem_agendada").update({ status: "cancelado", sincronizado_em: new Date().toISOString() }).eq("id", row.id);
      atualizados++;
      continue;
    }
    const inicio = ev.start?.dateTime || (ev.start?.date ? `${ev.start.date}T00:00:00.000Z` : null);
    const fim = ev.end?.dateTime || null;
    if (!inicio) continue;
    const duracao = fim ? Math.max(5, Math.round((new Date(fim).getTime() - new Date(inicio).getTime()) / 60000)) : row.duracao_min;
    const mudou =
      new Date(inicio).getTime() !== new Date(row.agendado_para).getTime() ||
      duracao !== row.duracao_min ||
      (ev.summary || null) !== row.titulo;
    if (!mudou) continue;
    await admin
      .from("mensagem_agendada")
      .update({
        agendado_para: new Date(inicio).toISOString(),
        duracao_min: duracao,
        titulo: ev.summary ?? row.titulo,
        sincronizado_em: new Date().toISOString(),
      })
      .eq("id", row.id);
    atualizados++;
  }

  await admin
    .from("google_integration")
    .update({ sync_token: json.nextSyncToken ?? auth.gi.sync_token ?? null, ultima_sync_em: new Date().toISOString() })
    .eq("company_id", companyId);

  return { ok: true as const, atualizados };
}

/** Cria (ou reaproveita) uma sala do Google Meet para o compromisso. */
export async function ensureMeetLink(
  admin: any,
  companyId: string,
  a: {
    eventId?: string | null;
    calendarId?: string | null;
    titulo?: string | null;
    mensagem?: string | null;
    inicio: string;
    duracaoMin?: number | null;
    local?: string | null;
  },
): Promise<{ ok: true; link: string; eventId: string; calendarId: string } | { ok: false; error: string }> {
  const auth = await getValidAccessToken(admin, companyId);
  if (!auth?.gi?.conectado) {
    return { ok: false, error: "Conecte a conta Google em Agendamentos → Configurações." };
  }
  const calendarId = a.calendarId || auth.gi.calendar_id || "primary";
  const body: any = {
    ...buildEventBody({
      titulo: a.titulo,
      mensagem: a.mensagem,
      inicio: a.inicio,
      duracaoMin: a.duracaoMin,
      local: a.local,
    }),
    conferenceData: {
      createRequest: {
        requestId: `metrix-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    },
  };
  const base = `/calendars/${encodeURIComponent(calendarId)}/events`;
  const qs = "?conferenceDataVersion=1";
  let res = a.eventId
    ? await gcalFetch(auth.token, `${base}/${encodeURIComponent(a.eventId)}${qs}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      })
    : await gcalFetch(auth.token, `${base}${qs}`, { method: "POST", body: JSON.stringify(body) });
  if (!res.ok && res.status === 404 && a.eventId) {
    res = await gcalFetch(auth.token, `${base}${qs}`, { method: "POST", body: JSON.stringify(body) });
  }
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      await admin.from("google_integration").update({ precisa_reconectar: true }).eq("company_id", companyId);
    }
    const txt = await res.text();
    console.error("[gcal] meet falhou", res.status, txt);
    return { ok: false, error: "Não foi possível criar a sala do Meet no Google. Tente reconectar a conta." };
  }
  const ev = await res.json();
  const link: string | null =
    ev.hangoutLink ||
    (ev.conferenceData?.entryPoints || []).find((e: any) => e.entryPointType === "video")?.uri ||
    null;
  if (!link) return { ok: false, error: "O Google não retornou o link do Meet para esta conta." };
  return { ok: true, link, eventId: ev.id as string, calendarId };
}
