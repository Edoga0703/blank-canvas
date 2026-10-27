import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveCompanyIdCached } from "./company-cache";

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

async function ctx(supabase: any, userId: string) {
  const companyId = await resolveCompanyIdCached(supabase, userId);
  const { data: cu } = await supabase
    .from("company_user")
    .select("role")
    .eq("company_id", companyId)
    .eq("user_id", userId)
    .maybeSingle();
  const role = (cu?.role as string) || "atendente";
  const isManager = role === "owner" || role === "admin";
  const { data: co } = await supabase
    .from("company")
    .select("funcoes_individuais")
    .eq("id", companyId)
    .maybeSingle();
  const onlyMine = !!(co as any)?.funcoes_individuais && !isManager;
  return { companyId, role, isManager, userId, onlyMine };
}

/** company_user não tem FK para profiles: busca nomes/fotos em consulta separada. */
async function enrichMembros(supabaseAdmin: any, rows: any[]) {
  if (!rows.length) return [] as any[];
  const ids = rows.map((r) => r.user_id);
  const { data: profs } = await supabaseAdmin
    .from("profiles")
    .select("user_id, nome, avatar_url")
    .in("user_id", ids);
  const byId = new Map((profs ?? []).map((p: any) => [p.user_id, p]));
  return rows.map((r) => ({ ...r, profiles: byId.get(r.user_id) ?? null }));
}

/** Membro só altera o que é dele (responsável ou criador). */
async function assertCanEdit(supabase: any, c: any, id: string) {
  if (c.isManager) return;
  const { data: row } = await supabase
    .from("mensagem_agendada")
    .select("profissional_id, created_by")
    .eq("id", id)
    .eq("company_id", c.companyId)
    .maybeSingle();
  if (!row) throw new Error("Registro não encontrado.");
  if (row.profissional_id !== c.userId && row.created_by !== c.userId) {
    throw new Error("Você só pode alterar compromissos da sua própria agenda.");
  }
}

async function logHistorico(
  supabase: any,
  c: any,
  entity_type: string,
  entity_id: string,
  acao: string,
  anteriores?: any,
  novos?: any,
) {
  try {
    await supabase.from("agenda_historico").insert({
      company_id: c.companyId,
      entity_type,
      entity_id,
      acao,
      dados_anteriores: anteriores ?? null,
      dados_novos: novos ?? null,
      user_id: c.userId,
    });
  } catch {
    /* histórico não bloqueia a operação */
  }
}

/** Garante que todo contato agendado exista no CRM. Retorna o card_id. */
async function garantirContatoNoCrm(
  companyId: string,
  cardId: string | null | undefined,
  numero: string | null | undefined,
  nome?: string | null,
): Promise<string | null> {
  if (cardId) return cardId;
  const limpo = String(numero || "").replace(/\D/g, "");
  if (limpo.length < 10) return null;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { intakeLead } = await import("./lead-intake.server");
    const r = await intakeLead(supabaseAdmin as any, {
      companyId,
      numeroRaw: limpo,
      nome: nome ?? null,
      canal: "agenda",
      origem: "agenda",
      mensagem: "Contato criado pela agenda",
    });
    return r.cardId;
  } catch (e: any) {
    console.error("[agenda] contato no CRM:", e?.message);
    return null;
  }
}

type ConflitoMotivo = { tipo: string; mensagem: string };

async function detectarConflitos(
  supabase: any,
  companyId: string,
  inicio: Date,
  fim: Date,
  profissionalId: string | null,
  ignoreId: string | null,
): Promise<ConflitoMotivo[]> {
  const out: ConflitoMotivo[] = [];
  const janelaIni = new Date(inicio.getTime() - 24 * 3600_000).toISOString();
  const janelaFim = new Date(fim.getTime() + 24 * 3600_000).toISOString();

  let q = supabase
    .from("mensagem_agendada")
    .select("id,agendado_para,duracao_min,titulo,nome_lead,profissional_id,status")
    .eq("company_id", companyId)
    .eq("tipo", "compromisso")
    .not("status", "in", "(cancelado,falta)")
    .gte("agendado_para", janelaIni)
    .lte("agendado_para", janelaFim);
  if (ignoreId) q = q.neq("id", ignoreId);
  if (profissionalId) q = q.eq("profissional_id", profissionalId);
  const { data: rows } = await q;
  for (const r of rows ?? []) {
    const ri = new Date(r.agendado_para);
    const rf = new Date(ri.getTime() + (r.duracao_min || 30) * 60_000);
    if (ri < fim && rf > inicio) {
      out.push({
        tipo: "sobreposicao",
        mensagem: `Sobreposição com "${r.titulo || r.nome_lead || "outro compromisso"}".`,
      });
      break;
    }
  }

  // Bloqueios de horário
  let qb = supabase
    .from("agenda_bloqueio")
    .select("id,inicio,fim,motivo,user_id")
    .eq("company_id", companyId)
    .lt("inicio", fim.toISOString())
    .gt("fim", inicio.toISOString());
  const { data: blocks } = await qb;
  for (const b of blocks ?? []) {
    if (!b.user_id || !profissionalId || b.user_id === profissionalId) {
      out.push({ tipo: "bloqueio", mensagem: `Horário bloqueado: ${b.motivo || "indisponível"}.` });
      break;
    }
  }

  return out;
}

