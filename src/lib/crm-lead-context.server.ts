// src/lib/crm-lead-context.server.ts
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export interface ComprehensiveLeadData {
  card: any;
  ownerName: string | null;
  ownerEmail: string | null;
  produtos: Array<{
    id: string;
    nome: string;
    preco: number;
    categoria: string | null;
    sku: string | null;
    agendavel: boolean;
    duracao_min: number | null;
    tipo?: string;
  }>;
  servicos: Array<{
    id: string;
    nome: string;
    valor_cents: number;
    duracao_min: number;
  }>;
  matchedItem: {
    nome: string;
    preco: number | null;
    tipo: string;
    agendavel?: boolean;
  } | null;
  notas: Array<{
    id: string;
    texto: string;
    created_at: string;
  }>;
  agendamentos: Array<{
    id: string;
    titulo: string;
    inicio: string;
    fim: string;
    status: string;
  }>;
  stageHistory: Array<{
    stage_from_nome: string | null;
    stage_to_nome: string | null;
    tempo_na_etapa_seg: number | null;
    created_at: string;
  }>;
  diasNaEtapaAtual: number | null;
  contactPause: {
    pausado: boolean;
    pausado_em: string | null;
    pausado_por: string | null;
  } | null;
  vendasPrevias: Array<{
    id: string;
    item_nome: string | null;
    valor_cents: number;
    vendido_em: string;
    metodo_pagamento: string | null;
    olist_situacao: string | null;
  }>;
  totalVendidoAnteriorCents: number;
  formSubmissions: Array<{
    dados: Record<string, any>;
    tracking: Record<string, any>;
    created_at: string;
  }>;
  csat: {
    score: number | null;
    comentario: string | null;
    respondido_em: string | null;
  } | null;
  prospeccao: {
    razao_social: string | null;
    cnpj: string | null;
    categoria: string | null;
    cidade: string | null;
    avaliacoes: number | null;
  } | null;
  campanha: {
    nome: string | null;
    status: string | null;
    sent_at: string | null;
  } | null;
  agentRules: {
    como_vender: string | null;
    diferenciais: string | null;
    cupom: string | null;
    formas_pagamento: string | null;
    faq: string | null;
    descricao_negocio: string | null;
  } | null;
}

/**
 * Consulta en paralelo y de forma resiliente (con allSettled) todas las fuentes
 * de datos del sistema para entregarle a la IA una visión comercial completa 360°.
 */
