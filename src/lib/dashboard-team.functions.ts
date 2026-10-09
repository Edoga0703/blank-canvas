import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveCompanyIdCached } from "./company-cache";

/**
 * Métricas de equipe para operação de atendimento: ranking de atendimento,
 * monitoramento de usuários e ranking de satisfação.
 * Usadas somente pelos widgets novos — não altera o dashboard padrão.
 */

export type RankingItem = {
  userId: string;
  nome: string;
  avatar: string | null;
  setor: string | null;
  atendimentos: number;
  mensagens: number;
  concluidas: number;
  variacao: number; // % vs período anterior
};

export type MonitorItem = {
  userId: string;
  nome: string;
  avatar: string | null;
  setor: string | null;
  estado: "online" | "ativo" | "inativo";
  minutosUltimaAtividade: number | null;
  abertas: number;
  semResposta: number;
  esperaMaisAntigaMin: number;
  atrasadas: number;
};

/** Tickets (atendimentos) por atendente, em tempo real. */
export type TicketItem = {
  userId: string;
  nome: string;
  avatar: string | null;
  setor: string | null;
  estado: "online" | "ativo" | "inativo";
  abertos: number;        // tickets sob responsabilidade dele
  emAndamento: number;    // com troca de mensagem nas últimas 24h
  aguardando: number;     // última mensagem é do cliente
  concluidosHoje: number;
};

export type CsatRankItem = {
  userId: string;
  nome: string;
  avatar: string | null;
  media: number;
  respostas: number;
  dist: number[]; // índice 0 = nota 1
  promotores: number; // %
  detratores: number; // %
};

export interface TeamOps {
  ranking: RankingItem[];
  monitor: MonitorItem[];
  tickets: TicketItem[];
  semDono: number;
  csat: CsatRankItem[];
  ultimoComentarioNegativo: { nome: string; score: number; comentario: string; em: string } | null;
  atualizadoEm: string;
}

const EMPTY: TeamOps = { ranking: [], monitor: [], tickets: [], semDono: 0, csat: [], ultimoComentarioNegativo: null, atualizadoEm: new Date().toISOString() };

function startFrom(range: string): Date {
  if (range?.startsWith("custom:")) {
    const f = range.split(":")[1];
    const d = new Date(`${f}T00:00:00.000Z`);
    if (!isNaN(d.getTime())) return d;
  }
  const d = new Date();
  if (range === "today") { d.setUTCHours(0, 0, 0, 0); return d; }
  const days = range === "7d" ? 7 : range === "90d" ? 90 : 30;
  d.setUTCDate(d.getUTCDate() - days);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

async function fetchAll(supabase: any, table: string, select: string, apply: (q: any) => any) {
  const PAGE = 1000;
  const out: any[] = [];
  for (let from = 0; from < 30000; from += PAGE) {
    const { data, error } = await apply(supabase.from(table).select(select)).range(from, from + PAGE - 1);
    if (error || !data) break;
    out.push(...data);
    if (data.length < PAGE) break;
  }
  return out;
}

const minutosDesde = (iso: string | null | undefined) =>
  iso ? Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000)) : null;