/* ------------------------------------------------------------------ */
/* Leitura principal                                                   */
/* ------------------------------------------------------------------ */

export const getAgendaData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { from?: string | null; to?: string | null } | undefined) => d ?? {})
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const c = await ctx(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const from = data.from ?? new Date(Date.now() - 60 * 864e5).toISOString();
    const to = data.to ?? new Date(Date.now() + 180 * 864e5).toISOString();

    // Funções individuais: atendente vê apenas a própria agenda.
    const itensQuery = (() => {
      let q = supabase
        .from("mensagem_agendada")
        .select("*")
        .eq("company_id", c.companyId)
        .is("parent_id", null)
        .gte("agendado_para", from)
        .lte("agendado_para", to);
      if ((c as any).onlyMine) {
        q = q.or(`profissional_id.eq.${c.userId},created_by.eq.${c.userId}`);
      }
      return q.order("agendado_para", { ascending: true }).limit(2000);
    })();

    const [itens, bloqueios, membros, cfg, tipos, servicos, conexao, google, locais] = await Promise.all([
      itensQuery,
      supabase
        .from("agenda_bloqueio")
        .select("*")
        .eq("company_id", c.companyId)
        .gte("fim", from)
        .lte("inicio", to)
        .order("inicio", { ascending: true }),
      supabaseAdmin
        .from("company_user")
        .select("user_id, role, horarios")
        .eq("company_id", c.companyId)
        .eq("ativo", true),
      supabaseAdmin
        .from("agent_config")
        .select("horarios_atendimento")
        .eq("company_id", c.companyId)
        .limit(1)
        .maybeSingle(),
      supabase.from("agenda_tipo").select("*").eq("company_id", c.companyId).order("nome"),
      supabase
        .from("produto")
        .select("id,nome,duracao_min,cor,ativo")
        .eq("company_id", c.companyId)
        .eq("tipo", "servico")
        .order("nome"),
      supabase
        .from("whatsapp_instances")
        .select("id,status")
        .eq("company_id", c.companyId)
        .eq("status", "connected")
        .limit(1),
      supabase
        .from("google_integration")
        .select("company_id, conectado")
        .eq("company_id", c.companyId)
        .eq("conectado", true)
        .limit(1),
      supabase
        .from("agenda_local")
        .select("id,nome,endereco,padrao")
        .eq("company_id", c.companyId)
        .order("padrao", { ascending: false })
        .order("nome"),
    ]);

    return {
      me: { userId: c.userId, role: c.role, isManager: c.isManager },
      itens: itens.data ?? [],
      bloqueios: bloqueios.data ?? [],
      tipos: tipos.data ?? [],
      locais: locais.data ?? [],
      servicos: (servicos.data ?? []).map((s: any) => ({
        id: s.id,
        nome: s.nome,
        duracao_min: s.duracao_min ?? 30,
        cor: s.cor,
        ativo: s.ativo,
      })),
      empresa_horarios: (cfg.data as any)?.horarios_atendimento ?? null,
      profissionais: (await enrichMembros(supabaseAdmin, (membros.data ?? []) as any[])).map((m: any) => ({
        user_id: m.user_id,
        nome: m.profiles?.nome || "Sem nome",
        avatar_url: m.profiles?.avatar_url ?? null,
        role: m.role,
        horarios: m.horarios ?? null,
      })),
      integracoes: {
        whatsapp: (conexao.data ?? []).length > 0,
        google: (google.data ?? []).length > 0,
        outlook: false,
        meet: false,
        zoom: false,
      },
    };
  });

/* ------------------------------------------------------------------ */
/* Compromissos                                                        */
/* ------------------------------------------------------------------ */

type CompromissoInput = {
  id?: string | null;
  titulo?: string | null;
  card_id?: string | null;
  numero?: string | null;
  nome_lead?: string | null;
  empresa_nome?: string | null;
  tipo_id?: string | null;
  servico_id?: string | null;
  profissional_id?: string | null;
  participantes?: string[];
  agendado_para: string;
  duracao_min?: number | null;
  modalidade?: string | null;
  local?: string | null;
  link_reuniao?: string | null;
  google_event_id?: string | null;
  google_calendar_id?: string | null;
  mensagem?: string | null;
  observacoes_internas?: string | null;
  tags?: string[] | null;
  status?: string | null;
  lembrete_min_antes?: number | null;
  lembrete_mensagem?: string | null;
  forcar?: boolean;
  recorrencia?: {
    frequencia: "diaria" | "semanal" | "mensal";
    intervalo: number;
    dias_semana?: number[];
    ocorrencias?: number | null;
    ate_data?: string | null;
  } | null;
};