export async function gatherLeadComprehensiveContext(
  supabase: any,
  companyId: string,
  cardOrId: any,
): Promise<ComprehensiveLeadData | null> {
  const client = supabase || supabaseAdmin;
  let card = typeof cardOrId === "object" && cardOrId !== null ? cardOrId : null;

  if (!card || !card.company_id || !card.tags) {
    const cardId = typeof cardOrId === "string" ? cardOrId : card?.id;
    if (!cardId) return null;
    const { data: dbCard } = await client
      .from("crm_cards")
      .select("id, company_id, pipeline_id, stage_id, owner_id, numero, nome, valor, campos_extras, canal_chat, tags, observacao, origem, canal_entrada, stage_entrou_em, email, empresa, cpf_cnpj, item_id, item_nome, item_tipo, proxima_acao, status, primeiro_contato_em, perdido_em, reativado_em, entrou_stage_em, ultimo_analise_ia_em")
      .eq("id", cardId)
      .eq("company_id", companyId)
      .maybeSingle();
    card = dbCard || card;
  }

  if (!card) return null;

  const [
    prodsRes,
    servsRes,
    notasRes,
    agendamentosRes,
    histRes,
    pauseRes,
    vendasRes,
    formsRes,
    csatRes,
    prospRes,
    campRes,
    ownerRes,
    rulesRes,
  ] = await Promise.allSettled([
    // 1. Catálogo: Productos
    client
      .from("produto")
      .select("id, nome, preco, categoria, sku, agendavel, duracao_min, tipo")
      .eq("company_id", companyId)
      .eq("ativo", true)
      .order("ordem", { ascending: true })
      .limit(30),

    // 2. Catálogo: Servicios
    client
      .from("servico")
      .select("id, nome, valor_cents, duracao_min")
      .eq("company_id", companyId)
      .eq("ativo", true)
      .limit(20),

    // 3. Notas internas del equipo de ventas
    client
      .from("lead_nota")
      .select("id, texto, created_at, autor_id")
      .eq("company_id", companyId)
      .eq("card_id", card.id)
      .order("created_at", { ascending: false })
      .limit(5),

    // 4. Agenda y citas (Google Meet / Calendario)
    client
      .from("agendamento")
      .select("id, titulo, inicio, fim, status")
      .eq("company_id", companyId)
      .eq("card_id", card.id)
      .order("inicio", { ascending: false })
      .limit(5),

    // 5. Historial de etapas del CRM
    client
      .from("crm_card_stage_history")
      .select("stage_from_nome, stage_to_nome, tempo_na_etapa_seg, created_at")
      .eq("company_id", companyId)
      .eq("card_id", card.id)
      .order("created_at", { ascending: false })
      .limit(5),

    // 6. Pausa de atención humana
    card.numero
      ? client
          .from("contact_pause")
          .select("pausado, pausado_em, pausado_por")
          .eq("company_id", companyId)
          .eq("numero", card.numero)
          .maybeSingle()
      : Promise.resolve({ data: null }),

    // 7. Ventas previas del contacto
    card.numero
      ? client
          .from("crm_venda")
          .select("id, item_nome, valor_cents, vendido_em, metodo_pagamento, olist_situacao")
          .eq("company_id", companyId)
          .eq("contato_numero", card.numero)
          .order("vendido_em", { ascending: false })
          .limit(5)
      : Promise.resolve({ data: [] }),

    // 8. Formularios web completados
    client
      .from("lead_form_submission")
      .select("dados, tracking, created_at")
      .eq("company_id", companyId)
      .eq("crm_card_id", card.id)
      .order("created_at", { ascending: false })
      .limit(3),

    // 9. Encuesta CSAT del cliente
    card.numero
      ? client
          .from("csat_response")
          .select("score, comentario, respondido_em")
          .eq("company_id", companyId)
          .eq("numero", card.numero)
          .order("created_at", { ascending: false })
          .limit(2)
      : Promise.resolve({ data: [] }),

    // 10. Prospección B2B vinculada
    client
      .from("prospeccao_lead")
      .select("nome, cnpj, categoria, cidade, avaliacoes")
      .eq("company_id", companyId)
      .eq("card_id", card.id)
      .maybeSingle(),

    // 11. Campañas de marketing dirigidas
    card.numero
      ? client
          .from("campaign_target")
          .select("campaign_id, status, enviado_em")
          .eq("company_id", companyId)
          .eq("contato_numero", card.numero)
          .order("enviado_em", { ascending: false })
          .limit(1)
      : Promise.resolve({ data: [] }),

    // 12. Asesor asignado
    card.owner_id
      ? client
          .from("profiles")
          .select("nome, email")
          .eq("id", card.owner_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),

    // 13. Reglas comerciales y políticas
    client
      .from("agent_config")
      .select("como_vender, diferenciais, cupom, formas_pagamento, faq, descricao_negocio")
      .eq("company_id", companyId)
      .order("is_default", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const produtos = prodsRes.status === "fulfilled" && prodsRes.value?.data ? prodsRes.value.data : [];
  const servicos = servsRes.status === "fulfilled" && servsRes.value?.data ? servsRes.value.data : [];
  const notas = notasRes.status === "fulfilled" && notasRes.value?.data ? notasRes.value.data : [];
  const agendamentos = agendamentosRes.status === "fulfilled" && agendamentosRes.value?.data ? agendamentosRes.value.data : [];
  const stageHistory = histRes.status === "fulfilled" && histRes.value?.data ? histRes.value.data : [];
  const contactPause = pauseRes.status === "fulfilled" && pauseRes.value?.data ? pauseRes.value.data : null;
  const vendasPrevias = vendasRes.status === "fulfilled" && vendasRes.value?.data ? vendasRes.value.data : [];
  const formSubmissions = formsRes.status === "fulfilled" && formsRes.value?.data ? formsRes.value.data : [];
  const csatList = csatRes.status === "fulfilled" && csatRes.value?.data ? csatRes.value.data : [];
  const prospeccao = prospRes.status === "fulfilled" && prospRes.value?.data ? prospRes.value.data : null;
  const campaignTargets = campRes.status === "fulfilled" && campRes.value?.data ? campRes.value.data : [];
  const ownerProfile = ownerRes.status === "fulfilled" && ownerRes.value?.data ? ownerRes.value.data : null;
  const agentRules = rulesRes.status === "fulfilled" && rulesRes.value?.data ? rulesRes.value.data : null;

  // Buscar coincidencia en catálogo
  let matchedItem: ComprehensiveLeadData["matchedItem"] = null;
  if (card.item_id || card.item_nome) {
    const foundProd = produtos.find((p: any) => p.id === card.item_id || (card.item_nome && p.nome?.toLowerCase() === String(card.item_nome).toLowerCase()));
    if (foundProd) {
      matchedItem = {
        nome: foundProd.nome,
        preco: Number(foundProd.preco) || null,
        tipo: "produto",
        agendavel: Boolean(foundProd.agendavel),
      };
    } else {
      const foundServ = servicos.find((s: any) => s.id === card.item_id || (card.item_nome && s.nome?.toLowerCase() === String(card.item_nome).toLowerCase()));
      if (foundServ) {
        matchedItem = {
          nome: foundServ.nome,
          preco: foundServ.valor_cents ? foundServ.valor_cents / 100 : null,
          tipo: "servico",
        };
      }
    }
  }

  // Calcular tiempo en la etapa actual
  let diasNaEtapaAtual: number | null = null;
  const stageEntry = (card as any).stage_entrou_em || (card as any).entrou_stage_em;
  if (stageEntry) {
    const ms = Date.now() - new Date(stageEntry).getTime();
    if (ms > 0) diasNaEtapaAtual = Math.floor(ms / (1000 * 60 * 60 * 24));
  }

  // Calcular total vendido histórico
  const totalVendidoAnteriorCents = (vendasPrevias || []).reduce((acc: number, v: any) => acc + (Number(v.valor_cents) || 0), 0);

  // Campaña
  let campanhaInfo: ComprehensiveLeadData["campanha"] = null;
  if (campaignTargets.length > 0 && campaignTargets[0].campaign_id) {
    try {
      const { data: cData } = await client
        .from("campaign")
        .select("nome")
        .eq("id", campaignTargets[0].campaign_id)
        .maybeSingle();
      campanhaInfo = {
        nome: cData?.nome || "Campaña de WhatsApp",
        status: campaignTargets[0].status,
        sent_at: campaignTargets[0].enviado_em || campaignTargets[0].sent_at || null,
      };
    } catch {
      campanhaInfo = {
        nome: "Campaña de WhatsApp",
        status: campaignTargets[0].status,
        sent_at: campaignTargets[0].enviado_em || campaignTargets[0].sent_at || null,
      };
    }
  }

  return {
    card,
    ownerName: ownerProfile?.nome || null,
    ownerEmail: ownerProfile?.email || null,
    produtos,
    servicos,
    matchedItem,
    notas,
    agendamentos,
    stageHistory,
    diasNaEtapaAtual,
    contactPause,
    vendasPrevias,
    totalVendidoAnteriorCents,
    formSubmissions,
    csat: csatList.length > 0 ? csatList[0] : null,
    prospeccao,
    campanha: campanhaInfo,
    agentRules,
  };
}

/**
 * Formatea los datos comerciales de forma compacta y ejecutiva para inyectarlos en el Prompt de la IA.
 */
export function formatComprehensiveContextForPrompt(
  ctx: ComprehensiveLeadData,
  locale: string = "es-ES",
): string {
  const { card } = ctx;
  const parts: string[] = [];

  // 1. Ficha del Lead
  const tagsStr = Array.isArray(card.tags) && card.tags.length > 0 ? card.tags.join(", ") : "Ninguna";
  const pauseAlert = ctx.contactPause?.pausado
    ? `⚠️ PAUSADO PARA ATENCIÓN HUMANA (El bot está silenciado para este contacto)`
    : `✅ Atendimiento con IA activo`;

  let ficha = `FICHA COMERCIAL Y CONTEXTO DEL LEAD:
- Contacto: "${card.nome || card.numero}" (Número: ${card.numero || "N/A"}, Canal: ${card.canal_chat || "whatsapp"})
- Empresa / Razón Social: ${card.empresa || (ctx.prospeccao as any)?.nome || ctx.prospeccao?.razao_social || "No declarada"}
- Email: ${card.email || "No declarado"} | CPF/CNPJ: ${card.cpf_cnpj || ctx.prospeccao?.cnpj || "No declarado"}
- Asesor Comercial Asignado: ${ctx.ownerName ? `"${ctx.ownerName}" (${ctx.ownerEmail || ""})` : "Sin asesor asignado (Turno general)"}
- Estado de Atención: ${pauseAlert}
- Etiquetas (Tags): [${tagsStr}]
- Observaciones internas del lead: ${card.observacao ? `"${card.observacao}"` : "Ninguna"}
- Valor actual en el CRM: ${card.valor ? `${Number(card.valor).toLocaleString(locale, { style: "currency", currency: currencyCode })}` : zeroCur}
- Tiempo en la etapa actual: ${ctx.diasNaEtapaAtual !== null ? `${ctx.diasNaEtapaAtual} día(s)` : "Reciente"} ${ctx.diasNaEtapaAtual && ctx.diasNaEtapaAtual > 7 ? "(⚠️ Alerta de estancamiento / SLA superado)" : ""}`;

  if (card.origem || card.canal_entrada) {
    ficha += `\n- Origen de entrada / Canal: "${card.origem || card.canal_entrada}"`;
  }
  if (ctx.campanha?.nome) {
    ficha += `\n- Campaña de Marketing vinculada: "${ctx.campanha.nome}" (Disparada el ${ctx.campanha.sent_at ? new Date(ctx.campanha.sent_at).toLocaleDateString(locale) : ""})`;
  }
  parts.push(ficha);

  // 2. Catálogo Comercial
  let catBlock = `CATÁLOGO DE PRODUCTOS Y SERVICIOS DE LA EMPRESA:`;
  if (ctx.matchedItem) {
    catBlock += `\n- Item de interés seleccionado en la tarjeta: "${ctx.matchedItem.nome}" (Tipo: ${ctx.matchedItem.tipo}, Precio: ${ctx.matchedItem.preco !== null ? ctx.matchedItem.preco.toLocaleString(locale, { style: "currency", currency: currencyCode }) : "A consultar"}${ctx.matchedItem.agendavel ? ", Requiere Agendamiento: SÍ" : ""})`;
  }
  const prodsList = (ctx.produtos || []).slice(0, 10).map((p) => {
    const ag = p.agendavel ? " [Requiere Cita Previa]" : "";
    const cat = p.categoria ? ` (${p.categoria})` : "";
    return `  * "${p.nome}"${cat}: ${Number(p.preco || 0).toLocaleString(locale, { style: "currency", currency: currencyCode })}${ag}`;
  });
  const servsList = (ctx.servicos || []).slice(0, 5).map((s) => {
    return `  * Serv. "${s.nome}": ${(Number(s.valor_cents || 0) / 100).toLocaleString(locale, { style: "currency", currency: currencyCode })} (${s.duracao_min} min)`;
  });
  const allItems = [...prodsList, ...servsList];
  if (allItems.length > 0) {
    catBlock += `\n- Items destacados disponibles:\n${allItems.join("\n")}`;
  } else {
    catBlock += `\n- (No hay productos activos registrados en el catálogo)`;
  }
  parts.push(catBlock);

  // 3. Agenda y Citas
  if (ctx.agendamentos && ctx.agendamentos.length > 0) {
    const agList = ctx.agendamentos
      .map((a) => `  * [${new Date(a.inicio).toLocaleString(locale)}] "${a.titulo}" (Estado: ${a.status.toUpperCase()})`)
      .join("\n");
    parts.push(`CITAS Y AGENDAMIENTOS EN EL CALENDARIO:\n${agList}`);
  }

  // 4. Historial Comercial / Ventas Previas
  if (ctx.vendasPrevias && ctx.vendasPrevias.length > 0) {
    const totalBrl = (ctx.totalVendidoAnteriorCents / 100).toLocaleString(locale, { style: "currency", currency: currencyCode });
    const vendList = ctx.vendasPrevias
      .map((v) => `  * ${v.vendido_em ? new Date(v.vendido_em).toLocaleDateString(locale) : ""}: "${v.item_nome || "Venta"}" por ${(Number(v.valor_cents) / 100).toLocaleString(locale, { style: "currency", currency: currencyCode })} (${v.metodo_pagamento || "Pago"})`)
      .join("\n");
    parts.push(`HISTORIAL COMERCIAL PREVIO (CLIENTE RECURRENTE):\n- Total histórico comprado: ${totalBrl}\n- Ventas anteriores:\n${vendList}`);
  }

  // 5. Notas Internas del Equipo
  if (ctx.notas && ctx.notas.length > 0) {
    const notList = ctx.notas
      .map((n) => `  * [${new Date(n.created_at).toLocaleDateString(locale)}] "${n.texto}"`)
      .join("\n");
    parts.push(`NOTAS PRIVADAS DEL EQUIPO DE VENTAS:\n${notList}`);
  }

  // 6. Formularios Web / Calificación
  const extras = card.campos_extras && typeof card.campos_extras === "object" ? card.campos_extras : {};
  const formAnswers = extras.respostas || extras.personalizados || (ctx.formSubmissions?.[0]?.dados);
  if (formAnswers && Object.keys(formAnswers).length > 0) {
    parts.push(`RESPUESTAS DE FORMULARIOS WEB Y CAMPOS PERSONALIZADOS:\n${JSON.stringify(formAnswers, null, 2)}`);
  }

  // 7. Satisfacción CSAT
  if (ctx.csat && ctx.csat.score) {
    parts.push(`SATISFACCIÓN DEL CLIENTE (CSAT):\n- Puntaje: ${ctx.csat.score}/5 estrellas ${ctx.csat.comentario ? `("${ctx.csat.comentario}")` : ""}`);
  }

  // 8. Políticas Comerciales y de Venta
  if (ctx.agentRules) {
    const r = ctx.agentRules;
    const rulesList = [];
    if (r.cupom) rulesList.push(`Cupones autorizados: "${r.cupom}"`);
    if (r.formas_pagamento) rulesList.push(`Formas de pago: "${r.formas_pagamento}"`);
    if (r.diferenciais) rulesList.push(`Diferenciales: "${r.diferenciais}"`);
    if (rulesList.length > 0) {
      parts.push(`POLÍTICAS COMERCIALES Y DE DESCUENTO:\n${rulesList.map((x) => `- ${x}`).join("\n")}`);
    }
  }

  return parts.join("\n\n");
}
