import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveCompanyIdCached } from "./company-cache";

async function resolveCompanyId(supabase: any, userId: string): Promise<string> {
  return resolveCompanyIdCached(supabase, userId);
}
export const listAgendamentos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { tipo?: "mensagem" | "compromisso" | "all"; from?: string | null; to?: string | null } | undefined) => d ?? {})
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const companyId = await resolveCompanyId(supabase, userId);
    let q = supabase
      .from("mensagem_agendada")
      .select("*")
      .eq("company_id", companyId)
      .is("parent_id", null)
      .order("agendado_para", { ascending: true });
    if (data?.tipo && data.tipo !== "all") q = q.eq("tipo", data.tipo);
    if (data?.from) q = q.gte("agendado_para", data.from);
    if (data?.to) q = q.lte("agendado_para", data.to);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  });

async function checkConflict(
  supabase: any,
  companyId: string,
  inicio: Date,
  duracaoMin: number,
  ignoreId?: string | null,
  profissionalId?: string | null,
): Promise<{ conflito: boolean; com?: any }> {
  const fim = new Date(inicio.getTime() + duracaoMin * 60_000);
  // Busca compromissos do mesmo dia (janela ±24h para reduzir)
  const janelaIni = new Date(inicio.getTime() - 24 * 60 * 60_000).toISOString();
  const janelaFim = new Date(inicio.getTime() + 24 * 60 * 60_000).toISOString();
  let q = supabase
    .from("mensagem_agendada")
    .select("id,agendado_para,duracao_min,titulo,nome_lead,profissional_id")
    .eq("company_id", companyId)
    .eq("tipo", "compromisso")
    .neq("status", "cancelado")
    .gte("agendado_para", janelaIni)
    .lte("agendado_para", janelaFim);
  if (ignoreId) q = q.neq("id", ignoreId);
  // Com profissional definido, o conflito é só na agenda dele.
  if (profissionalId) q = q.eq("profissional_id", profissionalId);
  const { data } = await q;
  for (const r of data ?? []) {
    const ri = new Date(r.agendado_para);
    const rf = new Date(ri.getTime() + (r.duracao_min || 30) * 60_000);
    if (ri < fim && rf > inicio) return { conflito: true, com: r };
  }
  return { conflito: false };
}

