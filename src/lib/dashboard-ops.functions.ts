import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveCompanyIdCached } from "./company-cache";

/**
 * Métricas de operação de atendimento (triagem manual, setores, prazos).
 * Usadas apenas pelos widgets novos da categoria "Atendimento & Operação".
 * Não altera nada do dashboard padrão.
 */

export type NamedValue = { name: string; value: number };
export type OpsCard = {
  id: string;
  nome: string;
  numero: string;
  etapa: string;
  setor: string | null;
  responsavel: string | null;
  desde: string;
  horas: number;
  atrasado: boolean;
};

export interface OpsMetrics {
  // fila e triagem
  filaTriagem: number;
  filaTriagemMaisAntigaHoras: number;
  filaLista: OpsCard[];
  tempoTriagemMin: number;
  entradaPorHora: NamedValue[];
  entradaPorDiaSemana: NamedValue[];
  primeiraRespostaMin: number;
  // carga e prazos
  porSetor: NamedValue[];
  /** Atendimentos com movimentação nas últimas 48h, por setor (tempo real). */
  ativosPorSetor: NamedValue[];
  porAtendente: NamedValue[];
  semResponsavelPorSetor: NamedValue[];
  reencaminhamentos: number;
  noPrazo: number;
  atrasadas: number;
  semPrazo: number;
  venceHoje: number;
  vence24h: number;
  paradas: OpsCard[];
  envelhecimento: NamedValue[];
  // fluxo e gargalos
  entradasSerie: { date: string; entradas: number; concluidas: number }[];
  entradasTotal: number;
  concluidasTotal: number;
  tempoPorEtapa: NamedValue[];
  aguardandoCliente: OpsCard[];
  aguardandoOrgao: OpsCard[];
  // produtividade e qualidade
  concluidasPorAtendente: NamedValue[];
  concluidasPorSetor: NamedValue[];
  retrabalho: number;
  csatPorSetor: { name: string; value: number; respostas: number }[];
  csatPorAtendente: { name: string; value: number; respostas: number }[];
  clientesSemDemanda: OpsCard[];
  rotinasMes: { feitas: number; total: number; porSetor: NamedValue[] };
}

function parseCustom(range: string): { from: Date; to: Date } | null {
  if (!range?.startsWith("custom:")) return null;
  const [, f, t] = range.split(":");
  if (!f || !t) return null;
  const from = new Date(`${f}T00:00:00.000Z`);
  const to = new Date(`${t}T23:59:59.999Z`);
  if (isNaN(from.getTime()) || isNaN(to.getTime())) return null;
  return { from, to };
}

