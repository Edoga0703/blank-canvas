import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ProspectoRow = {
  id: string;
  fonte: string;
  busca: string | null;
  nome: string;
  telefone: string | null;
  email: string | null;
  site: string | null;
  endereco: string | null;
  cidade: string | null;
  uf: string | null;
  categoria: string | null;
  cnpj: string | null;
  rating: number | null;
  avaliacoes: number | null;
  status: string;
  site_status: string | null;
  site_nota: number | null;
  site_diagnostico: string | null;
  site_oportunidades: string | null;
  site_verificado_em: string | null;
  card_id: string | null;
  lote_id: string | null;
  abordagem_texto: string | null;
  abordagem_foco: string | null;
  abordagem_analise: string | null;
  abordagem_em: string | null;
  disparo_em: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dados: any;
  created_at: string;
  /** true quando esse telefone já existe no CRM da empresa atual. */
  jaNoCrm?: boolean;
};


export type FunilOpcao = { id: string; nome: string; etapas: { id: string; nome: string }[] };

/**
 * Libera o Radar para super admin ou para empresas com o plugin de prospecção.
 * Retorna sempre a empresa atual — os prospectos são isolados por empresa.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function acesso(context: any): Promise<string> {
  const companyId = await empresaAtual(context);
  if (!companyId) throw new Error("Empresa atual não encontrada.");
  const { data: sup } = await context.supabase.rpc("is_super_admin");
  if (sup) return companyId;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { capacidadeAtiva } = await import("@/lib/plugin-gate.server");
  if (!(await capacidadeAtiva(supabaseAdmin, companyId, "prospeccao"))) {
    throw new Error("O módulo de Prospecção não está ativo para esta empresa.");
  }
  return companyId;
}

/** Lista os prospectos já rastreados. */
export const listarProspectos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (
      d:
        | { status?: string; busca?: string; site?: string; loteId?: string | null; contato?: string }
        | undefined,
    ) => d ?? {},
  )
  .handler(async ({ data, context }): Promise<ProspectoRow[]> => {
    const companyId = await acesso(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin
      .from("prospeccao_lead")
      .select("*")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(500);
    if (data.status && data.status !== "todos") q = q.eq("status", data.status);
    if (data.busca) q = q.ilike("nome", `%${data.busca}%`);
    if (data.loteId) q = q.eq("lote_id", data.loteId);
    if (data.contato === "nao_abordados") q = q.is("disparo_em", null);
    else if (data.contato === "abordados") q = q.not("disparo_em", "is", null);
    // Filtro para a Fábrica de Site: quem não tem site ou tem site ruim.
    if (data.site === "sem_site") q = q.is("site", null);
    else if (data.site === "oportunidade")
      q = q.in("site_status", ["sem_site", "offline", "problema", "desatualizado", "lento"]);
    else if (data.site === "ativo") q = q.eq("site_status", "ativo");
    else if (data.site === "nao_analisado") q = q.is("site_status", null);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const lista = (rows ?? []) as unknown as ProspectoRow[];

    // Marca quem já existe no CRM da empresa atual (evita prospectar lead/cliente atual).
    const numeros = lista.map((r) => r.telefone).filter(Boolean) as string[];
    if (companyId && numeros.length) {
      const { data: cards } = await supabaseAdmin
        .from("crm_cards")
        .select("numero")
        .eq("company_id", companyId)
        .in("numero", numeros);
      const set = new Set((cards ?? []).map((c) => c.numero));
      for (const r of lista) r.jaNoCrm = !!r.telefone && set.has(r.telefone);
    }
    return lista;
  });

/** Busca empresas no Google Maps e guarda os resultados novos. */
export const rastrearGoogle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { termo: string; limite?: number; local?: string; raioKm?: number }) => {
    const termo = String(d?.termo ?? "").trim();
    if (termo.length < 3) throw new Error("Digite o que você procura (ex.: clínicas em Fortaleza).");
    return {
      termo: termo.slice(0, 200),
      limite: Math.min(Math.max(Number(d?.limite ?? 20), 1), 50),
      local: String(d?.local ?? "").trim().slice(0, 200),
      raioKm: Math.min(Math.max(Number(d?.raioKm ?? 10), 1), 50),
    };
  })
  .handler(async ({ data, context }) => {
    const companyId = await acesso(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { buscarGoogle, geocodificar } = await import("@/lib/prospeccao.server");

    let centro: { lat: number; lng: number; raioKm: number } | null = null;
    if (data.local) {
      const p = await geocodificar(data.local);
      if (!p) throw new Error(`Não encontrei o local "${data.local}" no mapa.`);
      centro = { ...p, raioKm: data.raioKm };
    }

    const achados = (await buscarGoogle(data.termo, Math.ceil(data.limite / 20), centro)).slice(
      0,
      data.limite,
    );
    const loteId = crypto.randomUUID();
    const loteEm = new Date().toISOString();
    let novos = 0;
    let repetidos = 0;
    for (const e of achados) {
      const { data: existe } = await supabaseAdmin
        .from("prospeccao_lead")
        .select("id")
        .eq("company_id", companyId)
        .eq("place_id", e.place_id ?? "")
        .maybeSingle();
      if (existe) {
        repetidos++;
        continue;
      }
      const { error } = await supabaseAdmin.from("prospeccao_lead").insert({
        fonte: e.fonte,
        busca: data.termo,
        nome: e.nome,
        telefone: e.telefone,
        site: e.site,
        endereco: e.endereco,
        cidade: e.cidade,
        uf: e.uf,
        categoria: e.categoria,
        rating: e.rating,
        avaliacoes: e.avaliacoes,
        place_id: e.place_id,
        dados: e.dados as never,
        company_id: companyId,
        criado_por: context.userId,
        lote_id: loteId,
        lote_em: loteEm,
      } as never);
      if (!error) novos++;
    }
    return { encontrados: achados.length, novos, repetidos, loteId };
  });


/** Consulta CNPJs na base pública da Receita Federal. */
export const rastrearCnpj = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { lista: string }) => ({ lista: String(d?.lista ?? "") }))
  .handler(async ({ data, context }) => {
    const companyId = await acesso(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { consultarCnpj } = await import("@/lib/prospeccao.server");

    const cnpjs = data.lista
      .split(/[\s,;\n]+/)
      .map((c) => c.replace(/\D/g, ""))
      .filter((c) => c.length === 14)
      .slice(0, 30);
    if (!cnpjs.length) throw new Error("Nenhum CNPJ válido na lista.");

    const loteId = crypto.randomUUID();
    const loteEm = new Date().toISOString();
    let novos = 0;
    const erros: string[] = [];
    for (const c of cnpjs) {
      try {
        const e = await consultarCnpj(c);
        const { data: existe } = await supabaseAdmin
          .from("prospeccao_lead")
          .select("id")
          .eq("company_id", companyId)
          .eq("cnpj", c)
          .maybeSingle();
        if (existe) continue;
        await supabaseAdmin.from("prospeccao_lead").insert({
          fonte: "cnpj",
          busca: c,
          nome: e.nome,
          telefone: e.telefone,
          email: e.email ?? null,
          endereco: e.endereco,
          cidade: e.cidade,
          uf: e.uf,
          categoria: e.categoria,
          cnpj: c,
          dados: e.dados as never,
          company_id: companyId,
          criado_por: context.userId,
          lote_id: loteId,
          lote_em: loteEm,
        } as never);
        novos++;
      } catch (err) {
        erros.push((err as Error).message);
      }
    }
    return { consultados: cnpjs.length, novos, erros: erros.slice(0, 5), loteId };
  });


/** Empresa atual do usuário (destino da importação). */
async function empresaAtual(context: any): Promise<string | null> {
  const { data } = await context.supabase.rpc("current_company_id");
  return (data as string) ?? null;
}

/** Funis e etapas da empresa atual (destino da importação). */
export const opcoesImportacao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ workspace: string | null; funis: FunilOpcao[] }> => {
    const companyId = await acesso(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: comp }, { data: pipes }, { data: stages }] = await Promise.all([
      supabaseAdmin.from("company").select("nome").eq("id", companyId).maybeSingle(),
      supabaseAdmin.from("crm_pipeline").select("id, nome, ordem").eq("company_id", companyId).order("ordem"),
      supabaseAdmin
        .from("crm_stage")
        .select("id, nome, pipeline_id, ordem")
        .eq("company_id", companyId)
        .order("ordem"),
    ]);

    return {
      workspace: comp?.nome ?? null,
      funis: (pipes ?? []).map((p) => ({
        id: p.id,
        nome: p.nome,
        etapas: (stages ?? [])
          .filter((s) => s.pipeline_id === p.id)
          .map((s) => ({ id: s.id, nome: s.nome })),
      })),
    };
  });