export const getTeamOps = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { range?: string; companyId?: string | null }) => ({
    range: d?.range || "30d",
    companyId: d?.companyId ?? null,
  }))
  .handler(async ({ data, context }): Promise<TeamOps> => {
    const { supabase, userId } = context;

    let companyId: string | null = null;
    if (data.companyId) {
      const { data: allowed } = await supabase.from("company").select("id").eq("id", data.companyId).maybeSingle();
      if (allowed?.id) companyId = allowed.id as string;
    }
    if (!companyId) {
      try { companyId = await resolveCompanyIdCached(supabase, userId); } catch { companyId = null; }
    }
    if (!companyId) return EMPTY;

    const { data: membership } = await supabase
      .from("company_user").select("role").eq("company_id", companyId).eq("user_id", userId).maybeSingle();
    const soEu = membership?.role === "atendente" ? userId : null;

    const desde = startFrom(data.range);
    const desdeIso = desde.toISOString();
    const janela = Date.now() - desde.getTime();
    const anteriorIso = new Date(desde.getTime() - janela).toISOString();
    const recentesIso = new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString();

    const [members, stages, departments, deptMembers, cards, msgs, msgsRecentes, csat] = await Promise.all([
      fetchAll(supabase, "company_user", "user_id, role", (q: any) => q.eq("company_id", companyId).eq("ativo", true)),
      fetchAll(supabase, "crm_stage", "id, nome, tipo, sla_horas", (q: any) => q.eq("company_id", companyId)),
      fetchAll(supabase, "department", "id, nome", (q: any) => q.eq("company_id", companyId)),
      fetchAll(supabase, "department_member", "user_id, department_id", (q: any) => q.not("department_id", "is", null)),
      fetchAll(supabase, "crm_cards", "id, numero, owner_id, stage_id, entrou_stage_em, created_at:primeiro_contato_em, updated_at", (q: any) => q.eq("company_id", companyId)),
      fetchAll(supabase, "mensagens", "user_id, numero, direcao, autor, created_at",
        (q: any) => q.eq("company_id", companyId).eq("direcao", "saida").eq("autor", "humano").gte("created_at", anteriorIso)),
      fetchAll(supabase, "mensagens", "numero, direcao, autor, created_at",
        (q: any) => q.eq("company_id", companyId).gte("created_at", recentesIso)),
      fetchAll(supabase, "csat_response", "numero, score, comentario, enviado_por, respondido_em",
        (q: any) => q.eq("company_id", companyId).not("score", "is", null).gte("respondido_em", desdeIso)),
    ]);

    const ids: string[] = Array.from(new Set(members.map((m: any) => m.user_id).filter(Boolean)));
    const nomeUser = new Map<string, string>();
    const avatarUser = new Map<string, string>();
    if (ids.length) {
      const { data: profs } = await supabase.from("profiles").select("user_id, nome, email, avatar_url").in("user_id", ids);
      for (const p of profs ?? []) {
        nomeUser.set(p.user_id as string, (p.nome as string) || (p.email as string) || "Usuário");
        if (p.avatar_url) avatarUser.set(p.user_id as string, p.avatar_url as string);
      }
    }
    const nomeOf = (id: string) => nomeUser.get(id) ?? "Usuário";
    const avatarOf = (id: string) => avatarUser.get(id) ?? null;

    const depNome = new Map<string, string>(departments.map((d: any) => [d.id, d.nome]));
    const setorDoUser = new Map<string, string>();
    for (const dm of deptMembers) {
      const n = depNome.get(dm.department_id);
      if (n && dm.user_id && !setorDoUser.has(dm.user_id)) setorDoUser.set(dm.user_id, n);
    }

    const stageById = new Map<string, any>(stages.map((s: any) => [s.id, s]));
    const isFinal = (c: any) => {
      const t = stageById.get(c.stage_id)?.tipo;
      return t === "ganho" || t === "perda";
    };

    // ---------- Ranking de atendimento ----------
    const atual = new Map<string, { msgs: number; conversas: Set<string> }>();
    const anterior = new Map<string, Set<string>>();
    for (const m of msgs) {
      if (!m.user_id) continue;
      if (m.created_at >= desdeIso) {
        const e = atual.get(m.user_id) ?? { msgs: 0, conversas: new Set<string>() };
        e.msgs += 1;
        if (m.numero) e.conversas.add(m.numero);
        atual.set(m.user_id, e);
      } else {
        const s = anterior.get(m.user_id) ?? new Set<string>();
        if (m.numero) s.add(m.numero);
        anterior.set(m.user_id, s);
      }
    }
    const concluidasPorUser = new Map<string, number>();
    for (const c of cards) {
      if (!c.owner_id || stageById.get(c.stage_id)?.tipo !== "ganho") continue;
      if (!c.updated_at || c.updated_at < desdeIso) continue;
      concluidasPorUser.set(c.owner_id, (concluidasPorUser.get(c.owner_id) ?? 0) + 1);
    }

    const elegiveis = ids.filter((id) => !soEu || id === soEu);

    const ranking: RankingItem[] = elegiveis
      .map((id) => {
        const a = atual.get(id);
        const atendimentos = a?.conversas.size ?? 0;
        const antes = anterior.get(id)?.size ?? 0;
        return {
          userId: id,
          nome: nomeOf(id),
          avatar: avatarOf(id),
          setor: setorDoUser.get(id) ?? null,
          atendimentos,
          mensagens: a?.msgs ?? 0,
          concluidas: concluidasPorUser.get(id) ?? 0,
          variacao: antes ? Math.round(((atendimentos - antes) / antes) * 100) : atendimentos ? 100 : 0,
        };
      })
      .filter((r) => r.atendimentos || r.mensagens || r.concluidas)
      .sort((a, b) => b.atendimentos - a.atendimentos || b.mensagens - a.mensagens);

    // ---------- Monitoramento ----------
    // última mensagem por número (entrada/saída) para saber quem está sem resposta
    const ultimaPorNumero = new Map<string, { direcao: string; created_at: string }>();
    for (const m of msgsRecentes) {
      if (!m.numero) continue;
      const prev = ultimaPorNumero.get(m.numero);
      if (!prev || m.created_at > prev.created_at) ultimaPorNumero.set(m.numero, { direcao: m.direcao, created_at: m.created_at });
    }
    const ultimaAtividade = new Map<string, string>();
    for (const m of msgs) {
      if (!m.user_id) continue;
      const prev = ultimaAtividade.get(m.user_id);
      if (!prev || m.created_at > prev) ultimaAtividade.set(m.user_id, m.created_at);
    }

    const abertosPorUser = new Map<string, any[]>();
    for (const c of cards) {
      if (!c.owner_id || isFinal(c)) continue;
      const arr = abertosPorUser.get(c.owner_id) ?? [];
      arr.push(c);
      abertosPorUser.set(c.owner_id, arr);
    }

    const monitor: MonitorItem[] = elegiveis.map((id) => {
      const abertos = abertosPorUser.get(id) ?? [];
      let semResposta = 0;
      let esperaMaisAntigaMin = 0;
      let atrasadas = 0;
      for (const c of abertos) {
        const ult = c.numero ? ultimaPorNumero.get(c.numero) : undefined;
        if (ult && ult.direcao === "entrada") {
          semResposta += 1;
          esperaMaisAntigaMin = Math.max(esperaMaisAntigaMin, minutosDesde(ult.created_at) ?? 0);
        }
        const sla = stageById.get(c.stage_id)?.sla_horas;
        if (sla) {
          const h = (Date.now() - new Date(c.entrou_stage_em ?? c.created_at).getTime()) / 3_600_000;
          if (h > sla) atrasadas += 1;
        }
      }
      const min = minutosDesde(ultimaAtividade.get(id));
      const estado: MonitorItem["estado"] = min === null ? "inativo" : min <= 10 ? "online" : min <= 120 ? "ativo" : "inativo";
      return {
        userId: id,
        nome: nomeOf(id),
        avatar: avatarOf(id),
        setor: setorDoUser.get(id) ?? null,
        estado,
        minutosUltimaAtividade: min,
        abertas: abertos.length,
        semResposta,
        esperaMaisAntigaMin,
        atrasadas,
      };
    }).sort((a, b) => b.semResposta - a.semResposta || b.abertas - a.abertas);

    // ---------- Tickets por atendente (tempo real) ----------
    const inicioHoje = new Date(); inicioHoje.setUTCHours(0, 0, 0, 0);
    const hojeIso = inicioHoje.toISOString();
    const limite24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

    const monitorById = new Map(monitor.map((m) => [m.userId, m]));
    const tickets: TicketItem[] = elegiveis.map((id) => {
      const abertos = abertosPorUser.get(id) ?? [];
      let emAndamento = 0;
      let aguardando = 0;
      for (const c of abertos) {
        const ult = c.numero ? ultimaPorNumero.get(c.numero) : undefined;
        if (!ult) continue;
        if (ult.created_at >= limite24h) emAndamento += 1;
        if (ult.direcao === "entrada") aguardando += 1;
      }
      let concluidosHoje = 0;
      for (const c of cards) {
        if (c.owner_id !== id) continue;
        if (stageById.get(c.stage_id)?.tipo !== "ganho") continue;
        if (c.updated_at && c.updated_at >= hojeIso) concluidosHoje += 1;
      }
      return {
        userId: id,
        nome: nomeOf(id),
        avatar: avatarOf(id),
        setor: setorDoUser.get(id) ?? null,
        estado: monitorById.get(id)?.estado ?? "inativo",
        abertos: abertos.length,
        emAndamento,
        aguardando,
        concluidosHoje,
      };
    }).sort((a, b) => b.abertos - a.abertos || b.emAndamento - a.emAndamento);

    const semDono = cards.filter((c: any) => !c.owner_id && !isFinal(c)).length;


    // ---------- Ranking de satisfação ----------
    const ownerPorNumero = new Map<string, string>();
    for (const c of cards) if (c.numero && c.owner_id) ownerPorNumero.set(c.numero, c.owner_id);

    const porUser = new Map<string, { soma: number; qtd: number; dist: number[] }>();
    let negativo: TeamOps["ultimoComentarioNegativo"] = null;
    for (const r of csat) {
      const uid = (r.enviado_por as string) || (r.numero ? ownerPorNumero.get(r.numero) : null);
      if (!uid) continue;
      if (soEu && uid !== soEu) continue;
      const score = Number(r.score);
      if (!(score >= 1 && score <= 5)) continue;
      const e = porUser.get(uid) ?? { soma: 0, qtd: 0, dist: [0, 0, 0, 0, 0] };
      e.soma += score;
      e.qtd += 1;
      e.dist[score - 1] = (e.dist[score - 1] ?? 0) + 1;
      porUser.set(uid, e);
      if (score <= 2 && r.comentario && (!negativo || r.respondido_em > negativo.em)) {
        negativo = { nome: nomeOf(uid), score, comentario: String(r.comentario).slice(0, 240), em: r.respondido_em };
      }
    }
    const csatRank: CsatRankItem[] = Array.from(porUser.entries())
      .map(([uid, e]) => ({
        userId: uid,
        nome: nomeOf(uid),
        avatar: avatarOf(uid),
        media: Math.round((e.soma / e.qtd) * 10) / 10,
        respostas: e.qtd,
        dist: e.dist,
        promotores: Math.round((((e.dist[3] ?? 0) + (e.dist[4] ?? 0)) / e.qtd) * 100),
        detratores: Math.round((((e.dist[0] ?? 0) + (e.dist[1] ?? 0)) / e.qtd) * 100),
      }))
      .sort((a, b) => b.media - a.media || b.respostas - a.respostas);

    return { ranking, monitor, tickets, semDono, csat: csatRank, ultimoComentarioNegativo: negativo, atualizadoEm: new Date().toISOString() };
  });