export const saveAgendamento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    id?: string | null;
    tipo?: "mensagem" | "compromisso";
    card_id?: string | null;
    numero: string;
    nome_lead?: string | null;
    titulo?: string | null;
    mensagem: string;
    link_reuniao?: string | null;
    agendado_para: string;
    duracao_min?: number | null;
    local?: string | null;
    modalidade?: "presencial" | "online" | null;
    servico_id?: string | null;
    lembrete_min_antes?: number | null;
    profissional_id?: string | null;
  }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const companyId = await resolveCompanyId(supabase, userId);
    const tipo = data.tipo || "mensagem";

    // Se serviço informado, herda duração
    let duracao = data.duracao_min ?? null;
    if (data.servico_id && !duracao) {
      const { data: sv } = await supabase.from("servico").select("duracao_min").eq("id", data.servico_id).maybeSingle();
      if (sv) duracao = sv.duracao_min;
    }
    if (tipo === "compromisso" && !duracao) duracao = 30;

    // Checa conflito para compromissos
    if (tipo === "compromisso") {
      const inicio = new Date(data.agendado_para);
      const c = await checkConflict(supabase, companyId, inicio, duracao || 30, data.id || null, data.profissional_id || null);
      if (c.conflito) {
        const outroNome = c.com?.titulo || c.com?.nome_lead || "outro compromisso";
        throw new Error(`Conflito com "${outroNome}" no mesmo horário.`);
      }
      // Conflito com a agenda do Google (compromissos pessoais)
      try {
        const fim = new Date(inicio.getTime() + (duracao || 30) * 60_000);
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { getFreeBusy } = await import("./google.server");
        const busy = await getFreeBusy(supabaseAdmin as any, companyId, inicio.toISOString(), fim.toISOString());
        if (busy && busy.length > 0) {
          throw new Error("Este horário está ocupado na sua Google Agenda.");
        }
      } catch (e: any) {
        if (e?.message?.includes("ocupado")) throw e;
      }

    }

    const payload: any = {
      company_id: companyId,
      tipo,
      card_id: data.card_id ?? null,
      numero: (data.numero || "").replace(/\D/g, ""),
      nome_lead: data.nome_lead ?? null,
      titulo: data.titulo ?? null,
      mensagem: data.mensagem,
      link_reuniao: data.link_reuniao ?? null,
      agendado_para: data.agendado_para,
      duracao_min: duracao,
      local: data.local ?? null,
      modalidade: data.modalidade ?? null,
      servico_id: data.servico_id ?? null,
      lembrete_min_antes: data.lembrete_min_antes ?? 0,
      profissional_id: data.profissional_id ?? null,
    };

    let row: any;
    if (data.id) {
      const { data: r, error } = await supabase
        .from("mensagem_agendada").update(payload).eq("id", data.id).eq("company_id", companyId)
        .select().maybeSingle();
      if (error) throw error;
      row = r;
      // Remove lembrete anterior; recriamos abaixo se necessário
      await supabase.from("mensagem_agendada").delete().eq("parent_id", data.id);
    } else {
      payload.created_by = userId;
      payload.status = tipo === "compromisso" ? "agendado" : "pendente";
      const { data: r, error } = await supabase.from("mensagem_agendada").insert(payload).select().maybeSingle();
      if (error) throw error;
      row = r;
    }

    // --- INTEGRATION: Google Calendar (cria/atualiza o evento) ---
    if (tipo === "compromisso") {
      try {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { upsertCalendarEvent } = await import("./google.server");
        await upsertCalendarEvent(supabaseAdmin as any, companyId, {
          id: row.id,
          google_event_id: (row as any).google_event_id ?? null,
          titulo: data.titulo,
          mensagem: data.mensagem,
          agendado_para: data.agendado_para,
          duracao_min: duracao,
          local: data.local,
          link_reuniao: data.link_reuniao,
        });
      } catch (err) {
        console.error("Google Calendar Sync Error:", err);
      }
    }


    // Cria lembrete para compromisso
    if (tipo === "compromisso" && (data.lembrete_min_antes || 0) > 0 && payload.numero) {
      const inicio = new Date(data.agendado_para);
      const lembreteEm = new Date(inicio.getTime() - (data.lembrete_min_antes as number) * 60_000);
      const quando = inicio.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
      const partes = [
        `Olá${data.nome_lead ? " " + data.nome_lead : ""}! Passando para lembrar do seu compromisso em ${quando}.`,
      ];
      if (data.titulo) partes.push(`Assunto: ${data.titulo}`);
      if (data.modalidade === "presencial" && data.local) partes.push(`Local: ${data.local}`);
      if (data.link_reuniao) partes.push(`Link: ${data.link_reuniao}`);
      const texto = partes.join("\n");
      await supabase.from("mensagem_agendada").insert({
        company_id: companyId,
        tipo: "mensagem",
        parent_id: row.id,
        numero: payload.numero,
        nome_lead: data.nome_lead ?? null,
        titulo: `Lembrete: ${data.titulo || quando}`,
        mensagem: texto,
        link_reuniao: null,
        agendado_para: lembreteEm.toISOString(),
        status: "pendente",
        created_by: userId,
      } as any);
    }

    return row;
  });

export const deleteAgendamento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const companyId = await resolveCompanyId(supabase, userId);
    const { data: atual } = await supabase
      .from("mensagem_agendada")
      .select("id,google_event_id,google_calendar_id")
      .eq("id", data.id)
      .eq("company_id", companyId)
      .maybeSingle();

    const { error } = await supabase
      .from("mensagem_agendada")
      .delete()
      .eq("id", data.id)
      .eq("company_id", companyId);
    if (error) throw error;

    // Remove também o evento no Google Agenda
    if ((atual as any)?.google_event_id) {
      try {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { deleteCalendarEvent } = await import("./google.server");
        await deleteCalendarEvent(
          supabaseAdmin as any,
          companyId,
          (atual as any).google_event_id,
          (atual as any).google_calendar_id,
        );
      } catch (err) {
        console.error("Google Calendar delete error:", err);
      }
    }
    return { ok: true };

  });

export const gerarTextoAgendamento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    contexto: string;
    nome_lead?: string | null;
    link_reuniao?: string | null;
    quando?: string | null;
  }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const companyId = await resolveCompanyId(supabase, userId);
    const { lovableAiChat } = await import("./lovable-ai.server");
    const { data: comp } = await supabase.from("company").select("nome").eq("id", companyId).maybeSingle();
    const empresa = comp?.nome || "nossa empresa";
    const nome = data.nome_lead || "cliente";
    const partes: string[] = [];
    partes.push(`Empresa: ${empresa}`);
    partes.push(`Destinatário: ${nome}`);
    if (data.quando) partes.push(`Quando: ${data.quando}`);
    if (data.link_reuniao) partes.push(`Haverá um link de reunião (o sistema anexa automaticamente ao final — NÃO inclua nenhum link, URL ou placeholder na mensagem).`);
    partes.push(`Contexto do envio: ${data.contexto}`);
    const prompt = `Gere UMA mensagem de WhatsApp curta, cordial e natural em português brasileiro para o cliente. Use no máximo 4 linhas. Não use hashtags, markdown, URLs, links ou placeholders como [link] ou {link}. Personalize com o nome do destinatário.\n\n${partes.join("\n")}`;
    const raw = await lovableAiChat(
      [
        { role: "system", content: "Você redige mensagens de WhatsApp objetivas e humanas. Nunca inclua URLs, links ou placeholders — o sistema anexa links automaticamente." },
        { role: "user", content: prompt },
      ],
      "google/gemini-2.5-flash-lite",
    );
    const texto = raw
      .replace(/https?:\/\/\S+/gi, "")
      .replace(/\[(link|url)[^\]]*\]/gi, "")
      .replace(/\{\{?\s*(link|url)[^}]*\}?\}/gi, "")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    return { texto };
  });