/** Envia os prospectos selecionados para o CRM da empresa atual. */
export const importarProspectos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { ids: string[]; stageId?: string | null; disparar?: boolean }) => ({
    ids: Array.isArray(d?.ids) ? d.ids.slice(0, 300) : [],
    stageId: d?.stageId ?? null,
    disparar: !!d?.disparar,
  }))
  .handler(async ({ data, context }) => {
    const companyId = await acesso(context);
    if (!data.ids.length) throw new Error("Selecione pelo menos uma empresa.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { intakeLead, mergeCamposExtras } = await import("@/lib/lead-intake.server");

    const { data: rows } = await supabaseAdmin
      .from("prospeccao_lead")
      .select("*")
      .eq("company_id", companyId)
      .in("id", data.ids);

    let importados = 0;
    let semTelefone = 0;
    for (const r of (rows ?? []) as any[]) {
      if (!r.telefone) {
        semTelefone++;
        continue;
      }
      try {
        const { cardId } = await intakeLead(supabaseAdmin, {
          companyId,
          numeroRaw: r.telefone,
          nome: r.nome,
          email: r.email,
          mensagem: `Prospecção: ${r.busca ?? r.fonte}`,
          canal: "prospeccao",
          origem: r.fonte === "google" ? "Google Maps" : "Receita Federal",
          stageId: data.stageId,
          tags: ["prospeccao"],
          pausarRegua: !data.disparar,
        });
        const extras = [
          { label: "Fonte", valor: r.fonte === "google" ? "Google Maps" : "Receita Federal" },
          { label: "Endereço", valor: r.endereco ?? "" },
          { label: "Cidade/UF", valor: [r.cidade, r.uf].filter(Boolean).join(" / ") },
          { label: "Segmento", valor: r.categoria ?? "" },
          { label: "Site", valor: r.site ?? "" },
          { label: "Situação do site", valor: r.site_status ?? "" },
          { label: "Diagnóstico do site", valor: r.site_diagnostico ?? "" },
          { label: "Oportunidade de site", valor: r.site_oportunidades ?? "" },
          { label: "CNPJ", valor: r.cnpj ?? "" },
          {
            label: "Avaliação Google",
            valor: r.rating ? `${r.rating} (${r.avaliacoes ?? 0} avaliações)` : "",
          },
        ].filter((e) => e.valor);
        await mergeCamposExtras(supabaseAdmin, cardId, extras);
        await supabaseAdmin
          .from("prospeccao_lead")
          .update({ status: "importado", card_id: cardId } as never)
          .eq("id", r.id);
        importados++;
      } catch (e) {
        console.warn("[prospeccao.import]", (e as Error).message);
      }
    }
    return { importados, semTelefone };
  });

/** Descarta ou apaga prospectos. */
export const atualizarProspectos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { ids: string[]; acao: "descartar" | "reabrir" | "apagar" }) => ({
    ids: Array.isArray(d?.ids) ? d.ids.slice(0, 500) : [],
    acao: d?.acao ?? "descartar",
  }))
  .handler(async ({ data, context }) => {
    const companyId = await acesso(context);
    if (!data.ids.length) return { ok: true };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.acao === "apagar") {
      await supabaseAdmin
        .from("prospeccao_lead")
        .delete()
        .eq("company_id", companyId)
        .in("id", data.ids);
    } else {
      await supabaseAdmin
        .from("prospeccao_lead")
        .update({ status: data.acao === "descartar" ? "descartado" : "novo" } as never)
        .eq("company_id", companyId)
        .in("id", data.ids);
    }
    return { ok: true };
  });