function addDias(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function datasRecorrencia(inicio: Date, rec: NonNullable<CompromissoInput["recorrencia"]>): Date[] {
  const out: Date[] = [];
  const max = Math.min(rec.ocorrencias || 52, 100);
  const limite = rec.ate_data ? new Date(`${rec.ate_data}T23:59:59`) : null;
  if (rec.frequencia === "semanal" && rec.dias_semana?.length) {
    let cursor = new Date(inicio);
    let semanas = 0;
    while (out.length < max && semanas < 104) {
      for (const wd of rec.dias_semana.slice().sort()) {
        const base = addDias(cursor, (wd - cursor.getDay() + 7) % 7);
        base.setHours(inicio.getHours(), inicio.getMinutes(), 0, 0);
        if (base >= inicio && (!limite || base <= limite) && out.length < max) {
          if (!out.some((d) => d.getTime() === base.getTime())) out.push(new Date(base));
        }
      }
      cursor = addDias(cursor, 7 * Math.max(1, rec.intervalo));
      semanas += Math.max(1, rec.intervalo);
      if (limite && cursor > limite) break;
    }
    return out.sort((a, b) => a.getTime() - b.getTime());
  }
  let cur = new Date(inicio);
  while (out.length < max) {
    if (limite && cur > limite) break;
    out.push(new Date(cur));
    if (rec.frequencia === "diaria") cur = addDias(cur, Math.max(1, rec.intervalo));
    else if (rec.frequencia === "semanal") cur = addDias(cur, 7 * Math.max(1, rec.intervalo));
    else {
      const x = new Date(cur);
      x.setMonth(x.getMonth() + Math.max(1, rec.intervalo));
      cur = x;
    }
  }
  return out;
}

export const saveCompromisso = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: CompromissoInput) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const c = await ctx(supabase, userId);
    if (data.id) await assertCanEdit(supabase, c, data.id);
    if (!c.isManager && data.profissional_id && data.profissional_id !== c.userId) {
      throw new Error("Você só pode agendar na sua própria agenda.");
    }

    let duracao = data.duracao_min ?? null;
    if (data.servico_id && !duracao) {
      const { data: sv } = await supabase
        .from("produto")
        .select("duracao_min")
        .eq("id", data.servico_id)
        .maybeSingle();
      if (sv?.duracao_min) duracao = sv.duracao_min;
    }
    if (!duracao) duracao = 30;

    const inicio = new Date(data.agendado_para);
    const fim = new Date(inicio.getTime() + duracao * 60_000);

    const conflitos = await detectarConflitos(
      supabase,
      c.companyId,
      inicio,
      fim,
      data.profissional_id || null,
      data.id || null,
    );
    if (conflitos.length && !data.forcar) {
      return { ok: false as const, conflitos };
    }
    if (conflitos.length && data.forcar && !c.isManager) {
      throw new Error("Apenas administradores podem salvar com conflito de horário.");
    }

    const cardId = await garantirContatoNoCrm(c.companyId, data.card_id, data.numero, data.nome_lead);

    const base: any = {
      company_id: c.companyId,
      tipo: "compromisso",
      titulo: data.titulo ?? null,
      card_id: cardId,
      numero: (data.numero || "").replace(/\D/g, ""),
      nome_lead: data.nome_lead ?? null,
      empresa_nome: data.empresa_nome ?? null,
      tipo_id: data.tipo_id ?? null,
      servico_id: data.servico_id ?? null,
      profissional_id: data.profissional_id ?? null,
      agendado_para: inicio.toISOString(),
      fim_em: fim.toISOString(),
      duracao_min: duracao,
      modalidade: data.modalidade ?? null,
      local: data.local ?? null,
      link_reuniao: data.link_reuniao ?? null,
      ...(data.google_event_id
        ? { google_event_id: data.google_event_id, google_calendar_id: data.google_calendar_id ?? null }
        : {}),
      mensagem: data.mensagem ?? "",
      observacoes_internas: data.observacoes_internas ?? null,
      tags: data.tags ?? null,
      status: data.status || "agendado",
      lembrete_min_antes: data.lembrete_min_antes ?? 0,
    };

    let row: any;
    if (data.id) {
      const { data: antes } = await supabase
        .from("mensagem_agendada")
        .select("*")
        .eq("id", data.id)
        .maybeSingle();
      const { data: r, error } = await supabase
        .from("mensagem_agendada")
        .update(base)
        .eq("id", data.id)
        .eq("company_id", c.companyId)
        .select()
        .maybeSingle();
      if (error) throw error;
      row = r;
      await supabase.from("mensagem_agendada").delete().eq("parent_id", data.id);
      await logHistorico(supabase, c, "compromisso", data.id, "editado", antes, r);
    } else {
      base.created_by = c.userId;
      // Recorrência
      let recorrenciaId: string | null = null;
      let datas: Date[] = [inicio];
      if (data.recorrencia) {
        const { data: rec } = await supabase
          .from("agenda_recorrencia")
          .insert({
            company_id: c.companyId,
            frequencia: data.recorrencia.frequencia,
            intervalo: data.recorrencia.intervalo || 1,
            dias_semana: data.recorrencia.dias_semana ?? null,
            ocorrencias: data.recorrencia.ocorrencias ?? null,
            ate_data: data.recorrencia.ate_data ?? null,
          })
          .select()
          .maybeSingle();
        recorrenciaId = rec?.id ?? null;
        datas = datasRecorrencia(inicio, data.recorrencia);
      }
      const payloads = datas.map((d) => ({
        ...base,
        recorrencia_id: recorrenciaId,
        agendado_para: d.toISOString(),
        fim_em: new Date(d.getTime() + (duracao as number) * 60_000).toISOString(),
      }));
      const { data: inseridos, error } = await supabase
        .from("mensagem_agendada")
        .insert(payloads)
        .select();
      if (error) throw error;
      row = inseridos?.[0];
      if (row) await logHistorico(supabase, c, "compromisso", row.id, "criado", null, row);
    }

    // Participantes internos
    if (row && data.participantes) {
      await supabase.from("agenda_participante").delete().eq("appointment_id", row.id);
      if (data.participantes.length) {
        await supabase.from("agenda_participante").insert(
          data.participantes.map((uid) => ({
            company_id: c.companyId,
            appointment_id: row.id,
            user_id: uid,
            tipo: "interno",
          })),
        );
      }
    }

    // Google Agenda
    if (row) {
      try {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { upsertCalendarEvent } = await import("./google.server");
        await upsertCalendarEvent(supabaseAdmin as any, c.companyId, {
          id: row.id,
          google_event_id: row.google_event_id ?? null,
          titulo: row.titulo,
          mensagem: row.mensagem,
          agendado_para: row.agendado_para,
          duracao_min: duracao,
          local: row.local,
          link_reuniao: row.link_reuniao,
        });
      } catch (err) {
        console.error("Google Calendar sync:", err);
      }
    }

    // Lembrete automático
    if (row && (data.lembrete_min_antes || 0) > 0 && base.numero) {
      const lembreteEm = new Date(inicio.getTime() - (data.lembrete_min_antes as number) * 60_000);
      const quando = inicio.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
      const partes = [
        `Olá${data.nome_lead ? " " + data.nome_lead : ""}! Passando para lembrar do seu compromisso em ${quando}.`,
      ];
      if (data.titulo) partes.push(`Assunto: ${data.titulo}`);
      if (data.local) partes.push(`Local: ${data.local}`);
      if (data.link_reuniao) partes.push(`Link: ${data.link_reuniao}`);
      const textoLembrete = (data.lembrete_mensagem || "").trim() || partes.join("\n");
      await supabase.from("mensagem_agendada").insert({
        company_id: c.companyId,
        tipo: "mensagem",
        parent_id: row.id,
        appointment_id: row.id,
        card_id: cardId,
        canal: "whatsapp",
        numero: base.numero,
        nome_lead: data.nome_lead ?? null,
        titulo: `Lembrete: ${data.titulo || quando}`,
        mensagem: textoLembrete,
        agendado_para: lembreteEm.toISOString(),
        status: "pendente",
        created_by: c.userId,
      } as any);
    }

    return { ok: true as const, row };
  });

