import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveCompanyIdCached } from "./company-cache";

export type AtendimentoSituacao = "resolvido" | "pendente";
export type AtendimentoSugestao = {
  solicitacao: string;
  resolucao: string;
  situacao: AtendimentoSituacao;
};

async function operationalContext(supabase: any, userId: string) {
  const companyId = await resolveCompanyIdCached(supabase, userId);
  const [{ data: company }, { data: membership }] = await Promise.all([
    supabase.from("company").select("atendimento_operacional").eq("id", companyId).maybeSingle(),
    supabase.from("company_user").select("role").eq("company_id", companyId).eq("user_id", userId).maybeSingle(),
  ]);
  if (!company?.atendimento_operacional) throw new Error("Recurso indisponível para esta empresa.");
  return { companyId, role: String(membership?.role ?? "atendente") };
}

export const sugerirRelatorioAtendimento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { numero: string }) => d)
  .handler(async ({ context, data }): Promise<AtendimentoSugestao> => {
    const numero = String(data.numero ?? "").trim();
    if (!numero) throw new Error("Conversa inválida.");
    const { companyId } = await operationalContext(context.supabase, context.userId);
    const { data: mensagens } = await context.supabase
      .from("mensagens")
      .select("texto,direcao,autor,created_at")
      .eq("company_id", companyId)
      .eq("numero", numero)
      .order("created_at", { ascending: false })
      .limit(120);
    if (!mensagens?.length) return { solicitacao: "", resolucao: "", situacao: "pendente" };
    const historico = mensagens.slice().reverse().map((m: any) =>
      `${m.direcao === "entrada" ? "Cliente" : m.autor === "ia" ? "IA" : "Atendente"}: ${String(m.texto ?? "[mídia]").trim()}`,
    ).join("\n").slice(-14000);
    const { lovableAiChat } = await import("./lovable-ai.server");
    const resposta = await lovableAiChat([
      { role: "system", content: "Analise o atendimento sem inventar fatos. Retorne somente JSON válido com solicitacao, resolucao e situacao ('resolvido' ou 'pendente'). Se algo não estiver claro, deixe o texto vazio ou marque pendente." },
      { role: "user", content: historico },
    ], "gpt-4o-mini");
    try {
      const clean = resposta.replace(/^```json\s*|\s*```$/g, "").trim();
      const parsed = JSON.parse(clean);
      return {
        solicitacao: String(parsed.solicitacao ?? "").slice(0, 2000),
        resolucao: String(parsed.resolucao ?? "").slice(0, 2000),
        situacao: parsed.situacao === "resolvido" ? "resolvido" : "pendente",
      };
    } catch {
      return { solicitacao: "", resolucao: "", situacao: "pendente" };
    }
  });