/** Analisa o site das empresas selecionadas (ativo, lento, com problema, antigo ou sem site). */
export const analisarSitesProspectos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { ids: string[] }) => ({
    ids: Array.isArray(d?.ids) ? d.ids.slice(0, 25) : [],
  }))
  .handler(async ({ data, context }) => {
    const companyId = await acesso(context);
    if (!data.ids.length) throw new Error("Selecione pelo menos uma empresa.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { analisarSite } = await import("@/lib/prospeccao.server");

    const { data: rows } = await supabaseAdmin
      .from("prospeccao_lead")
      .select("id, nome, site")
      .eq("company_id", companyId)
      .in("id", data.ids);

    let analisados = 0;
    let oportunidades = 0;
    for (const r of (rows ?? []) as { id: string; nome: string; site: string | null }[]) {
      try {
        const a = await analisarSite(r.site, r.nome);
        await supabaseAdmin
          .from("prospeccao_lead")
          .update({
            site_status: a.status,
            site_nota: a.nota,
            site_diagnostico: a.diagnostico,
            site_oportunidades: a.oportunidades,
            site_verificado_em: new Date().toISOString(),
            site_dados: a.dados as never,
          } as never)
          .eq("id", r.id);
        analisados++;
        if (a.status !== "ativo") oportunidades++;
      } catch (e) {
        console.warn("[prospeccao.site]", (e as Error).message);
      }
    }
    return { analisados, oportunidades };
  });

export const FOCOS_ABORDAGEM = [
  { valor: "site", rotulo: "Criação/reformulação de site" },
  { valor: "trafego", rotulo: "Tráfego pago e anúncios" },
  { valor: "social", rotulo: "Gestão de redes sociais" },
  { valor: "google", rotulo: "Perfil do Google e avaliações" },
  { valor: "atendimento", rotulo: "Atendimento e CRM no WhatsApp" },
  { valor: "geral", rotulo: "Diagnóstico geral (a IA escolhe)" },
] as const;

/** Lotes de busca (cada clique em Buscar vira um lote). */
export const listarLotes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const companyId = await acesso(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await (supabaseAdmin as any)
      .from("prospeccao_lead")
      .select("lote_id, lote_em, busca")
      .eq("company_id", companyId)
      .not("lote_id", "is", null)
      .order("lote_em", { ascending: false })
      .limit(400);
    const mapa = new Map<string, { id: string; busca: string; em: string; total: number }>();
    for (const r of (data ?? []) as any[]) {
      const at = mapa.get(r.lote_id);
      if (at) at.total++;
      else mapa.set(r.lote_id, { id: r.lote_id, busca: r.busca ?? "busca", em: r.lote_em, total: 1 });
    }
    return [...mapa.values()].slice(0, 20);
  });

