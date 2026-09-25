import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveCompanyIdCached } from "./company-cache";

async function resolveCompanyId(supabase: any, userId: string): Promise<string | null> {
  try {
    return await resolveCompanyIdCached(supabase, userId);
  } catch {
    return null;
  }
}
// Períodos fixos ("today" | "7d" | "30d" | "90d") ou personalizado:
// "custom:YYYY-MM-DD:YYYY-MM-DD".
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
  const now = new Date();
  const d = new Date(now);
  if (range === "today") { d.setUTCHours(0, 0, 0, 0); return d; }
  const days = range === "7d" ? 7 : range === "90d" ? 90 : 30;
  d.setUTCDate(d.getUTCDate() - days);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}


// PostgREST limita 1000 linhas por request: paginamos para contar TODOS os cards
// (senão o funil do dashboard fica menor que o CRM Kanban).
async function fetchAllCards(supabase: any, companyId: string, ownerId?: string | null) {
  const PAGE = 1000;
  const all: any[] = [];
  for (let from = 0; from < 50000; from += PAGE) {
    let query = supabase.from("crm_cards")
      .select("id,numero,stage_id,valor,origem,canal_chat,owner_id,entrou_stage_em,primeiro_contato_em,regua_status,updated_at,pipeline_id,tipo_contato")
      .eq("company_id", companyId);
    if (ownerId) query = query.eq("owner_id", ownerId);
    const { data, error } = await query
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error || !data) break;
    all.push(...data);
    if (data.length < PAGE) break;
  }
  return all;
}