export const moverCompromisso = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    id: string;
    agendado_para: string;
    duracao_min?: number | null;
    profissional_id?: string | null;
    forcar?: boolean;
  }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const c = await ctx(supabase, userId);
    await assertCanEdit(supabase, c, data.id);
    const { data: antes } = await supabase
      .from("mensagem_agendada")
      .select("*")
      .eq("id", data.id)
      .eq("company_id", c.companyId)
      .maybeSingle();
    if (!antes) throw new Error("Compromisso não encontrado.");
    const dur = data.duracao_min ?? antes.duracao_min ?? 30;
    const inicio = new Date(data.agendado_para);
    const fim = new Date(inicio.getTime() + dur * 60_000);
    const prof = data.profissional_id !== undefined ? data.profissional_id : antes.profissional_id;
    const conflitos = await detectarConflitos(supabase, c.companyId, inicio, fim, prof, data.id);
    if (conflitos.length && !data.forcar) return { ok: false as const, conflitos };

    const { error } = await supabase
      .from("mensagem_agendada")
      .update({
        agendado_para: inicio.toISOString(),
        fim_em: fim.toISOString(),
        duracao_min: dur,
        profissional_id: prof,
      })
      .eq("id", data.id)
      .eq("company_id", c.companyId);
    if (error) throw error;
    await logHistorico(supabase, c, "compromisso", data.id, "reagendado", antes, {
      agendado_para: inicio.toISOString(),
      duracao_min: dur,
    });
    return { ok: true as const };
  });