export const salvarRelatorioAtendimento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    numero: string; contatoNome?: string | null; solicitacao: string; resolucao: string;
    situacao: AtendimentoSituacao; pendenteCom?: string | null; aiSugerido?: boolean;
  }) => d)
  .handler(async ({ context, data }) => {
    const { companyId } = await operationalContext(context.supabase, context.userId);
    const { data: card } = await context.supabase.from("crm_cards")
      .select("id,owner_id,department_id,primeiro_contato_em")
      .eq("company_id", companyId).eq("numero", data.numero).maybeSingle();
    const { error } = await context.supabase.from("atendimento_relatorio").insert({
      company_id: companyId,
      card_id: card?.id ?? null,
      numero: data.numero,
      contato_nome: data.contatoNome ?? null,
      solicitacao: data.solicitacao.trim(),
      resolucao: data.resolucao.trim(),
      situacao: data.situacao,
      resolvido_por: data.situacao === "resolvido" ? context.userId : null,
      pendente_com: data.situacao === "pendente" ? (data.pendenteCom ?? card?.owner_id ?? context.userId) : null,
      setor_id: card?.department_id ?? null,
      atendente_id: card?.owner_id ?? context.userId,
      criado_por: context.userId,
      iniciado_em: card?.primeiro_contato_em ?? null,
      ai_sugerido: data.aiSugerido === true,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listarRelatoriosAtendimento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { de: string; ate: string; atendenteId?: string | null; situacao?: string | null }) => d)
  .handler(async ({ context, data }) => {
    const { companyId, role } = await operationalContext(context.supabase, context.userId);
    if (role !== "owner" && role !== "admin") throw new Error("Acesso restrito à gestão.");
    let q = context.supabase.from("atendimento_relatorio").select("*")
      .eq("company_id", companyId)
      .gte("finalizado_em", `${data.de}T00:00:00.000Z`)
      .lte("finalizado_em", `${data.ate}T23:59:59.999Z`)
      .order("finalizado_em", { ascending: false });
    if (data.atendenteId) q = q.eq("atendente_id", data.atendenteId);
    if (data.situacao) q = q.eq("situacao", data.situacao);
    const [{ data: rows, error }, { data: members }, { data: departments }] = await Promise.all([
      q,
      context.supabase.from("company_user").select("user_id").eq("company_id", companyId).eq("ativo", true),
      context.supabase.from("department").select("id,nome").eq("company_id", companyId),
    ]);
    if (error) throw new Error(error.message);
    const ids = (members ?? []).map((m: any) => m.user_id).filter(Boolean);
    const { data: perfis } = ids.length
      ? await context.supabase.from("profiles").select("user_id,nome,email").in("user_id", ids)
      : { data: [] as any[] };
    const perfilMap = new Map((perfis ?? []).map((p: any) => [p.user_id, p.nome || p.email || "Usuário"]));
    const people = ids.map((id: string) => ({ id, nome: perfilMap.get(id) ?? "Usuário" }));
    const names = new Map(people.map((p: any) => [p.id, p.nome]));
    const sectors = new Map((departments ?? []).map((d: any) => [d.id, d.nome]));
    return {
      atendentes: people,
      rows: (rows ?? []).map((r: any) => ({
        ...r,
        atendente_nome: names.get(r.atendente_id) ?? "—",
        resolvido_por_nome: names.get(r.resolvido_por) ?? "—",
        pendente_com_nome: names.get(r.pendente_com) ?? "—",
        setor_nome: sectors.get(r.setor_id) ?? "—",
      })),
    };
  });

// ---------------- Panorama em tempo real ----------------

export type PanoramaRow = {
  numero: string; cliente: string; solicitacao: string; andamento: string;
  situacao: "resolvido" | "pendente" | "em_atendimento" | "aguardando";
  atendente_nome: string; responsavel_nome: string; setor_nome: string;
  ultima_em: string | null; ultima_direcao: string | null; origem: "relatorio" | "ia" | "—";
  finalizado_em: string | null;
};

export const panoramaAtendimentos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { de: string; ate: string; atendenteId?: string | null; situacao?: string | null }) => d)
  .handler(async ({ context, data }) => {
    const { companyId, role } = await operationalContext(context.supabase, context.userId);
    if (role !== "owner" && role !== "admin") throw new Error("Acesso restrito à gestão.");
    const inicio = `${data.de}T00:00:00.000Z`;
    const fim = `${data.ate}T23:59:59.999Z`;

    const [{ data: cards }, { data: relatorios }, { data: analises }, { data: members }, { data: departments }] = await Promise.all([
      context.supabase.from("crm_cards")
        .select("id,numero,nome,owner_id,department_id,status,ultima_em,ultima_direcao,ultima_mensagem,primeiro_contato_em")
        .eq("company_id", companyId).gte("ultima_em", inicio).lte("ultima_em", fim)
        .order("ultima_em", { ascending: false }).limit(2000),
      context.supabase.from("atendimento_relatorio").select("*").eq("company_id", companyId)
        .gte("finalizado_em", inicio).lte("finalizado_em", fim).order("finalizado_em", { ascending: false }),
      context.supabase.from("atendimento_live_analise").select("*").eq("company_id", companyId),
      context.supabase.from("company_user").select("user_id").eq("company_id", companyId).eq("ativo", true),
      context.supabase.from("department").select("id,nome").eq("company_id", companyId),
    ]);

    const ids = (members ?? []).map((m: any) => m.user_id).filter(Boolean);
    const { data: perfis } = ids.length
      ? await context.supabase.from("profiles").select("user_id,nome,email").in("user_id", ids)
      : { data: [] as any[] };
    const names = new Map((perfis ?? []).map((p: any) => [p.user_id, p.nome || p.email || "Usuário"]));
    const people = ids.map((id: string) => ({ id, nome: names.get(id) ?? "Usuário" }));
    const sectors = new Map((departments ?? []).map((d: any) => [d.id, d.nome]));
    const relPorNumero = new Map<string, any>();
    for (const r of relatorios ?? []) if (!relPorNumero.has(r.numero)) relPorNumero.set(r.numero, r);
    const aiPorNumero = new Map<string, any>((analises ?? []).map((a: any) => [a.numero, a]));

    let rows: PanoramaRow[] = (cards ?? []).map((c: any) => {
      const rel = relPorNumero.get(c.numero);
      const ia = aiPorNumero.get(c.numero);
      const situacao: PanoramaRow["situacao"] = rel
        ? (rel.situacao === "resolvido" ? "resolvido" : "pendente")
        : (c.owner_id ? "em_atendimento" : "aguardando");
      return {
        numero: c.numero,
        cliente: c.nome || c.numero,
        solicitacao: rel?.solicitacao || ia?.solicitacao || "",
        andamento: rel?.resolucao || ia?.andamento || String(c.ultima_mensagem ?? ""),
        situacao,
        atendente_nome: c.owner_id ? (names.get(c.owner_id) ?? "—") : "—",
        responsavel_nome: rel
          ? (names.get(rel.situacao === "resolvido" ? rel.resolvido_por : rel.pendente_com) ?? "—")
          : (c.owner_id ? (names.get(c.owner_id) ?? "—") : "Sem responsável"),
        setor_nome: sectors.get(c.department_id) ?? "—",
        ultima_em: c.ultima_em ?? null,
        ultima_direcao: c.ultima_direcao ?? null,
        origem: rel ? "relatorio" : ia ? "ia" : "—",
        finalizado_em: rel?.finalizado_em ?? null,
      };
    });

    if (data.atendenteId) {
      const alvo = names.get(data.atendenteId);
      rows = rows.filter((r) => r.atendente_nome === alvo);
    }
    if (data.situacao) rows = rows.filter((r) => r.situacao === data.situacao);

    return {
      atendentes: people,
      rows,
      resumo: {
        total: rows.length,
        resolvidos: rows.filter((r) => r.situacao === "resolvido").length,
        pendentes: rows.filter((r) => r.situacao === "pendente").length,
        emAtendimento: rows.filter((r) => r.situacao === "em_atendimento").length,
        aguardando: rows.filter((r) => r.situacao === "aguardando").length,
      },
    };
  });