/** Analisa a empresa (site, redes, Google) e escreve uma abordagem individual. */
export const gerarAbordagem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; foco?: string; observacao?: string }) => ({
    id: String(d?.id ?? ""),
    foco: String(d?.foco ?? "geral"),
    observacao: String(d?.observacao ?? "").slice(0, 4000),
  }))
  .handler(async ({ data, context }) => {
    const companyId = await acesso(context);
    if (!data.id) throw new Error("Empresa inválida.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { coletarPerfilOnline } = await import("@/lib/prospeccao.server");
    const { lovableAiChat } = await import("@/lib/lovable-ai.server");

    const { data: r } = await (supabaseAdmin as any)
      .from("prospeccao_lead")
      .select("*")
      .eq("company_id", companyId)
      .eq("id", data.id)
      .maybeSingle();
    if (!r) throw new Error("Empresa não encontrada.");

    const { data: emp } = await (supabaseAdmin as any)
      .from("company")
      .select("nome")
      .eq("id", companyId)
      .maybeSingle();

    const perfil = await coletarPerfilOnline(r.site);
    const foco =
      FOCOS_ABORDAGEM.find((f) => f.valor === data.foco)?.rotulo ?? "Diagnóstico geral";

    const contexto = {
      empresa: r.nome,
      segmento: r.categoria,
      cidade: [r.cidade, r.uf].filter(Boolean).join("/"),
      telefone: r.telefone,
      site: r.site,
      nota_google: r.rating,
      avaliacoes_google: r.avaliacoes,
      situacao_site: r.site_status,
      diagnostico_site: r.site_diagnostico,
      oportunidade_site: r.site_oportunidades,
      site_online: perfil.alcancavel,
      titulo_site: perfil.titulo,
      descricao_site: perfil.descricao,
      redes_sociais: perfil.redes,
      texto_site: perfil.trecho.slice(0, 1800),
    };

    const sistema = `Você é um especialista sênior em prospecção comercial B2B no Brasil (SDR/closer), com domínio de vendas consultivas, SPIN Selling, gatilhos de curiosidade e copywriting para WhatsApp.
Sua missão: gerar a primeira mensagem de prospecção fria que MAIS provavelmente receba resposta.

Hierarquia de prioridade (obrigatória):
1. INSTRUÇÕES DO VENDEDOR — são ordens. Se ele pedir tom, oferta, gancho, menção, tamanho, estilo ou qualquer detalhe, siga à risca, mesmo que contrarie o resto. Use todas as informações que ele passou.
2. FOCO DA ABORDAGEM escolhido.
3. Dados reais coletados da empresa (Google, site, redes).

Como pensar antes de escrever:
- Identifique a dor mais provável e cara para esse segmento (perda de clientes, pouca visibilidade, atendimento lento, concorrência etc.).
- Escolha 1 ou 2 evidências concretas dos dados (ex.: nota/avaliações no Google, site ausente/lento/desatualizado, sem Instagram, última postagem antiga) para mostrar que você realmente olhou o negócio.
- Transforme a evidência em impacto de negócio (dinheiro/clientes perdidos), sem soar acusatório.
- Termine com CTA leve e de baixo atrito (pergunta de sim/não ou convite curto), nunca pedindo reunião longa logo de cara.

Estilo da mensagem: humana, direta, personalizada com o nome da empresa, parece escrita à mão por uma pessoa (não robótica, sem "Prezado"). Máximo 6 linhas curtas, no máximo 1 emoji, sem links, sem listas.
Nunca invente preços, prazos, promoções, números ou fatos que não estejam nos dados ou nas instruções do vendedor.`;

    const prompt = `EMPRESA QUE ESTÁ PROSPECTANDO (nós): ${emp?.nome ?? "nossa agência"}
FOCO DA ABORDAGEM: ${foco}

INSTRUÇÕES DO VENDEDOR (prioridade máxima):
${data.observacao ? data.observacao : "(nenhuma — use sua expertise com base nos dados)"}

DADOS REAIS DO PROSPECTO:
${JSON.stringify(contexto, null, 1)}

Responda SOMENTE um JSON válido:
{"analise":"até 700 caracteres em PT-BR: principais gargalos, oportunidades e o ângulo comercial escolhido (e como aplicou as instruções do vendedor, se houver)","mensagem":"a mensagem de WhatsApp pronta para enviar"}`;

    const resp = await lovableAiChat(
      [
        { role: "system", content: sistema },
        { role: "user", content: prompt },
      ],
      "google/gemini-3.8-flash",
    );
    const json = JSON.parse(resp.replace(/```json|```/g, "").match(/\{[\s\S]*\}/)?.[0] ?? "{}");
    const analise = String(json.analise ?? "").slice(0, 1200);
    const mensagem = String(json.mensagem ?? "").slice(0, 1200);
    if (!mensagem) throw new Error("A IA não conseguiu gerar a mensagem. Tente novamente.");

    await (supabaseAdmin as any)
      .from("prospeccao_lead")
      .update({
        abordagem_texto: mensagem,
        abordagem_analise: analise,
        abordagem_foco: data.foco,
        abordagem_em: new Date().toISOString(),
      })
      .eq("id", r.id);

    return { analise, mensagem, redes: perfil.redes };
  });

/** Salva o texto da abordagem editado à mão. */
export const salvarAbordagem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; texto: string }) => ({
    id: String(d?.id ?? ""),
    texto: String(d?.texto ?? "").slice(0, 1500),
  }))
  .handler(async ({ data, context }) => {
    const companyId = await acesso(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await (supabaseAdmin as any)
      .from("prospeccao_lead")
      .update({ abordagem_texto: data.texto })
      .eq("company_id", companyId)
      .eq("id", data.id);
    return { ok: true };
  });

/** Marca que a empresa já recebeu o disparo. */
export const registrarDisparo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { ids: string[] }) => ({
    ids: Array.isArray(d?.ids) ? d.ids.slice(0, 200) : [],
  }))
  .handler(async ({ data, context }) => {
    const companyId = await acesso(context);
    if (!data.ids.length) return { ok: true };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await (supabaseAdmin as any)
      .from("prospeccao_lead")
      .update({ disparo_em: new Date().toISOString(), disparo_por: context.userId })
      .eq("company_id", companyId)
      .in("id", data.ids);
    return { ok: true };
  });