export const setStatusCompromisso = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; status: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const c = await ctx(supabase, userId);
    await assertCanEdit(supabase, c, data.id);
    const patch: any = { status: data.status };
    if (data.status === "cancelado") patch.cancelado_em = new Date().toISOString();
    if (data.status === "concluido") patch.concluido_em = new Date().toISOString();
    if (data.status === "falta") patch.presenca = "faltou";
    if (data.status === "concluido") patch.presenca = "compareceu";
    const { error } = await supabase
      .from("mensagem_agendada")
      .update(patch)
      .eq("id", data.id)
      .eq("company_id", c.companyId);
    if (error) throw error;
    await logHistorico(supabase, c, "compromisso", data.id, `status:${data.status}`, null, patch);
    return { ok: true };
  });

export const excluirItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; serie?: boolean }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const c = await ctx(supabase, userId);
    await assertCanEdit(supabase, c, data.id);
    const { data: atual } = await supabase
      .from("mensagem_agendada")
      .select("id,google_event_id,google_calendar_id,recorrencia_id")
      .eq("id", data.id)
      .eq("company_id", c.companyId)
      .maybeSingle();

    if (data.serie && atual?.recorrencia_id) {
      await supabase
        .from("mensagem_agendada")
        .delete()
        .eq("company_id", c.companyId)
        .eq("recorrencia_id", atual.recorrencia_id);
    } else {
      const { error } = await supabase
        .from("mensagem_agendada")
        .delete()
        .eq("id", data.id)
        .eq("company_id", c.companyId);
      if (error) throw error;
    }

    if (atual?.google_event_id) {
      try {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { deleteCalendarEvent } = await import("./google.server");
        await deleteCalendarEvent(
          supabaseAdmin as any,
          c.companyId,
          atual.google_event_id,
          atual.google_calendar_id,
        );
      } catch (err) {
        console.error("Google Calendar delete:", err);
      }
    }
    await logHistorico(supabase, c, "compromisso", data.id, "excluido", atual, null);
    return { ok: true };
  });

export const acaoEmMassa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    ids: string[];
    acao: "cancelar" | "excluir" | "responsavel" | "reagendar";
    profissional_id?: string | null;
    minutos?: number | null;
  }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const c = await ctx(supabase, userId);
    if (!c.isManager) throw new Error("Apenas administradores podem executar ações em massa.");
    if (!data.ids.length) return { ok: true, afetados: 0 };

    if (data.acao === "cancelar") {
      await supabase
        .from("mensagem_agendada")
        .update({ status: "cancelado", cancelado_em: new Date().toISOString() })
        .in("id", data.ids)
        .eq("company_id", c.companyId);
    } else if (data.acao === "excluir") {
      await supabase.from("mensagem_agendada").delete().in("id", data.ids).eq("company_id", c.companyId);
    } else if (data.acao === "responsavel") {
      await supabase
        .from("mensagem_agendada")
        .update({ profissional_id: data.profissional_id ?? null })
        .in("id", data.ids)
        .eq("company_id", c.companyId);
    } else if (data.acao === "reagendar") {
      const minutos = data.minutos || 0;
      const { data: rows } = await supabase
        .from("mensagem_agendada")
        .select("id,agendado_para,duracao_min")
        .in("id", data.ids)
        .eq("company_id", c.companyId);
      for (const r of rows ?? []) {
        const novo = new Date(new Date(r.agendado_para).getTime() + minutos * 60_000);
        await supabase
          .from("mensagem_agendada")
          .update({
            agendado_para: novo.toISOString(),
            fim_em: new Date(novo.getTime() + (r.duracao_min || 30) * 60_000).toISOString(),
          })
          .eq("id", r.id)
          .eq("company_id", c.companyId);
      }
    }
    return { ok: true, afetados: data.ids.length };
  });