function startFrom(range: string): Date {
  const custom = parseCustom(range);
  if (custom) return custom.from;
  const d = new Date();
  if (range === "today") { d.setUTCHours(0, 0, 0, 0); return d; }
  const days = range === "7d" ? 7 : range === "90d" ? 90 : 30;
  d.setUTCDate(d.getUTCDate() - days);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

const EMPTY: OpsMetrics = {
  filaTriagem: 0, filaTriagemMaisAntigaHoras: 0, filaLista: [],
  tempoTriagemMin: 0, entradaPorHora: [], entradaPorDiaSemana: [], primeiraRespostaMin: 0,
  porSetor: [], ativosPorSetor: [], porAtendente: [], semResponsavelPorSetor: [], reencaminhamentos: 0,
  noPrazo: 0, atrasadas: 0, semPrazo: 0, venceHoje: 0, vence24h: 0, paradas: [], envelhecimento: [],
  entradasSerie: [], entradasTotal: 0, concluidasTotal: 0, tempoPorEtapa: [],
  aguardandoCliente: [], aguardandoOrgao: [],
  concluidasPorAtendente: [], concluidasPorSetor: [], retrabalho: 0,
  csatPorSetor: [], csatPorAtendente: [], clientesSemDemanda: [],
  rotinasMes: { feitas: 0, total: 0, porSetor: [] },
};

async function fetchAll(supabase: any, table: string, select: string, apply: (q: any) => any) {
  const PAGE = 1000;
  const out: any[] = [];
  for (let from = 0; from < 20000; from += PAGE) {
    const { data, error } = await apply(supabase.from(table).select(select)).range(from, from + PAGE - 1);
    if (error || !data) break;
    out.push(...data);
    if (data.length < PAGE) break;
  }
  return out;
}

const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function horasDesde(iso: string | null): number {
  if (!iso) return 0;
  return Math.max(0, (Date.now() - new Date(iso).getTime()) / 3_600_000);
}

function topN(map: Map<string, number>, n = 12): NamedValue[] {
  return Array.from(map.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, n);
}

export const getOpsMetrics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { range?: string; companyId?: string | null }) => ({
    range: d?.range || "30d",
    companyId: d?.companyId ?? null,
  }))
  .handler(async ({ data, context }): Promise<OpsMetrics> => {
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
    const scopedOwnerId = membership?.role === "atendente" ? userId : null;

    const desde = startFrom(data.range);
    const desdeIso = desde.toISOString();

    const [pipelines, stages, departments, cards, historico, members] = await Promise.all([
      fetchAll(supabase, "crm_pipeline", "id, nome, tipo, entrada, ativo", (q: any) => q.eq("company_id", companyId)),
      fetchAll(supabase, "crm_stage", "id, nome, ordem, tipo, pipeline_id, department_id, sla_horas", (q: any) => q.eq("company_id", companyId)),
      fetchAll(supabase, "department", "id, nome, pipeline_id, ativo", (q: any) => q.eq("company_id", companyId)),
      fetchAll(
        supabase,
        "crm_cards",
        "id, nome, numero, stage_id, pipeline_id, department_id, owner_id, created_at:primeiro_contato_em, entrou_stage_em, ultima_em, updated_at, tipo_contato",
        (q: any) => {
          let x = q.eq("company_id", companyId);
          if (scopedOwnerId) x = x.eq("owner_id", scopedOwnerId);
          return x.order("id", { ascending: true });
        },
      ),
      fetchAll(
        supabase,
        "crm_card_stage_history",
        "card_id, pipeline_id, stage_from, stage_to, stage_from_nome, stage_to_nome, tempo_na_etapa_seg, created_at",
        (q: any) => q.eq("company_id", companyId).gte("created_at", desdeIso).order("created_at", { ascending: true }),
      ),
      fetchAll(supabase, "company_user", "user_id, role", (q: any) => q.eq("company_id", companyId).eq("ativo", true)),
    ]);

    const stageById = new Map<string, any>(stages.map((s: any) => [s.id, s]));
    const depById = new Map<string, any>(departments.map((d: any) => [d.id, d]));
    const pipeById = new Map<string, any>(pipelines.map((p: any) => [p.id, p]));
    const entradaPipe = pipelines.find((p: any) => p.entrada) ?? pipelines.find((p: any) => p.tipo === "comercial") ?? pipelines[0];

    // nomes dos usuários
    const userIds = Array.from(new Set(members.map((m: any) => m.user_id).filter(Boolean)));
    const nomeUser = new Map<string, string>();
    if (userIds.length) {
      const { data: profs } = await supabase
        .from("profiles").select("user_id, nome, email").in("user_id", userIds);
      for (const p of profs ?? []) nomeUser.set(p.user_id as string, (p.nome as string) || (p.email as string) || "—");
    }

    const setorDoCard = (c: any): string | null => {
      const st = stageById.get(c.stage_id);
      const depId = c.department_id ?? st?.department_id ?? null;
      if (depId) return depById.get(depId)?.nome ?? null;
      const pipe = pipeById.get(c.pipeline_id);
      const dep = departments.find((d: any) => d.pipeline_id === c.pipeline_id);
      return dep?.nome ?? pipe?.nome ?? null;
    };

    const isFinal = (c: any) => {
      const st = stageById.get(c.stage_id);
      return st?.tipo === "ganho" || st?.tipo === "perda";
    };

    const toOps = (c: any): OpsCard => {
      const st = stageById.get(c.stage_id);
      const h = horasDesde(c.entrou_stage_em ?? c.created_at);
      return {
        id: c.id,
        nome: c.nome || c.numero,
        numero: c.numero,
        etapa: st?.nome ?? "—",
        setor: setorDoCard(c),
        responsavel: c.owner_id ? (nomeUser.get(c.owner_id) ?? "—") : null,
        desde: c.entrou_stage_em ?? c.created_at,
        horas: Math.round(h),
        atrasado: st?.sla_horas ? h > st.sla_horas : false,
      };
    };

    const abertos = cards.filter((c: any) => !isFinal(c));

    // ---------- Fila e triagem ----------
    const filaCards = abertos.filter((c: any) => {
      const st = stageById.get(c.stage_id);
      const naEntrada = entradaPipe ? c.pipeline_id === entradaPipe.id : false;
      const semDestino = !c.owner_id || (!c.department_id && !st?.department_id);
      return (naEntrada || !c.stage_id) && semDestino;
    });
    const filaLista = filaCards.map(toOps).sort((a, b) => b.horas - a.horas).slice(0, 30);
    const filaTriagemMaisAntigaHoras = filaLista.length ? filaLista[0]!.horas : 0;

    // tempo de triagem: tempo na etapa de entrada antes do primeiro encaminhamento
    const triagemSegs: number[] = [];
    const vistos = new Set<string>();
    for (const h of historico) {
      if (!h.stage_from || vistos.has(h.card_id)) continue;
      const from = stageById.get(h.stage_from);
      if (entradaPipe && from?.pipeline_id === entradaPipe.id && h.tempo_na_etapa_seg) {
        triagemSegs.push(Number(h.tempo_na_etapa_seg));
        vistos.add(h.card_id);
      }
    }
    const tempoTriagemMin = triagemSegs.length
      ? Math.round(triagemSegs.reduce((a, b) => a + b, 0) / triagemSegs.length / 60)
      : 0;

    // entrada por hora / dia da semana
    const porHora = new Map<string, number>();
    const porDia = new Map<string, number>();
    const novos = cards.filter((c: any) => c.created_at && c.created_at >= desdeIso);
    for (const c of novos) {
      const d = new Date(c.created_at);
      const hh = `${String(d.getHours()).padStart(2, "0")}h`;
      porHora.set(hh, (porHora.get(hh) ?? 0) + 1);
      const dia = DIAS[d.getDay()]!;
      porDia.set(dia, (porDia.get(dia) ?? 0) + 1);
    }
    const entradaPorHora = Array.from(porHora.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const entradaPorDiaSemana = DIAS.map((d) => ({ name: d, value: porDia.get(d) ?? 0 }));

    // primeira resposta humana
    let somaResp = 0, qtdResp = 0;
    if (novos.length) {
      const numeros = novos.map((c: any) => c.numero).filter(Boolean).slice(0, 300);
      if (numeros.length) {
        const msgs = await fetchAll(
          supabase,
          "mensagens",
          "numero, direcao, autor, created_at",
          (q: any) => q.eq("company_id", companyId).gte("created_at", desdeIso).in("numero", numeros).order("created_at", { ascending: true }),
        );
        const primeiraEntrada = new Map<string, number>();
        const primeiraSaida = new Map<string, number>();
        for (const m of msgs) {
          const t = new Date(m.created_at).getTime();
          if (m.direcao === "entrada") {
            if (!primeiraEntrada.has(m.numero)) primeiraEntrada.set(m.numero, t);
          } else if (m.autor !== "ia" && m.autor !== "automacao") {
            if (!primeiraSaida.has(m.numero)) primeiraSaida.set(m.numero, t);
          }
        }
        for (const [num, tIn] of primeiraEntrada) {
          const tOut = primeiraSaida.get(num);
          if (tOut && tOut > tIn) { somaResp += tOut - tIn; qtdResp++; }
        }
      }
    }
    const primeiraRespostaMin = qtdResp ? Math.round(somaResp / qtdResp / 60000) : 0;

    // ---------- Carga e prazos ----------
    const mSetor = new Map<string, number>();
    const mSetorAtivo = new Map<string, number>();
    const ativoDesdeIso = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
    const mAtend = new Map<string, number>();
    const mSemResp = new Map<string, number>();
    let noPrazo = 0, atrasadas = 0, semPrazo = 0, venceHoje = 0, vence24h = 0;
    const faixas = new Map<string, number>([["0–3 dias", 0], ["4–7 dias", 0], ["+7 dias", 0]]);
    const paradasArr: OpsCard[] = [];
    const aguardandoCliente: OpsCard[] = [];
    const aguardandoOrgao: OpsCard[] = [];

    for (const c of abertos) {
      const st = stageById.get(c.stage_id);
      const setor = setorDoCard(c) ?? "Sem setor";
      mSetor.set(setor, (mSetor.get(setor) ?? 0) + 1);
      const ultimaAtividade = c.ultima_em ?? c.updated_at ?? null;
      if (ultimaAtividade && ultimaAtividade >= ativoDesdeIso) {
        mSetorAtivo.set(setor, (mSetorAtivo.get(setor) ?? 0) + 1);
      }
      if (c.owner_id) {
        const n = nomeUser.get(c.owner_id) ?? "—";
        mAtend.set(n, (mAtend.get(n) ?? 0) + 1);
      } else {
        mSemResp.set(setor, (mSemResp.get(setor) ?? 0) + 1);
      }

      const h = horasDesde(c.entrou_stage_em ?? c.created_at);
      if (!st?.sla_horas) semPrazo++;
      else if (h > st.sla_horas) atrasadas++;
      else {
        noPrazo++;
        const restante = st.sla_horas - h;
        if (restante <= 24) vence24h++;
        if (restante <= 24 - new Date().getHours() || restante <= 8) venceHoje++;
      }

      const dias = horasDesde(c.ultima_em ?? c.entrou_stage_em ?? c.created_at) / 24;
      if (dias <= 3) faixas.set("0–3 dias", (faixas.get("0–3 dias") ?? 0) + 1);
      else if (dias <= 7) faixas.set("4–7 dias", (faixas.get("4–7 dias") ?? 0) + 1);
      else faixas.set("+7 dias", (faixas.get("+7 dias") ?? 0) + 1);

      if (dias >= 3) paradasArr.push(toOps(c));

      const nomeEtapa = (st?.nome ?? "").toLowerCase();
      if (nomeEtapa.includes("aguardando cliente") || nomeEtapa.includes("documento")) aguardandoCliente.push(toOps(c));
      if (nomeEtapa.includes("órgão") || nomeEtapa.includes("orgao") || nomeEtapa.includes("exigência") || nomeEtapa.includes("exigencia") || nomeEtapa.includes("protocolad")) aguardandoOrgao.push(toOps(c));
    }

    const paradas = paradasArr.sort((a, b) => b.horas - a.horas).slice(0, 30);

    // reencaminhamentos (mudou de funil/setor no período)
    let reencaminhamentos = 0;
    for (const h of historico) {
      const from = stageById.get(h.stage_from ?? "");
      const to = stageById.get(h.stage_to ?? "");
      if (!from || !to) continue;
      const depFrom = from.department_id ?? from.pipeline_id;
      const depTo = to.department_id ?? to.pipeline_id;
      if (depFrom && depTo && depFrom !== depTo) reencaminhamentos++;
    }

    // ---------- Fluxo ----------
    const serieMap = new Map<string, { entradas: number; concluidas: number }>();
    const dayKey = (iso: string) => new Date(iso).toISOString().slice(0, 10);
    for (const c of novos) {
      const k = dayKey(c.created_at);
      const cur = serieMap.get(k) ?? { entradas: 0, concluidas: 0 };
      cur.entradas++; serieMap.set(k, cur);
    }
    let concluidasTotal = 0;
    const mConcAtend = new Map<string, number>();
    const mConcSetor = new Map<string, number>();
    const cardById = new Map<string, any>(cards.map((c: any) => [c.id, c]));
    for (const h of historico) {
      const to = stageById.get(h.stage_to ?? "");
      if (to?.tipo !== "ganho") continue;
      concluidasTotal++;
      const k = dayKey(h.created_at);
      const cur = serieMap.get(k) ?? { entradas: 0, concluidas: 0 };
      cur.concluidas++; serieMap.set(k, cur);
      const card = cardById.get(h.card_id);
      if (card?.owner_id) {
        const n = nomeUser.get(card.owner_id) ?? "—";
        mConcAtend.set(n, (mConcAtend.get(n) ?? 0) + 1);
      }
      const setor = card ? (setorDoCard(card) ?? "Sem setor") : "Sem setor";
      mConcSetor.set(setor, (mConcSetor.get(setor) ?? 0) + 1);
    }
    const entradasSerie = Array.from(serieMap.entries())
      .map(([date, v]) => ({ date, ...v }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // tempo médio por etapa
    const tempoEtapa = new Map<string, { soma: number; n: number }>();
    for (const h of historico) {
      if (!h.stage_from || !h.tempo_na_etapa_seg) continue;
      const nome = h.stage_from_nome ?? stageById.get(h.stage_from)?.nome ?? "—";
      const cur = tempoEtapa.get(nome) ?? { soma: 0, n: 0 };
      cur.soma += Number(h.tempo_na_etapa_seg); cur.n++;
      tempoEtapa.set(nome, cur);
    }
    const tempoPorEtapa = Array.from(tempoEtapa.entries())
      .map(([name, v]) => ({ name, value: Math.round(v.soma / v.n / 3600) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 12);

    // retrabalho: voltou para etapa de ordem anterior
    let retrabalho = 0;
    for (const h of historico) {
      const from = stageById.get(h.stage_from ?? "");
      const to = stageById.get(h.stage_to ?? "");
      if (from && to && from.pipeline_id === to.pipeline_id && (to.ordem ?? 0) < (from.ordem ?? 0)) retrabalho++;
    }

    // ---------- CSAT ----------
    const csatPorSetor: { name: string; value: number; respostas: number }[] = [];
    const csatPorAtendente: { name: string; value: number; respostas: number }[] = [];
    {
      const respostas = await fetchAll(
        supabase,
        "csat_response",
        "score, numero, enviado_por, enviado_em",
        (q: any) => q.eq("company_id", companyId).gte("enviado_em", desdeIso).not("score", "is", null),
      );
      const setorPorNumero = new Map<string, string>();
      for (const c of cards) if (c.numero) setorPorNumero.set(c.numero, setorDoCard(c) ?? "Sem setor");
      const agrSetor = new Map<string, { soma: number; n: number }>();
      const agrAtend = new Map<string, { soma: number; n: number }>();
      for (const r of respostas) {
        const s = Number(r.score);
        if (!s) continue;
        const setor = setorPorNumero.get(r.numero) ?? "Sem setor";
        const a = agrSetor.get(setor) ?? { soma: 0, n: 0 };
        a.soma += s; a.n++; agrSetor.set(setor, a);
        if (r.enviado_por) {
          const nome = nomeUser.get(r.enviado_por) ?? "—";
          const b = agrAtend.get(nome) ?? { soma: 0, n: 0 };
          b.soma += s; b.n++; agrAtend.set(nome, b);
        }
      }
      for (const [name, v] of agrSetor) csatPorSetor.push({ name, value: +(v.soma / v.n).toFixed(2), respostas: v.n });
      for (const [name, v] of agrAtend) csatPorAtendente.push({ name, value: +(v.soma / v.n).toFixed(2), respostas: v.n });
      csatPorSetor.sort((a, b) => b.value - a.value);
      csatPorAtendente.sort((a, b) => b.value - a.value);
    }

    // ---------- Clientes sem demanda no mês ----------
    const inicioMes = new Date();
    inicioMes.setUTCDate(1); inicioMes.setUTCHours(0, 0, 0, 0);
    const clientesSemDemanda = cards
      .filter((c: any) => (c.tipo_contato === "cliente" || c.tipo_contato === "ativo") &&
        new Date(c.ultima_em ?? c.updated_at ?? c.created_at) < inicioMes)
      .map(toOps)
      .sort((a, b) => b.horas - a.horas)
      .slice(0, 30);

    // ---------- Rotinas do mês ----------
    const rotinaHist = historico.filter((h: any) => h.created_at >= inicioMes.toISOString());
    const rotinaSetor = new Map<string, number>();
    let feitas = 0;
    for (const h of rotinaHist) {
      const to = stageById.get(h.stage_to ?? "");
      if (to?.tipo !== "ganho") continue;
      feitas++;
      const card = cardById.get(h.card_id);
      const setor = card ? (setorDoCard(card) ?? "Sem setor") : "Sem setor";
      rotinaSetor.set(setor, (rotinaSetor.get(setor) ?? 0) + 1);
    }
    const totalMes = cards.filter((c: any) => new Date(c.created_at) >= inicioMes).length;

    return {
      filaTriagem: filaCards.length,
      filaTriagemMaisAntigaHoras,
      filaLista,
      tempoTriagemMin,
      entradaPorHora,
      entradaPorDiaSemana,
      primeiraRespostaMin,
      porSetor: topN(mSetor),
      ativosPorSetor: topN(mSetorAtivo),
      porAtendente: topN(mAtend),
      semResponsavelPorSetor: topN(mSemResp),
      reencaminhamentos,
      noPrazo, atrasadas, semPrazo, venceHoje, vence24h,
      paradas,
      envelhecimento: Array.from(faixas.entries()).map(([name, value]) => ({ name, value })),
      entradasSerie,
      entradasTotal: novos.length,
      concluidasTotal,
      tempoPorEtapa,
      aguardandoCliente: aguardandoCliente.sort((a, b) => b.horas - a.horas).slice(0, 30),
      aguardandoOrgao: aguardandoOrgao.sort((a, b) => b.horas - a.horas).slice(0, 30),
      concluidasPorAtendente: topN(mConcAtend),
      concluidasPorSetor: topN(mConcSetor),
      retrabalho,
      csatPorSetor,
      csatPorAtendente,
      clientesSemDemanda,
      rotinasMes: { feitas, total: Math.max(feitas, totalMes), porSetor: topN(rotinaSetor) },
    };
  });