export const analisarAtendimentosAtivos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { de?: string; ate?: string; offset?: number; limite?: number; somentePendentes?: boolean }) => d ?? {})
  .handler(async ({ context, data }) => {
    const { companyId, role } = await operationalContext(context.supabase, context.userId);
    if (role !== "owner" && role !== "admin") throw new Error("Acesso restrito à gestão.");
    const limite = Math.min(Math.max(Number(data?.limite ?? 10), 1), 20);
    const offset = Math.max(Number(data?.offset ?? 0), 0);
    const inicio = data.de ? `${data.de}T00:00:00.000Z` : null;
    const fim = data.ate ? `${data.ate}T23:59:59.999Z` : null;

    let cardsQuery = context.supabase.from("crm_cards")
      .select("numero,nome,ultima_em", { count: "exact" }).eq("company_id", companyId)
      .not("ultima_em", "is", null).order("ultima_em", { ascending: false });
    if (inicio) cardsQuery = cardsQuery.gte("ultima_em", inicio);
    if (fim) cardsQuery = cardsQuery.lte("ultima_em", fim);
    const [{ data: cards, count }, { data: analises }] = await Promise.all([
      cardsQuery.range(offset, offset + limite - 1),
      context.supabase.from("atendimento_live_analise").select("numero,ultima_em_analisada").eq("company_id", companyId),
    ]);
    const analisado = new Map((analises ?? []).map((a: any) => [a.numero, a.ultima_em_analisada]));
    const selecionados = data.somentePendentes === false ? (cards ?? []) : (cards ?? []).filter((c: any) => {
      const prev = analisado.get(c.numero);
      return !prev || new Date(c.ultima_em) > new Date(prev);
    });
    const { analyzeOperationalCards } = await import("./atendimento-live-analysis.server");
    const result = await analyzeOperationalCards(context.supabase, companyId, selecionados);
    return { ...result, total: count ?? 0, proximoOffset: offset + (cards?.length ?? 0) };
  });

export const listarContatosEnvioRelatorio = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { companyId, role } = await operationalContext(context.supabase, context.userId);
    if (role !== "owner" && role !== "admin") throw new Error("Acesso restrito à gestão.");
    const { data, error } = await context.supabase.from("crm_cards")
      .select("id,numero,nome")
      .eq("company_id", companyId)
      .not("numero", "like", "%@g.us%")
      .order("nome", { ascending: true })
      .limit(2000);
    if (error) throw new Error(error.message);
    return (data ?? []).map((card: any) => ({ id: card.id, numero: card.numero, nome: card.nome }));
  });