export const getDetalhesCompromisso = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const c = await ctx(supabase, userId);
    const [item, mensagens, historico, participantes] = await Promise.all([
      supabase
        .from("mensagem_agendada")
        .select("*")
        .eq("id", data.id)
        .eq("company_id", c.companyId)
        .maybeSingle(),
      supabase
        .from("mensagem_agendada")
        .select("id,titulo,mensagem,agendado_para,status,erro,canal,enviado_em")
        .eq("company_id", c.companyId)
        .or(`appointment_id.eq.${data.id},parent_id.eq.${data.id}`)
        .order("agendado_para", { ascending: true }),
      supabase
        .from("agenda_historico")
        .select("*")
        .eq("company_id", c.companyId)
        .eq("entity_id", data.id)
        .order("created_at", { ascending: false })
        .limit(30),
      supabase.from("agenda_participante").select("*").eq("appointment_id", data.id),
    ]);
    return {
      item: item.data,
      mensagens: mensagens.data ?? [],
      historico: historico.data ?? [],
      participantes: participantes.data ?? [],
    };
  });

/* ------------------------------------------------------------------ */
/* Bloqueios                                                           */
/* ------------------------------------------------------------------ */

export const saveBloqueio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    id?: string | null;
    user_id?: string | null;
    inicio: string;
    fim: string;
    motivo?: string | null;
    tipo?: string | null;
  }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const c = await ctx(supabase, userId);
    if (!c.isManager && data.user_id && data.user_id !== c.userId) {
      throw new Error("Você só pode bloquear horários da sua agenda.");
    }
    const payload = {
      company_id: c.companyId,
      user_id: data.user_id ?? null,
      inicio: data.inicio,
      fim: data.fim,
      motivo: data.motivo ?? null,
      tipo: data.tipo || "bloqueio",
      created_by: c.userId,
    };
    if (data.id) {
      const { error } = await supabase
        .from("agenda_bloqueio")
        .update(payload)
        .eq("id", data.id)
        .eq("company_id", c.companyId);
      if (error) throw error;
      return { ok: true, id: data.id };
    }
    const { data: row, error } = await supabase
      .from("agenda_bloqueio")
      .insert(payload)
      .select()
      .maybeSingle();
    if (error) throw error;
    return { ok: true, id: row?.id };
  });

export const deleteBloqueio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const c = await ctx(supabase, userId);
    const { error } = await supabase
      .from("agenda_bloqueio")
      .delete()
      .eq("id", data.id)
      .eq("company_id", c.companyId);
    if (error) throw error;
    return { ok: true };
  });

/* ------------------------------------------------------------------ */
/* Mensagens programadas                                               */
/* ------------------------------------------------------------------ */

export const saveMensagemProgramada = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    id?: string | null;
    card_id?: string | null;
    numero: string;
    nome_lead?: string | null;
    titulo?: string | null;
    mensagem: string;
    canal?: string | null;
    agendado_para: string;
    appointment_id?: string | null;
    profissional_id?: string | null;
    link_reuniao?: string | null;
  }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const c = await ctx(supabase, userId);
    const cardId = await garantirContatoNoCrm(c.companyId, data.card_id, data.numero, data.nome_lead);
    const payload: any = {
      company_id: c.companyId,
      tipo: "mensagem",
      card_id: cardId,
      numero: (data.numero || "").replace(/\D/g, ""),
      nome_lead: data.nome_lead ?? null,
      titulo: data.titulo ?? null,
      mensagem: data.mensagem,
      canal: data.canal || "whatsapp",
      agendado_para: data.agendado_para,
      appointment_id: data.appointment_id ?? null,
      profissional_id: data.profissional_id ?? null,
      link_reuniao: data.link_reuniao ?? null,
    };
    if (data.id) {
      await assertCanEdit(supabase, c, data.id);
      const { error } = await supabase
        .from("mensagem_agendada")
        .update(payload)
        .eq("id", data.id)
        .eq("company_id", c.companyId);
      if (error) throw error;
      return { ok: true, id: data.id };
    }
    payload.created_by = c.userId;
    payload.status = "pendente";
    const { data: row, error } = await supabase
      .from("mensagem_agendada")
      .insert(payload)
      .select()
      .maybeSingle();
    if (error) throw error;
    return { ok: true, id: row?.id };
  });