export const listLeadsForPicker = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const companyId = await resolveCompanyId(supabase, userId);
    const { data } = await supabase
      .from("crm_cards")
      .select("id,numero,nome")
      .eq("company_id", companyId)
      .order("ultima_em", { ascending: false })
      .limit(500);
    return data ?? [];
  });

/** Equipe da empresa + horários individuais de atendimento (nulo = herda o da empresa). */
export const listProfissionais = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const companyId = await resolveCompanyId(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: membros }, { data: cfg }] = await Promise.all([
      supabaseAdmin
        .from("company_user")
        .select("user_id, role, horarios, profiles(nome, avatar_url)")
        .eq("company_id", companyId)
        .eq("ativo", true),
      supabaseAdmin
        .from("agent_config")
        .select("horarios_atendimento")
        .eq("company_id", companyId)
        .limit(1)
        .maybeSingle(),
    ]);
    return {
      empresa: (cfg as any)?.horarios_atendimento ?? null,
      membros: (membros ?? []).map((m: any) => ({
        user_id: m.user_id,
        nome: m.profiles?.nome || "Sem nome",
        avatar_url: m.profiles?.avatar_url ?? null,
        role: m.role,
        horarios: m.horarios ?? null,
      })),
    };
  });

/** Salva os horários de atendimento de um profissional (null = volta a herdar da empresa). */
export const saveProfissionalHorarios = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { user_id: string; horarios: any | null }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const companyId = await resolveCompanyId(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Validar permisos: un usuario solo puede editar su propio horario a menos que sea admin/gestor
    if (data.user_id !== userId) {
      const { data: actorCu } = await supabaseAdmin
        .from("company_user")
        .select("role")
        .eq("company_id", companyId)
        .eq("user_id", userId)
        .eq("ativo", true)
        .maybeSingle();
      const role = String(actorCu?.role || "").toLowerCase();
      if (!["owner", "admin", "super_admin", "gestor"].includes(role)) {
        throw new Error("Permiso insuficiente: solo administradores o gestores pueden modificar horarios de otros profesionales.");
      }
    }

    const { error } = await supabaseAdmin
      .from("company_user")
      .update({ horarios: data.horarios })
      .eq("company_id", companyId)
      .eq("user_id", data.user_id);
    if (error) throw error;
    return { ok: true };
  });

/** Compromissos já ocupados num dia (empresa + profissional + Google Agenda). */
export const getOcupacaoDia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { inicio: string; fim: string; profissional_id?: string | null; ignore_id?: string | null }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const companyId = await resolveCompanyId(supabase, userId);
    let q = supabase
      .from("mensagem_agendada")
      .select("id,agendado_para,duracao_min,profissional_id")
      .eq("company_id", companyId)
      .eq("tipo", "compromisso")
      .neq("status", "cancelado")
      .gte("agendado_para", data.inicio)
      .lte("agendado_para", data.fim);
    if (data.profissional_id) q = q.eq("profissional_id", data.profissional_id);
    if (data.ignore_id) q = q.neq("id", data.ignore_id);
    const { data: rows } = await q;
    const ocupados = (rows ?? []).map((r: any) => ({
      inicio: r.agendado_para,
      fim: new Date(new Date(r.agendado_para).getTime() + (r.duracao_min || 30) * 60_000).toISOString(),
    }));
    // Google Agenda conectada
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { getFreeBusy } = await import("./google.server");
      const busy = await getFreeBusy(supabaseAdmin as any, companyId, data.inicio, data.fim);
      for (const b of busy ?? []) {
        if (b?.start && b?.end) ocupados.push({ inicio: b.start, fim: b.end });
      }
    } catch {
      /* Google não conectado — ignora */
    }
    return ocupados;
  });

/** Marca presença do cliente num compromisso. */
export const setPresenca = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; presenca: "compareceu" | "faltou" | null }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const companyId = await resolveCompanyId(supabase, userId);
    const { error } = await supabase
      .from("mensagem_agendada")
      .update({ presenca: data.presenca })
      .eq("id", data.id)
      .eq("company_id", companyId);
    if (error) throw error;
    return { ok: true };
  });