export const getDashboardMetrics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { range: string; companyId?: string | null }) => ({ range: d.range || "30d", companyId: d.companyId ?? null }))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // Se o cliente informar a empresa ativa, usamos ela (RLS garante o acesso).
    let companyId: string | null = null;
    if (data.companyId) {
      const { data: allowed } = await supabase.from("company").select("id").eq("id", data.companyId).maybeSingle();
      if (allowed?.id) companyId = allowed.id as string;
    }
    if (!companyId) companyId = await resolveCompanyId(supabase, userId);

    const empty = {
      revenueWon: 0, revenueDelta: 0, newLeads: 0, leadsDelta: 0,
      conversionRate: 0, pipelineValue: 0, pendingFollowups: 0,
      unreadMessages: 0,
      salesCount: 0, avgTicket: 0, lossCount: 0,
      scheduledCount: 0, unassignedLeads: 0,
      csatAvg: 0, csatCount: 0, csatSent: 0, csatResponseRate: 0,
      csatPromoters: 0, csatNeutrals: 0, csatDetractors: 0,
      convTotal: 0, convAguardando: 0, convEmAtendimento: 0, convFinalizados: 0,
      atendentesOnline: 0, atendentesTotal: 0,
      tempoEsperaMin: 0, tempoAtendimentoMin: 0,
      aiHandledCount: 0,
      aiQualifiedCount: 0,
      aiHandoffCount: 0,
      revenueSeries: [] as { date: string; value: number }[],
      funnelStages: [] as { stage: string; count: number }[],
      sourcesBreakdown: [] as { name: string; value: number }[],
      channelsBreakdown: [] as { name: string; value: number }[],
      leadsByChannel: [] as { name: string; value: number }[],
      salesByItem: [] as { name: string; value: number }[],
      ranking: [] as { name: string; value: number; avatar_url: string | null }[],
      leadsPerUser: [] as { name: string; value: number; avatar_url: string | null }[],
      generalGoalCents: 0,
      totalRevenueCents: 0,
      lossValueCents: 0,
      agentName: null as string | null,
      agentTraits: null as any | null,
      agentAvatarUrl: null as string | null,

    };

    if (!companyId) return empty;

    // Atendente só enxerga o que é dele (cards sob sua responsabilidade).
    const { data: myMembership } = await supabase
      .from("company_user").select("role")
      .eq("company_id", companyId).eq("user_id", userId).maybeSingle();
    const scopedOwnerId = (myMembership?.role === "atendente") ? userId : null;



    const custom = parseCustom(data.range);
    const start = startFrom(data.range);
    const startIso = start.toISOString();
    const nowIso = new Date().toISOString();
    // Fim do período: no personalizado é a data final escolhida; nos fixos
    // mantemos a janela futura usada pelos compromissos agendados.
    const endIso = custom ? custom.to.toISOString() : null;
    const rangeEndIso = custom
      ? custom.to.toISOString()
      : new Date(Date.now() + (data.range === "today" ? 1 : data.range === "7d" ? 7 : data.range === "90d" ? 90 : 30) * 24 * 3600 * 1000).toISOString();
    const since24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    // Limita a consulta ao fim do período quando ele é personalizado.
    const cap = (q: any, col: string) => (endIso ? q.lte(col, endIso) : q);



    const cards = await fetchAllCards(supabase, companyId, scopedOwnerId);
    // Números atendidos pelo usuário — usados para recortar mensagens/CSAT/agenda.
    const myNumbers = scopedOwnerId
      ? new Set((cards ?? []).map((c: any) => String(c.numero || "")).filter(Boolean))
      : null;
    const mine = (numero: any) => !myNumbers || myNumbers.has(String(numero || ""));
    const myNumbersArr = myNumbers ? Array.from(myNumbers) : null;

    // Quando o usuário é atendente, filtramos por número JÁ na consulta (em lotes),
    // senão o limite de linhas devolve registros de outros atendentes e zera as métricas.
    async function fetchScopedByNumero(
      build: (numeros: string[] | null) => any,
      perQueryLimit?: number,
    ): Promise<any[]> {
      if (!myNumbersArr) {
        const q = perQueryLimit ? build(null).limit(perQueryLimit) : build(null);
        const { data } = await q;
        return data ?? [];
      }
      if (myNumbersArr.length === 0) return [];
      const CHUNK = 150;
      const chunks: string[][] = [];
      for (let i = 0; i < myNumbersArr.length; i += CHUNK) chunks.push(myNumbersArr.slice(i, i + CHUNK));
      const results = await Promise.all(
        chunks.map(async (nums) => {
          const q = perQueryLimit ? build(nums).limit(perQueryLimit) : build(nums);
          const { data } = await q;
          return data ?? [];
        }),
      );
      return results.flat();
    }


    // Todas as consultas independentes rodam em paralelo (antes eram sequenciais)
    const [
      { data: stages },
      { data: pipes },
      { data: vendasRaw },
      scheduledRows,
      csatRaw,
      msgsRaw,

      { count: atendentesTotal },
      { data: goalRows },
      { data: usersInCompany },
      { data: lossEvents },
      { data: aiLogs },
      { data: agentCfg },
    ] = await Promise.all([
      supabase.from("crm_stage").select("id,nome,tipo,ordem,pipeline_id").eq("company_id", companyId),

      supabase.from("crm_pipeline").select("id,tipo,ordem")
        .eq("company_id", companyId).eq("ativo", true).order("ordem", { ascending: true }),
      (scopedOwnerId
        ? cap(supabase.from("crm_venda").select("valor_cents,vendido_em,owner_id,item_nome")
            .eq("company_id", companyId).gte("vendido_em", startIso).eq("owner_id", scopedOwnerId), "vendido_em")
        : cap(supabase.from("crm_venda").select("valor_cents,vendido_em,owner_id,item_nome")
            .eq("company_id", companyId).gte("vendido_em", startIso), "vendido_em")),
      fetchScopedByNumero((nums) => {
        let q = supabase.from("mensagem_agendada").select("numero")
          .eq("company_id", companyId).eq("tipo", "compromisso").neq("status", "cancelado")
          .gte("agendado_para", endIso ? startIso : nowIso).lte("agendado_para", rangeEndIso);
        if (nums) q = q.in("numero", nums);
        return q;
      }),
      fetchScopedByNumero((nums) => {
        let q = cap(supabase.from("csat_response").select("numero,score,respondido_em,created_at")
          .eq("company_id", companyId).gte("created_at", startIso), "created_at");
        if (nums) q = q.in("numero", nums);
        return q;
      }),
      fetchScopedByNumero((nums) => {
        let q = cap(supabase.from("mensagens").select("numero,direcao,autor,created_at")
          .eq("company_id", companyId).gte("created_at", startIso), "created_at");
        if (nums) q = q.in("numero", nums);
        return q.order("created_at", { ascending: true });
      }, 5000),


      supabase.from("company_user").select("user_id", { count: "exact", head: true })
        .eq("company_id", companyId),
      supabase.from("crm_goals" as any).select("user_id, value_cents")
        .eq("company_id", companyId).eq("year_month", new Date().toISOString().slice(0, 7)),
      supabase.from("company_user").select("user_id, profiles(nome, avatar_url)")
        .eq("company_id", companyId).eq("ativo", true),
      cap(supabase.from("lead_evento").select("descricao, created_at")
        .eq("company_id", companyId).eq("tipo", "perda").gte("created_at", startIso), "created_at"),
      cap(supabase.from("audit_log").select("acao, detalhes")
        .eq("company_id", companyId)
        .in("acao", ["ai_response", "ai_error"])
        .gte("created_at", startIso), "created_at"),

      supabase.from("agent_config").select("nome_agente, avatar_traits, avatar_url").eq("company_id", companyId).maybeSingle(),
    ]);

    const vendas = vendasRaw ?? [];
    const csatRows = (csatRaw ?? []).filter((r: any) => mine(r.numero));
    const msgs = ((msgsRaw ?? []) as any[]).sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    ).filter((r: any) => mine(r.numero));
    const scheduledCount = (scheduledRows ?? []).filter((r: any) => mine(r.numero)).length;




    const stageById = new Map((stages ?? []).map((s: any) => [s.id, s]));

    let pipelineValue = 0;
    let lossCount = 0;
    let newLeads = 0;
    let pendingFollowups = 0;
    let unassignedLeads = 0;
    const stageCounts = new Map<string, { nome: string; ordem: number; count: number }>();
    const sourceCounts = new Map<string, number>();
    const channelCounts = new Map<string, number>();
    const leadChannelCounts = new Map<string, number>();


    const primaryPipeId = (pipes ?? []).find((p: any) => p.tipo === "comercial")?.id
      ?? (pipes ?? [])[0]?.id ?? null;


    for (const c of (cards ?? []) as any[]) {
      const st = stageById.get(c.stage_id) as any | undefined;
      const tipo = st?.tipo ?? "normal";
      const val = Number(c.valor || 0);
      
      const updatedAt = c.updated_at ? new Date(c.updated_at) : null;
      const enteredStageAt = c.entrou_stage_em ? new Date(c.entrou_stage_em) : null;
      // Corrigindo a prioridade de data para Novos Leads
      const createdAt = c.primeiro_contato_em ? new Date(c.primeiro_contato_em) : (c.updated_at ? new Date(c.updated_at) : enteredStageAt);
      
      const end = endIso ? new Date(endIso) : null;
      const inWin = (d: Date | null) => !!d && d >= start && (!end || d <= end);
      const createdInRange = inWin(createdAt);
      const updatedInRange = inWin(updatedAt);
      const enteredInRange = inWin(enteredStageAt);


      if (tipo === "perda") {
        if (updatedInRange) lossCount++;
      } else if (tipo !== "ganho") {
        // Pipeline em aberto = apenas oportunidades do funil comercial principal,
        // em etapas que não são de ganho nem de perda.
        const inPrimaryPipe = !primaryPipeId || (st?.pipeline_id ?? c.pipeline_id) === primaryPipeId;
        if (st && inPrimaryPipe) pipelineValue += val;
        if (!c.owner_id) unassignedLeads++;
      }

      if (createdInRange) {
        newLeads++;
        let lch = (c.canal_chat || c.canal_entrada || "whatsapp").toString().toLowerCase();
        // Normalização básica para evitar duplicatas visuais
        if (lch.includes("whatsapp")) lch = "whatsapp";
        if (lch.includes("instagram")) lch = "instagram";
        if (lch.includes("messenger") || lch.includes("facebook")) lch = "messenger";
        
        leadChannelCounts.set(lch, (leadChannelCounts.get(lch) ?? 0) + 1);
      }
      
      if (c.regua_status === "ativa") pendingFollowups++;

      if (st && tipo !== "perda") {
        const key = st.id as string;
        const prev = stageCounts.get(key);
        stageCounts.set(key, { nome: st.nome, ordem: Number(st.ordem ?? 0), count: (prev?.count ?? 0) + 1 });
      }

      const src = (c.origem || "Não informado").toString();
      if (createdInRange || updatedInRange || enteredInRange) {
        sourceCounts.set(src, (sourceCounts.get(src) ?? 0) + 1);
      }

      if (createdInRange || updatedInRange || enteredInRange) {
        let ch = (c.canal_chat || c.canal_entrada || "whatsapp").toString().toLowerCase();
        if (ch.includes("whatsapp")) ch = "whatsapp";
        if (ch.includes("instagram")) ch = "instagram";
        if (ch.includes("messenger") || ch.includes("facebook")) ch = "messenger";
        channelCounts.set(ch, (channelCounts.get(ch) ?? 0) + 1);
      }
    }

    // ============ Vendas (fonte única: crm_venda) ============


    const revenueByDay = new Map<string, number>();
    const ownerWins = new Map<string, number>();
    const salesByItemMap = new Map<string, number>();
    let revenueWon = 0;
    let salesCount = 0;
    for (const v of (vendas ?? []) as any[]) {
      const val = Number(v.valor_cents || 0) / 100;
      revenueWon += val;
      salesCount++;
      const day = new Date(v.vendido_em).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
      revenueByDay.set(day, (revenueByDay.get(day) ?? 0) + val);
      if (v.owner_id) ownerWins.set(v.owner_id, (ownerWins.get(v.owner_id) ?? 0) + 1);
      
      const item = v.item_nome || "Outros";
      salesByItemMap.set(item, (salesByItemMap.get(item) ?? 0) + val);
    }
    const avgTicket = salesCount > 0 ? Math.round(revenueWon / salesCount) : 0;
    // Conversão = vendas do período / leads que entraram no período.
    const conversionRate = newLeads > 0
      ? Math.round((salesCount / newLeads) * 100)
      : (salesCount > 0 ? 100 : 0);





    // Revenue series (fill missing days with 0)
    const revenueSeries: { date: string; value: number }[] = [];
    if (custom) {
      const totalDays = Math.max(1, Math.round((custom.to.getTime() - custom.from.getTime()) / 86400000) + 1);
      const step = totalDays > 45 ? Math.ceil(totalDays / 30) : 1;
      for (let i = 0; i < totalDays; i += step) {
        const d = new Date(custom.from.getTime() + i * 86400000);
        const label = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
        revenueSeries.push({ date: label, value: revenueByDay.get(label) ?? 0 });
      }
    } else {
      const daysBuckets = data.range === "today" ? 1 : data.range === "7d" ? 7 : 30;
      for (let i = daysBuckets - 1; i >= 0; i--) {
        const d = new Date();
        const step = data.range === "90d" ? 3 : 1;
        d.setDate(d.getDate() - i * step);
        const label = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
        revenueSeries.push({ date: label, value: revenueByDay.get(label) ?? 0 });
      }
    }


    // Funil: etapas do pipeline principal (exceto perda).
    // Na etapa de Ganho contamos as vendas do período (crm_venda), pois o card
    // pode ter sido remanejado para outro funil (ex.: pós-venda) depois de ganho.
    const funnelStages = (stages ?? [])
      .filter((s: any) => s.pipeline_id === primaryPipeId && s.tipo !== "perda")
      .sort((a: any, b: any) => Number(a.ordem ?? 0) - Number(b.ordem ?? 0))
      .map((s: any) => ({
        stage: s.nome as string,
        count: s.tipo === "ganho"
          ? Math.max(salesCount, stageCounts.get(s.id)?.count ?? 0)
          : (stageCounts.get(s.id)?.count ?? 0),
      }));
    
    // Se o funil principal estiver vazio ou não retornar nada, mostrar qualquer etapa ativa com cards
    if (funnelStages.length === 0 || funnelStages.every(s => s.count === 0)) {
      const activeStagesWithCards = Array.from(stageCounts.values())
        .filter(s => s.count > 0)
        .sort((a, b) => a.ordem - b.ordem)
        .slice(0, 5)
        .map(s => ({ stage: s.nome, count: s.count }));
      
      if (activeStagesWithCards.length > 0) {
        funnelStages.splice(0, funnelStages.length, ...activeStagesWithCards);
      }
    }

    const sourcesBreakdown = Array.from(sourceCounts.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);

    const CANAL_LABELS: Record<string, string> = {
      whatsapp: "WhatsApp", messenger: "Messenger",
      instagram: "Instagram", telegram: "Telegram",
    };
    const channelsBreakdown = Array.from(channelCounts.entries())
      .map(([name, value]) => ({ name: CANAL_LABELS[name] ?? name, value }))
      .sort((a, b) => b.value - a.value);

    const leadsByChannel = Array.from(leadChannelCounts.entries())
      .map(([name, value]) => ({ name: CANAL_LABELS[name] ?? name, value }))
      .sort((a, b) => b.value - a.value);

    const salesByItem = Array.from(salesByItemMap.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);



    // Ranking (owner names) – por número de vendas
    let ranking: { name: string; value: number; avatar_url: string | null }[] = [];
    const ownerIds = Array.from(ownerWins.keys());
    if (ownerIds.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("user_id,nome,avatar_url")
        .in("user_id", ownerIds);
      const nameById = new Map((profs ?? []).map((p: any) => [p.user_id, { nome: p.nome || "—", avatar: p.avatar_url }]));
      ranking = Array.from(ownerWins.entries())
        .map(([id, value]) => {
          const info = nameById.get(id);
          return { name: info?.nome || "—", value, avatar_url: info?.avatar || null };
        })
        .sort((a, b) => b.value - a.value)
        .slice(0, 6);
    }

    // Leads por usuário (atendimento em tempo real)
    const activeLeadsByUser = new Map<string, number>();
    for (const c of (cards ?? []) as any[]) {
      if (c.owner_id) {
        // Consideramos leads "em atendimento" aqueles que não estão em colunas de desfecho final (ganho/perda)
        const st = stageById.get(c.stage_id) as any;
        if (st && st.tipo !== "ganho" && st.tipo !== "perda") {
          activeLeadsByUser.set(c.owner_id, (activeLeadsByUser.get(c.owner_id) ?? 0) + 1);
        }
      }
    }

    const leadsPerUser = (usersInCompany ?? []).map((u: any) => {
      const profile = Array.isArray(u.profiles) ? u.profiles[0] : u.profiles;
      return {
        name: profile?.nome || "Atendente",
        avatar_url: profile?.avatar_url || null,
        value: activeLeadsByUser.get(u.user_id) ?? 0
      };
    }).sort((a: any, b: any) => b.value - a.value);

    // CSAT metrics for the range

    const csatSent = (csatRows ?? []).length;
    const answered = (csatRows ?? []).filter((r: any) => r.score != null);
    const csatCount = answered.length;
    const sumScore = answered.reduce((s: number, r: any) => s + Number(r.score || 0), 0);
    const csatAvg = csatCount > 0 ? Number((sumScore / csatCount).toFixed(2)) : 0;
    const csatResponseRate = csatSent > 0 ? Math.round((csatCount / csatSent) * 100) : 0;
    const csatPromoters = answered.filter((r: any) => Number(r.score) === 5).length;
    const csatNeutrals = answered.filter((r: any) => Number(r.score) === 4).length;
    const csatDetractors = answered.filter((r: any) => Number(r.score) <= 3).length;

    // ============ Atendimento (conversas) ============


    const threads = new Map<string, { first: number; last: number; lastDir: string; firstIn: number | null; firstOutAfterIn: number | null }>();
    const onlineAgents = new Set<string>();
    const onlineSince = Date.now() - 30 * 60 * 1000;
    for (const m of (msgs ?? []) as any[]) {
      const ts = new Date(m.created_at).getTime();
      const dir = m.direcao === "entrada" || m.direcao === "in" ? "in" : "out";
      const t = threads.get(m.numero) ?? { first: ts, last: ts, lastDir: dir, firstIn: null, firstOutAfterIn: null };
      t.last = ts;
      t.lastDir = dir;
      if (dir === "in" && t.firstIn == null) t.firstIn = ts;
      if (dir === "out" && t.firstIn != null && t.firstOutAfterIn == null) t.firstOutAfterIn = ts;
      threads.set(m.numero, t);
      const autor = (m.autor || "").toString().toLowerCase();
      if (dir === "out" && ts >= onlineSince && autor && !["ia", "automacao", "bot", "sistema", "system", "agente"].includes(autor)) {
        onlineAgents.add(m.autor);
      }
    }

    const last24 = Date.now() - 24 * 3600 * 1000;
    const last7d = Date.now() - 7 * 24 * 3600 * 1000;
    let convAguardando = 0, convEmAtendimento = 0, convFinalizados = 0;
    let esperaSum = 0, esperaN = 0, duracaoSum = 0, duracaoN = 0;
    for (const t of threads.values()) {
      // Só conta como "aguardando" se o contato falou por último nos últimos 7 dias.
      if (t.lastDir === "in" && t.last >= last7d) convAguardando++;
      else if (t.last >= last24) convEmAtendimento++;
      else convFinalizados++;

      if (t.firstIn != null && t.firstOutAfterIn != null && t.firstOutAfterIn >= t.firstIn) {
        esperaSum += t.firstOutAfterIn - t.firstIn; esperaN++;
      }
      if (t.last > t.first) { duracaoSum += t.last - t.first; duracaoN++; }
    }
    const tempoEsperaMin = esperaN ? Math.round(esperaSum / esperaN / 60000) : 0;
    const tempoAtendimentoMin = duracaoN ? Math.round(duracaoSum / duracaoN / 60000) : 0;




    // IA Metrics
    let aiQualifiedCount = 0;
    let aiHandoffCount = 0;
    const aiHandledNumbers = new Set<string>();

    for (const log of (aiLogs ?? []) as any[]) {
      if (log.acao === "ai_response") {
        const details = typeof log.detalhes === "string" ? JSON.parse(log.detalhes) : log.detalhes;
        if (details?.number) aiHandledNumbers.add(details.number);
        
        const response = (details?.response || "").toUpperCase();
        if (response.includes("[QUALIFICADO]")) aiQualifiedCount++;
        if (response.includes("[HANDOFF]")) aiHandoffCount++;
      }
    }

    return {
      ...empty,

      revenueWon,
      newLeads,
      conversionRate,
      pipelineValue,
      pendingFollowups,
      unreadMessages: convAguardando,
      
      aiHandledCount: aiHandledNumbers.size,
      aiQualifiedCount,
      aiHandoffCount,
      agentName: agentCfg?.nome_agente || null,
      agentTraits: agentCfg?.avatar_traits || null,
      agentAvatarUrl: agentCfg?.avatar_url || null,


      salesCount, avgTicket, lossCount,
      scheduledCount: scheduledCount ?? 0,
      unassignedLeads,
      csatAvg, csatCount, csatSent, csatResponseRate,
      csatPromoters, csatNeutrals, csatDetractors,
      convTotal: threads.size,
      convAguardando, convEmAtendimento, convFinalizados,
      atendentesOnline: onlineAgents.size,
      atendentesTotal: atendentesTotal ?? 0,
      tempoEsperaMin, tempoAtendimentoMin,

      revenueSeries,
      funnelStages,
      sourcesBreakdown,
      channelsBreakdown,
      leadsByChannel,
      salesByItem,

      ranking,
      leadsPerUser,
      generalGoalCents: (goalRows ?? []).reduce((sum: number, r: any) => sum + (Number(r.value_cents) || 0), 0),
      totalRevenueCents: Math.round(revenueWon * 100),
      lossValueCents: (lossEvents ?? []).reduce((sum: number, r: any) => {
        const m = r.descricao?.match(/R\$ ([0-9,.]+)/);
        if (m) {
          const val = Number(m[1].replace(/\./g, "").replace(",", "."));
          return sum + (val * 100);
        }
        return sum;
      }, 0),
    };
  });