export const acaoMensagem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; acao: "cancelar" | "reenviar" | "enviar_agora" | "duplicar" }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const c = await ctx(supabase, userId);
    const { data: row } = await supabase
      .from("mensagem_agendada")
      .select("*")
      .eq("id", data.id)
      .eq("company_id", c.companyId)
      .maybeSingle();
    if (!row) throw new Error("Mensagem não encontrada.");

    if (data.acao === "cancelar") {
      await supabase
        .from("mensagem_agendada")
        .update({ status: "cancelado", cancelado_em: new Date().toISOString() })
        .eq("id", data.id)
        .eq("company_id", c.companyId);
      return { ok: true };
    }

    if (data.acao === "duplicar") {
      const copia: any = { ...row };
      delete copia.id;
      delete copia.created_at;
      delete copia.updated_at;
      copia.status = "pendente";
      copia.erro = null;
      copia.enviado_em = null;
      copia.created_by = c.userId;
      const { data: nova, error } = await supabase
        .from("mensagem_agendada")
        .insert(copia)
        .select()
        .maybeSingle();
      if (error) throw error;
      return { ok: true, id: nova?.id };
    }

    // enviar agora / reenviar
    const { getActiveInstance, waSendText } = await import("./wa-dispatch.server");
    const inst = await getActiveInstance(c.companyId);
    if (!inst?.instance_name) {
      throw new Error("Nenhuma conexão de WhatsApp ativa. Conecte o WhatsApp antes de enviar.");
    }
    let texto = row.mensagem as string;
    if (row.link_reuniao && !texto.includes(row.link_reuniao)) texto = `${texto}\n\n${row.link_reuniao}`;
    try {
      await waSendText(inst, row.numero, texto);
      await supabase
        .from("mensagem_agendada")
        .update({ status: "enviado", enviado_em: new Date().toISOString(), erro: null, motivo_falha: null })
        .eq("id", data.id)
        .eq("company_id", c.companyId);
      return { ok: true };
    } catch (e: any) {
      const msg = e?.message || "Falha no envio";
      await supabase
        .from("mensagem_agendada")
        .update({ status: "erro", erro: msg, motivo_falha: msg })
        .eq("id", data.id)
        .eq("company_id", c.companyId);
      throw new Error(msg);
    }
  });

/* ------------------------------------------------------------------ */
/* Configurações                                                       */
/* ------------------------------------------------------------------ */

export const saveTipoAgendamento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    id?: string | null;
    nome: string;
    cor?: string;
    duracao_padrao_min?: number;
    ativo?: boolean;
  }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const c = await ctx(supabase, userId);
    if (!c.isManager) throw new Error("Sem permissão para alterar tipos de agendamento.");
    const payload = {
      company_id: c.companyId,
      nome: data.nome.trim(),
      cor: data.cor || "#0B22FE",
      duracao_padrao_min: data.duracao_padrao_min || 30,
      ativo: data.ativo ?? true,
    };
    if (data.id) {
      const { error } = await supabase
        .from("agenda_tipo")
        .update(payload)
        .eq("id", data.id)
        .eq("company_id", c.companyId);
      if (error) throw error;
      return { ok: true };
    }
    const { error } = await supabase.from("agenda_tipo").insert(payload);
    if (error) throw error;
    return { ok: true };
  });

export const deleteTipoAgendamento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const c = await ctx(supabase, userId);
    if (!c.isManager) throw new Error("Sem permissão.");
    const { error } = await supabase
      .from("agenda_tipo")
      .delete()
      .eq("id", data.id)
      .eq("company_id", c.companyId);
    if (error) throw error;
    return { ok: true };
  });

export const getDisponibilidade = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const c = await ctx(supabase, userId);
    const { data } = await supabase
      .from("agenda_disponibilidade")
      .select("*")
      .eq("company_id", c.companyId)
      .order("weekday");
    return data ?? [];
  });

export const saveDisponibilidade = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    user_id: string | null;
    regras: {
      weekday: number;
      ativo: boolean;
      start_time: string;
      end_time: string;
      interval_start?: string | null;
      interval_end?: string | null;
    }[];
    duracao_padrao_min?: number;
    folga_min?: number;
    antecedencia_min_min?: number;
    antecedencia_max_dias?: number;
    timezone?: string;
  }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const c = await ctx(supabase, userId);
    if (!c.isManager && data.user_id !== c.userId) {
      throw new Error("Você só pode configurar a sua disponibilidade.");
    }
    let q = supabase.from("agenda_disponibilidade").delete().eq("company_id", c.companyId);
    q = data.user_id ? q.eq("user_id", data.user_id) : q.is("user_id", null);
    await q;
    const rows = data.regras.map((r) => ({
      company_id: c.companyId,
      user_id: data.user_id,
      weekday: r.weekday,
      start_time: r.start_time,
      end_time: r.end_time,
      interval_start: r.interval_start || null,
      interval_end: r.interval_end || null,
      ativo: r.ativo,
      duracao_padrao_min: data.duracao_padrao_min ?? 30,
      folga_min: data.folga_min ?? 0,
      antecedencia_min_min: data.antecedencia_min_min ?? 0,
      antecedencia_max_dias: data.antecedencia_max_dias ?? 60,
      timezone: data.timezone || "America/Sao_Paulo",
    }));
    if (rows.length) {
      const { error } = await supabase.from("agenda_disponibilidade").insert(rows);
      if (error) throw error;
    }
    return { ok: true };
  });

/* ------------------------------------------------------------------ */
/* Locais de atendimento (endereços salvos)                            */
/* ------------------------------------------------------------------ */

export const saveLocal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id?: string | null; nome: string; endereco: string; padrao?: boolean }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const c = await ctx(supabase, userId);
    const nome = (data.nome || "").trim();
    const endereco = (data.endereco || "").trim();
    if (!nome || !endereco) throw new Error("Informe o nome e o endereço do local.");
    if (data.padrao) {
      await supabase.from("agenda_local").update({ padrao: false }).eq("company_id", c.companyId);
    }
    if (data.id) {
      const { error } = await supabase
        .from("agenda_local")
        .update({ nome, endereco, padrao: !!data.padrao })
        .eq("id", data.id)
        .eq("company_id", c.companyId);
      if (error) throw error;
      return { ok: true, id: data.id };
    }
    const { data: row, error } = await supabase
      .from("agenda_local")
      .insert({ company_id: c.companyId, nome, endereco, padrao: !!data.padrao })
      .select("id")
      .maybeSingle();
    if (error) throw error;
    return { ok: true, id: row?.id };
  });

export const deleteLocal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const c = await ctx(supabase, userId);
    const { error } = await supabase
      .from("agenda_local")
      .delete()
      .eq("id", data.id)
      .eq("company_id", c.companyId);
    if (error) throw error;
    return { ok: true };
  });

/* ------------------------------------------------------------------ */
/* Geração de mensagem com IA                                          */
/* ------------------------------------------------------------------ */

export const gerarMensagemIA = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    nome?: string | null;
    objetivo?: string | null;
    data?: string | null;
    hora?: string | null;
  }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const c = await ctx(supabase, userId);
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) throw new Error("IA indisponível no momento.");

    const { data: empresa } = await supabase
      .from("company")
      .select("nome")
      .eq("id", c.companyId)
      .maybeSingle();

    const partes = [
      `Empresa: ${empresa?.nome || "nossa empresa"}.`,
      data.nome ? `Nome do contato: ${data.nome}.` : "O nome do contato é desconhecido.",
      data.data ? `Data programada do envio: ${data.data}${data.hora ? ` às ${data.hora}` : ""}.` : "",
      data.objetivo ? `Objetivo da mensagem: ${data.objetivo}.` : "Objetivo: mensagem cordial de contato.",
    ].filter(Boolean).join("\n");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": key,
        "X-Lovable-AIG-SDK": "fetch",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        stream: true,
        reasoning: { effort: "low", summary: "auto" },
        instructions:
          "Você escreve mensagens curtas de WhatsApp em português do Brasil para empresas. " +
          "Tom cordial e profissional, no máximo 3 linhas, sem emojis em excesso (no máximo 1), " +
          "sem assinatura e sem colchetes ou campos para preencher. Responda apenas com o texto da mensagem.",
        input: partes,
      }),
    });

    if (!res.ok || !res.body) {
      if (res.status === 429) throw new Error("Muitas solicitações de IA. Tente novamente em instantes.");
      if (res.status === 402) throw new Error("Créditos de IA esgotados. Adicione créditos para continuar.");
      throw new Error("Não foi possível gerar a mensagem agora.");
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let texto = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const linhas = buffer.split("\n");
      buffer = linhas.pop() || "";
      for (const linha of linhas) {
        if (!linha.startsWith("data:")) continue;
        const raw = linha.slice(5).trim();
        if (!raw || raw === "[DONE]") continue;
        try {
          const ev = JSON.parse(raw);
          if (ev.type === "response.output_text.delta" && typeof ev.delta === "string") texto += ev.delta;
          if (ev.type === "response.completed" && !texto && ev.response?.output_text) texto = ev.response.output_text;
        } catch { /* ignora chunk parcial */ }
      }
    }

    return { texto: texto.trim() };
  });

/** Dados mínimos para o popup de nova mensagem usado nos atalhos (chat/CRM). */
export const getMensagemFormData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const c = await ctx(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [leads, membrosRaw] = await Promise.all([
      supabase
        .from("crm_cards")
        .select("id, numero, nome")
        .eq("company_id", c.companyId)
        .order("ultima_em", { ascending: false })
        .limit(500),
      supabaseAdmin
        .from("company_user")
        .select("user_id, role")
        .eq("company_id", c.companyId)
        .eq("ativo", true),
    ]);
    const membros = await enrichMembros(supabaseAdmin, (membrosRaw.data ?? []) as any[]);

    return {
      me: { userId: c.userId, role: c.role, isManager: c.isManager },
      leads: (leads.data ?? []).map((l: any) => ({ id: l.id, numero: l.numero, nome: l.nome })),
      profissionais: membros.map((m: any) => ({
        user_id: m.user_id,
        nome: m.profiles?.nome || "Sem nome",
        avatar_url: m.profiles?.avatar_url ?? null,
        role: m.role,
        horarios: null,
      })),
    };
  });
