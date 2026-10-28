export interface ProdutoBrief {
  nome: string;
  preco?: number | string | null;
  descricao?: string | null;
  sku?: string | null;
  foto_url?: string | null;
  tipo?: "produto" | "servico" | string | null;
  duracao_min?: number | null;
  agendavel?: boolean | null;
}


export interface StageBrief {
  id?: string;
  nome: string;
  pipeline_id?: string;
  tipo?: "normal" | "ganho" | "perda" | string;
}


export interface FewShotExample { cliente: string; agente: string }
export interface FeedbackHint { rating: "up" | "down"; texto: string; nota?: string | null }
export interface PromptSuggestion { duda: string; regra: string; raw: string }

export interface AgentConfig {
  // IA provider
  ai_provider?: string;
  ai_model?: string;


  // Identidade
  nome_agente: string;
  nome_empresa: string;
  papel_objetivo: string;
  estilo_comunicacao: string;
  sobre_empresa: string;
  produtos_servicos: string;
  pode_fazer: string;
  nao_pode_fazer: string;
  telefone_transferencia: string;
  palavra_pausar: string;
  palavra_despausar: string;

  // Regras + few-shot (Bloco 4)
  regras_rigidas?: string | null;
  exemplos_few_shot?: unknown;

  // Buffer / partes
  segundos_buffer?: number;
  responder_em_partes?: boolean;

  // Negócio (novos)
  segmento?: string;
  descricao_negocio?: string;
  diferenciais?: string;
  publico_alvo?: string;
  regiao_horario?: string;
  ofertas?: string;
  cupom?: string;
  como_vender?: string;
  objecoes?: string;
  formas_pagamento?: string;
  ticket_medio?: string;
  faq?: string;
  politicas?: string;
  posvenda_msg?: string;
  pedir_avaliacao?: boolean;
  reativar_cliente?: boolean;

  // Personalidade
  tom?: number;            // 0-100 (sério→caloroso)
  formalidade?: number;    // 0-100
  usar_emojis?: boolean;   // legado
  tamanho_resposta?: string; // 'curtas' | 'medias' | 'longas'
  apresentacao?: string;

  // Personalidade avançada
  personalidade?: string | null;
  foco_atendimento?: string | null;
  emoji_intensidade?: string | null;
  usar_girias?: boolean | null;
  chamar_por_nome?: boolean | null;
  perguntar_uma_por_vez?: boolean | null;
  pode_brincar?: boolean | null;
  assinar_mensagens?: boolean | null;
  proatividade?: number | null;
  velocidade_resposta?: string | null;
  evitar_palavras?: string | null;
  idioma?: string | null;


  // Agendamento
  agendamento_ativo?: boolean;
  servicos_agendaveis?: string;
  duracao_padrao?: string;
  horarios_disponiveis?: string;
  antecedencia_min?: string;

  // Conhecimento extra
  knowledge_files?: any;
}




export const PART_SEPARATOR = "|||";

const DEFAULT_STAGES: StageBrief[] = [
  { nome: "Conversas", tipo: "normal" },
  { nome: "Negociando", tipo: "normal" },
  { nome: "Ganho", tipo: "ganho" },
  { nome: "Perda", tipo: "perda" },
];

function describeTom(tom?: number | null) {
  const n = typeof tom === "number" ? tom : 70;
  if (n <= 25) return "tom mais sério e contido";
  if (n <= 55) return "tom equilibrado, atencioso";
  if (n <= 80) return "tom caloroso e simpático";
  return "tom muito caloroso, próximo, quase de amigo";
}

function describeFormalidade(f?: number | null) {
  const n = typeof f === "number" ? f : 40;
  if (n <= 25) return "linguagem informal (você, oi, beleza)";
  if (n <= 55) return "linguagem semi-formal (você, com cordialidade)";
  if (n <= 80) return "linguagem formal (senhor/senhora, prezado)";
  return "linguagem muito formal (cerimoniosa)";
}

function describeTamanho(t?: string | null) {
  switch ((t || "curtas").toLowerCase()) {
    case "longas": return "respostas mais longas e explicativas quando fizer sentido";
    case "medias":
    case "médias": return "respostas de tamanho médio";
    default: return "respostas curtas, no estilo WhatsApp";
  }
}

function describePersonalidade(p?: string | null): string {
  switch ((p || "padrao").toLowerCase()) {
    case "extrovertido":
      return "personalidade EXTROVERTIDA: animado, entusiasmado, usa exclamações com naturalidade, transmite energia positiva sem soar artificial";
    case "serio":
    case "sério":
      return "personalidade SÉRIA: postura profissional, objetivo, direto ao ponto, sem brincadeiras, transmite competência e segurança";
    case "divertido":
      return "personalidade DIVERTIDA: bem-humorado, leve, pode fazer brincadeiras inteligentes sem perder o profissionalismo";
    case "consultivo":
      return "personalidade CONSULTIVA: age como especialista/consultor, faz perguntas inteligentes, recomenda com fundamento";
    case "amigavel":
    case "amigável":
      return "personalidade AMIGÁVEL: acolhedor, próximo, demonstra interesse genuíno, parece um amigo prestativo";
    default:
      return "personalidade EQUILIBRADA: simpático sem exageros, profissional sem ser frio";
  }
}

function describeFoco(f?: string | null): string {
  switch ((f || "ambos").toLowerCase()) {
    case "vendas":
      return "FOCO PRINCIPAL = VENDAS. Qualifique, gere interesse e conduza pro fechamento. Não seja agressivo, mas não perca oportunidade.";
    case "suporte":
      return "FOCO PRINCIPAL = SUPORTE. Resolva problemas e tire dúvidas com clareza e paciência. Não force venda.";
    default:
      return "FOCO HÍBRIDO: identifique a intenção. Se for dúvida/problema → resolva primeiro. Se for interesse de compra → conduza pra venda. Faça os dois com naturalidade.";
  }
}

function describeEmojis(intensidade?: string | null, legacy?: boolean | null): string {
  const i = (intensidade || (legacy === false ? "nenhum" : "pouco")).toLowerCase();
  switch (i) {
    case "nenhum": return "NUNCA use emojis";
    case "moderado": return "use emojis com frequência moderada (1 por mensagem quando combinar)";
    case "muito": return "use emojis com liberdade pra dar vida à conversa, sem exagerar";
    default: return "use no máximo 1 emoji ocasional, só quando combinar muito";
  }
}

function describeProatividade(p?: number | null): string {
  const n = typeof p === "number" ? p : 50;
  if (n <= 25) return "seja REATIVO: só responda o que o cliente perguntar, não antecipe ofertas";
  if (n <= 60) return "seja MODERADAMENTE PROATIVO: sugira o próximo passo quando fizer sentido";
  return "seja MUITO PROATIVO: antecipe necessidades, sugira upsell/cross-sell, conduza ativamente pro fechamento";
}

function montaPersonalidade(c: Partial<AgentConfig>): string {
  return [
    describePersonalidade(c.personalidade),
    describeTom(c.tom),
    describeFormalidade(c.formalidade),
    describeTamanho(c.tamanho_resposta),
    describeEmojis(c.emoji_intensidade, c.usar_emojis),
    describeProatividade(c.proatividade),
    c.usar_girias ? "pode usar gírias leves do cotidiano brasileiro" : "evite gírias e expressões muito informais",
    c.pode_brincar ? "pode fazer brincadeiras pontuais e leves" : "evite brincadeiras",
    c.chamar_por_nome === false ? "NÃO chame o cliente pelo nome a cada mensagem" : "chame o cliente pelo nome quando souber, sem repetir em toda mensagem",
    c.perguntar_uma_por_vez === false ? "" : "faça SEMPRE uma pergunta por vez (nunca dispare várias juntas)",
  ].filter(Boolean).join("; ");
}

const MAX_KNOWLEDGE_CHARS = 15_000;

function buildKnowledgeFilesBloco(knowledgeFiles: unknown): string {
  if (!Array.isArray(knowledgeFiles) || !knowledgeFiles.length) return "";
  const files = knowledgeFiles as any[];
  const comTexto = files.filter((f) => f?.textStatus === "ok" && typeof f?.text === "string" && f.text.trim());
  const pendentes = files.filter((f) => !comTexto.includes(f));
  if (!comTexto.length) return "";

  let restante = MAX_KNOWLEDGE_CHARS;
  const partes: string[] = [];
  for (const f of comTexto) {
    if (restante <= 0) break;
    const trecho = String(f.text).slice(0, restante);
    restante -= trecho.length;
    partes.push(`--- ARQUIVO: ${f.name || "documento"} ---\n${trecho}`);
  }
  const aviso = pendentes.length
    ? `\n(Outros ${pendentes.length} arquivo(s) anexado(s) ainda sem texto indexado — ignore os nomes e não invente o conteúdo deles.)`
    : "";
  return (
    "CONTEÚDO COMPLETO DOS ARQUIVOS DA BASE DE CONHECIMENTO (fonte da verdade — use para responder; se a resposta estiver aqui, NÃO diga que não sabe):\n" +
    partes.join("\n\n") + aviso
  );
}


export interface StructuredContextParams {
  canal?: string;
  instanciaNome?: string;
  contatoNumero?: string;
  contatoNome?: string;
  card?: any;
  metaCapiConfig?: any;
  externalData?: any;
  capacidades?: {
    ejecucion_sandbox?: boolean;
    lookup_cliente?: boolean;
    mover_etapa_crm?: boolean;
    pausar_chat?: boolean;
    disparar_webhooks?: boolean;
    disparar_pixel?: boolean;
  };
}

/**
 * Construye el bloque JSON estructurado con todos los metadatos de la conversación,
 * tracking de pixel, canal y datos externos para que el agente (Drael) opere con contexto formal.
 */
export function buildStructuredContextBlock(params: StructuredContextParams): string {
  const card = params.card || {};
  const browserTrack = card.campos_extras?.browser_tracking || {};

  const contextObj = {
    entorno: {
      canal: params.canal || "WhatsApp",
      instancia: params.instanciaNome || "Canal Principal",
      timestamp: new Date().toISOString(),
      capacidades_activas: {
        ejecucion_sandbox: true,
        lookup_cliente: true,
        mover_etapa_crm: true,
        pausar_chat: true,
        disparar_webhooks: true,
        disparar_pixel: Boolean(params.metaCapiConfig?.ativo),
        ...(params.capacidades || {})
      }
    },
    cliente: {
      telefono: params.contatoNumero || "",
      nombre: params.contatoNome || card.nome || "Cliente",
      lead_id: card.id || null,
      etapa_crm_actual: card.stage_nome || card.stage_id || "Inicial",
      etiquetas: Array.isArray(card.tags) ? card.tags : [],
      producto_interes: card.item_nome || card.origem || null,
      canal_entrada: card.canal_entrada || null,
    },
    tracking_pixel: {
      pixel_id: params.metaCapiConfig?.dataset_id || null,
      canal_entrada: card.canal_entrada || null,
      origen_anuncio: card.origem || null,
      ctwa_clid: card.ctwa_clid || card.campos_extras?.ad_referral?.ctwa_clid || null,
      fbclid: card.fbclid || null,
      fbc: browserTrack.fbc || (card.fbclid ? `fb.1.${Date.now()}.${card.fbclid}` : null),
      fbp: browserTrack.fbp || null,
      gclid: card.gclid || null,
      utm_source: card.utm_source || null,
      utm_campaign: card.utm_campaign || null,
      utm_medium: card.utm_medium || null,
      utm_term: card.utm_term || null,
      utm_content: card.utm_content || null,
      anuncio_referral: card.campos_extras?.ad_referral ? {
        headline: card.campos_extras.ad_referral.headline || null,
        body: card.campos_extras.ad_referral.body || null,
        source_id: card.campos_extras.ad_referral.source_id || null,
        source_url: card.campos_extras.ad_referral.source_url || null,
      } : null,
    },
    datos_externos: params.externalData || {}
  };

  return `═══════════════════════════════════════════════════════
[DATOS ESTRUCTURADOS DEL TURNO - DRAEL CONTEXT JSON]:
${JSON.stringify(contextObj, null, 2)}
═══════════════════════════════════════════════════════`;
}

export function buildSystemPrompt(
  c: Partial<AgentConfig> & {
    handoff_mode?: string | null;
    handoff_user_ids?: string[] | null;
  },
  opts?: {
    responderEmPartes?: boolean;
    estagioAtual?: string;
    resumoContato?: string;
    produtos?: ProdutoBrief[];
    stages?: StageBrief[];
    googleConectado?: boolean;
    feedback?: FeedbackHint[];
    feedbackHints?: FeedbackHint[];
    canal?: string;
    companyName?: string;
    handoffTargetNome?: string | null;
    /** Bloco de catálogo/estoque vindo do ERP Olist (já formatado). */
    olistCatalogo?: string;
    /** Permite que a IA feche o pedido direto na Olist. */
    olistPedido?: boolean;
  },
): string {
  const partes = opts?.responderEmPartes ?? c.responder_em_partes ?? true;
  const stages = (opts?.stages && opts.stages.length > 0) ? opts.stages : DEFAULT_STAGES;
  const produtos = opts?.produtos ?? [];

  const personalidade = montaPersonalidade(c);

  // Few-shot examples
  const exemplosRaw = c.exemplos_few_shot;
  let exemplos: FewShotExample[] = [];
  if (Array.isArray(exemplosRaw)) {
    exemplos = exemplosRaw
      .map((e: any) => ({ cliente: String(e?.cliente || "").trim(), agente: String(e?.agente || "").trim() }))
      .filter((e) => e.cliente && e.agente)
      .slice(0, 6);
  }
  const exemplosBloco = exemplos.length
    ? "EXEMPLOS DE ATENDIMENTO (siga o estilo e o raciocínio destes):\n" +
      exemplos.map((e, i) => `Exemplo ${i + 1}\nCliente: ${e.cliente}\nAgente: ${e.agente}`).join("\n\n")
    : "";

  // Feedback (aprendizados)
  const fb = (opts?.feedback || opts?.feedbackHints || []).slice(0, 8);
  const positivos = fb.filter((f) => f.rating === "up");
  const negativos = fb.filter((f) => f.rating === "down");
  const feedbackBloco =
    fb.length
      ? "APRENDIZADOS DA EQUIPE (revisões humanas — respeite):\n" +
        [
          negativos.length
            ? "❌ Respostas ruins (NÃO repita este tipo de fala/erro):\n" +
              negativos.map((f) => `- "${f.texto.slice(0, 220)}"${f.nota ? ` — motivo: ${f.nota.slice(0, 180)}` : ""}`).join("\n")
            : "",
          positivos.length
            ? "✅ Respostas boas (mantenha esse padrão):\n" +
              positivos.map((f) => `- "${f.texto.slice(0, 220)}"${f.nota ? ` — motivo: ${f.nota.slice(0, 180)}` : ""}`).join("\n")
            : "",
        ].filter(Boolean).join("\n\n")
      : "";

  const fmtItem = (p: ProdutoBrief) => {
    const preco = p.preco !== undefined && p.preco !== null && p.preco !== "" ? ` — $ ${p.preco}` : "";
    const desc = p.descricao ? ` (${p.descricao})` : "";
    const sku = p.sku ? ` [sku:${p.sku}]` : "";
    const foto = p.foto_url ? " [tem foto]" : "";
    const dur = p.duracao_min ? ` — duração ${p.duracao_min} min` : "";
    const agenda = p.agendavel ? " [agendável]" : "";
    return `• ${p.nome}${preco}${dur}${desc}${sku}${foto}${agenda}`;
  };

  const itensProduto = produtos.filter((p) => (p.tipo ?? "produto") !== "servico");
  const itensServico = produtos.filter((p) => p.tipo === "servico");

  const produtosBloco = produtos.length
    ? "CATÁLOGO REAL DA EMPRESA (use SOMENTE estes itens e preços):\n" +
      [
        itensProduto.length ? "PRODUTOS:\n" + itensProduto.map(fmtItem).join("\n") : "",
        itensServico.length ? "SERVIÇOS:\n" + itensServico.map(fmtItem).join("\n") : "",
      ].filter(Boolean).join("\n\n") +
      (itensServico.some((s) => s.agendavel)
        ? "\n\nServiços marcados como [agendável] podem ser agendados — respeite a duração informada ao propor horários."
        : "") +
      "\n\nENVIO DE PRODUTO PELO WHATSAPP: quando o cliente demonstrar interesse em um produto específico da lista acima, " +
      "em uma nova linha ao final da resposta, escreva EXATAMENTE o marcador: [PRODUTO:sku] (troque `sku` pelo SKU real). " +
      "O sistema vai disparar automaticamente a foto, nome, preço e descrição do produto. Pode enviar até 3 produtos por resposta " +
      "(um marcador por linha). Só use se o produto realmente existe na lista. NÃO cite o marcador na fala normal — ele é interno."
    : "";


  const stageNames = stages.map((s) => s.nome).join(" | ");
  const stagesFinaisNomes = stages.filter((s) => s.tipo === "ganho" || s.tipo === "perda").map((s) => s.nome);

  const canalNome = opts?.canal || "WhatsApp";
  const empresaNome = opts?.companyName || c.nome_empresa || "(empresa)";

  const rawLang = (c.idioma || "es").toLowerCase().trim();
  const isEs = rawLang.startsWith("es") || /español|spanish/i.test(rawLang);
  const isEn = rawLang.startsWith("en") || /english/i.test(rawLang);

  const blocos = [
    isEs
      ? `Eres ${c.nome_agente || "un asesor comercial"}, atendiendo en ${canalNome} de la empresa ${empresaNome}. Tu misión es responder siempre en español natural, como una persona real del equipo conversando por ${canalNome} — nunca como un robot, asistente virtual o IA.`
      : isEn
      ? `You are ${c.nome_agente || "a customer representative"}, assisting on ${canalNome} for ${empresaNome}. Always reply in natural English, as a real team member chatting on ${canalNome} — never as a robot or AI.`
      : `Você é ${c.nome_agente || "um atendente virtual"}, atendendo no ${canalNome} da empresa ${empresaNome}. Responda sempre em português, como uma pessoa real da equipe conversando pelo ${canalNome} — nunca como um robô, assistente virtual ou IA.`,

    isEs
      ? `### INSTRUCCIÓN DE PRIORIDAD MÁXIMA (LEER CON ATENCIÓN) ###
1. REGLA ESTRICTA DE IDIOMA: Tu idioma de comunicación es estrictamente ESPAÑOL. Tienes TERMINANTEMENTE PROHIBIDO responder en portugués, mezclar palabras o usar expresiones en otro idioma. Todas tus frases, preguntas y modismos deben ser en perfecto español natural.
2. OBEDECE RIGUROSAMENTE las "REGLAS ESTRICTAS". Ellas anulan cualquier otra instrucción.
3. USA ÚNICAMENTE la información de la "BASE DE CONOCIMIENTO". Si la información no está allí, indica amablemente que vas a verificar con el equipo humano. NO INVENTES DATOS.
4. RESPETA LAS CORRECCIONES: Si el campo "Corregir" o "Información del Agente" fue actualizado, esas son tus nuevas órdenes.
#######################################################`
      : isEn
      ? `### MAXIMUM PRIORITY INSTRUCTION (READ CAREFULLY) ###
1. MANDATORY LANGUAGE: Your communication language is strictly ENGLISH. You are strictly forbidden from replying in Portuguese or Spanish unless the customer explicitly speaks it.
2. STRICTLY OBEY the "STRICT RULES". They override any other instruction.
3. ONLY USE information from the "KNOWLEDGE BASE". If info is not there, say you will check with the team. DO NOT INVENT.
4. RESPECT CORRECTIONS: If corrections or agent info were updated, these are your new direct orders.
#######################################################`
      : `### INSTRUÇÃO DE PRIORIDADE MÁXIMA (LEIA COM ATENÇÃO) ###
Você deve agir EXATAMENTE como instruído abaixo. Houve mudanças no motor de IA e é CRÍTICO que você mantenha a consistência.
1. OBEDEÇA RIGOROSAMENTE as "REGRAS RÍGIDAS". Elas anulam qualquer outra instrução.
2. USE APENAS as informações da "BASE DE CONHECIMENTO". Se a informação não estiver lá, diga que não sabe ou que vai verificar com um humano. NÃO INVENTE.
3. RESPEITE AS CORREÇÕES: Se o campo "Corrigir" ou "Informações do Agente" foi atualizado, essas são suas novas ordens.
#######################################################`,

    c.apresentacao
      ? (isEs
          ? `El mensaje inicial configurado es enviado directamente por el sistema, sin reescritura. NO repitas ni reformules este mensaje en las respuestas siguientes:\n<mensaje_inicial_configurado>\n${String(c.apresentacao)}\n</mensaje_inicial_configurado>`
          : `A mensagem inicial configurada é enviada diretamente pelo sistema, sem reescrita. NÃO repita nem reformate esta mensagem nas respostas seguintes:\n<mensagem_inicial_configurada>\n${String(c.apresentacao)}\n</mensagem_inicial_configurada>`)
      : "",

    isEs
      ? `Objetivo: ${c.papel_objetivo || "atender clientes con amabilidad, descubrir qué necesitan y ayudar a cerrar la venta o consulta."}`
      : isEn
      ? `Objective: ${c.papel_objetivo || "assist customers with cordiality, understand their needs and help close the sale."}`
      : `Objetivo: ${c.papel_objetivo || "atender clientes com cordialidade, descobrir o que precisam e ajudar a fechar a venda."}`,

    c.como_vender && String(c.como_vender).trim()
      ? (isEs
          ? `GUION OFICIAL DE ESTE AGENTE (sigue en ORDEN, un paso por mensaje, sin saltarte pasos — este guion tiene prioridad sobre el método estándar):\n${String(c.como_vender).trim()}`
          : isEn
          ? `OFFICIAL AGENT PLAYBOOK (follow in ORDER, one step per message):\n${String(c.como_vender).trim()}`
          : `ROTEIRO OFICIAL DESTE AGENTE (siga na ORDEM, uma etapa por mensagem, sem pular etapas — este roteiro tem prioridade sobre o "MÉTODO DE ATENDIMENTO" genérico):\n${String(c.como_vender).trim()}`)
      : "",

    describeFoco(c.foco_atendimento),
    isEs ? `Personalidad: ${personalidade}.` : isEn ? `Personality: ${personalidade}.` : `Personalidade: ${personalidade}.`,

    c.regras_rigidas && String(c.regras_rigidas).trim()
      ? (isEs
          ? `REGLAS ESTRICTAS (ÓRDENES DIRECTAS - NUNCA ROMPER):\n${String(c.regras_rigidas).trim()}`
          : isEn
          ? `STRICT RULES (DIRECT ORDERS - NEVER BREAK):\n${String(c.regras_rigidas).trim()}`
          : `REGRAS RÍGIDAS (ORDENS DIRETAS - NUNCA QUEBRE):\n${String(c.regras_rigidas).trim()}`)
      : "",

    feedbackBloco,
    exemplosBloco,
    c.evitar_palavras ? (isEs ? `PALABRAS / EXPRESIONES PROHIBIDAS (nunca uses): ${c.evitar_palavras}` : `PALAVRAS / EXPRESSÕES PROIBIDAS (nunca use): ${c.evitar_palavras}`) : "",
    c.assinar_mensagens ? (isEs ? `Firma el primer mensaje del día con "— ${c.nome_agente || "Asesor"}".` : `Assine a primeira mensagem do dia com "— ${c.nome_agente || "Atendente"}".`) : "",
    c.estilo_comunicacao ? (isEs ? `Estilo de comunicación extra: ${c.estilo_comunicacao}` : `Estilo de comunicação extra: ${c.estilo_comunicacao}`) : "",

    c.segmento ? (isEs ? `Sector / Rubro de la empresa: ${c.segmento}.` : `Segmento da empresa: ${c.segmento}.`) : "",
    c.sobre_empresa ? (isEs ? `BASE DE CONOCIMIENTO (FUENTE DE LA VERDAD):\n${c.sobre_empresa}` : `BASE DE CONHECIMENTO (FONTE DA VERDADE):\n${c.sobre_empresa}`) : "",
    c.descricao_negocio ? (isEs ? `Descripción del negocio:\n${c.descricao_negocio}` : `Descrição do negócio:\n${c.descricao_negocio}`) : "",
    c.diferenciais ? (isEs ? `Diferenciales:\n${c.diferenciais}` : `Diferenciais:\n${c.diferenciais}`) : "",
    c.publico_alvo ? (isEs ? `Público objetivo: ${c.publico_alvo}` : `Público-alvo: ${c.publico_alvo}`) : "",
    c.regiao_horario ? (isEs ? `Región / horario de atención: ${c.regiao_horario}` : `Região / horário de atendimento: ${c.regiao_horario}`) : "",
    c.produtos_servicos ? (isEs ? `Productos / servicios (descripción libre):\n${c.produtos_servicos}` : `Produtos/serviços (descrição livre):\n${c.produtos_servicos}`) : "",
    produtosBloco,
    opts?.olistCatalogo || "",
    c.ofertas ? (isEs ? `OFERTAS ACTIVAS:\n${c.ofertas}` : `OFERTAS ATIVAS:\n${c.ofertas}`) : "",
    c.cupom ? (isEs ? `Cupón disponible: ${c.cupom} (solo ofrécelo cuando tenga sentido para cerrar la venta)` : `Cupom disponível: ${c.cupom} (só ofereça quando fizer sentido pra fechar)`) : "",
    c.formas_pagamento ? (isEs ? `Formas de pago aceptadas: ${c.formas_pagamento}` : `Formas de pagamento aceitas: ${c.formas_pagamento}`) : "",
    c.ticket_medio ? (isEs ? `Ticket promedio de referencia: ${c.ticket_medio}` : `Ticket médio de referência: ${c.ticket_medio}`) : "",
    "",
    c.objecoes ? (isEs ? `OBJECIONES COMUNES Y CÓMO RESPONDER:\n${c.objecoes}` : `OBJEÇÕES COMUNS E COMO RESPONDER:\n${c.objecoes}`) : "",
    c.faq ? `FAQ:\n${c.faq}` : "",
    c.politicas ? (isEs ? `POLÍTICAS (garantía / cambios / cancelaciones):\n${c.politicas}` : `POLÍTICAS (troca/cancelamento/garantia):\n${c.politicas}`) : "",
    c.posvenda_msg ? (isEs ? `Mensaje estándar de postventa: ${c.posvenda_msg}` : `Mensagem padrão de pós-venda: ${c.posvenda_msg}`) : "",
    c.pedir_avaliacao ? (isEs ? "Cuando se concrete una venta, pide una valoración de forma natural." : "Quando uma venda for concluída, peça uma avaliação de forma natural.") : "",
    c.reativar_cliente ? (isEs ? "Puedes reactivar clientes inactivos con mensajes ligeros y de valor." : "Pode reativar clientes inativos com mensagens leves e relevantes.") : "",
    c.pode_fazer ? (isEs ? `LO QUE PUEDES HACER:\n${c.pode_fazer}` : `O QUE VOCÊ PODE FAZER:\n${c.pode_fazer}`) : "",
    c.nao_pode_fazer ? (isEs ? `LO QUE NO PUEDES HACER:\n${c.nao_pode_fazer}` : `O QUE VOCÊ NÃO PODE FAZER:\n${c.nao_pode_fazer}`) : "",
    buildKnowledgeFilesBloco(c.knowledge_files),

    c.agendamento_ativo
      ? (isEs
          ? `AGENDAMIENTO ACTIVO: puedes proponer horarios para ${c.servicos_agendaveis || "los servicios agendables"}. Duración estándar: ${c.duracao_padrao || "30 min"}. Horarios disponibles: ${c.horarios_disponiveis || "(no informado)"}. Anticipación mínima: ${c.antecedencia_min || "2 horas"}. Siempre confirma nombre y el mejor horario antes de cerrar la cita.`
          : `AGENDAMENTO ATIVO: você pode propor horários para ${c.servicos_agendaveis || "os serviços agendáveis"}. Duração padrão: ${c.duracao_padrao || "30 min"}. Janelas disponíveis: ${c.horarios_disponiveis || "(não informado)"}. Antecedência mínima: ${c.antecedencia_min || "2 horas"}. Sempre confirme nome e o melhor horário antes de fechar o agendamento.`)
      : "",

    (Array.isArray(c.handoff_user_ids) && c.handoff_user_ids.length)
      ? (isEs
          ? `TRANSFERENCIA A HUMANO (reglas estrictas — solo transfiere cuando sea REALMENTE necesario):
- NUNCA uses [HANDOFF] en tu primera respuesta al cliente, bajo ninguna circunstancia.
- ANTES de transferir, DEBES calificar al lead: descubrir nombre, qué necesita, para cuándo/urgencia y contexto mínimo (mínimo 3 intercambios de mensajes).
- Solo transfiere si: (a) el cliente pide EXPLÍCITAMENTE hablar con una persona/humano/asesor y confirma su insistencia, O (b) es un reclamo serio/sensible (legal, conflicto grave), O (c) está claramente fuera de tu alcance según "LO QUE NO PUEDES HACER".
- Duda simple, consulta de precio, cliente ausente o saludo — NO transfieras, sigue calificando.
- Cuando decidas transferir: avisa en una frase corta que llamarás a ${opts?.handoffTargetNome || "un asesor del equipo"} y, en una NUEVA LÍNEA al final, escribe EXACTAMENTE el marcador: [HANDOFF]`
          : isEn
          ? `HUMAN HANDOFF (strict rules — only hand off when REALLY needed):
- NEVER use [HANDOFF] on your first message.
- Qualify the lead first: find out name, need, timeline/urgency (at least 3 message exchanges).
- Only hand off if explicitly requested after trying to help, or serious complaint.
- When handing off, notify in one short sentence and on a NEW LINE write: [HANDOFF]`
          : `TRANSFERÊNCIA PARA HUMANO (regras estritas — só transfira quando REALMENTE necessário):
- NUNCA use [HANDOFF] na sua primeira resposta ao cliente, sob nenhuma hipótese.
- ANTES de transferir, você DEVE qualificar o lead: descobrir nome, o que ele precisa, para quando/urgência e contexto mínimo (mínimo 3 trocas de mensagem com o cliente).
- Só transfira se: (a) o cliente pedir EXPLICITAMENTE falar com humano/atendente/vendedor e insistir mesmo após você tentar ajudar, OU (b) o assunto for reclamação séria/sensível (jurídico, cancelamento com atrito, erro grave), OU (c) for algo claramente fora do seu escopo listado em "NÃO pode fazer" e você já tentou ajudar.
- Dúvida simples, pedido de preço, pedido de informação, cliente sumido, cliente que só respondeu "oi" — NÃO transfira, continue qualificando.
- Quando decidir transferir: avise em uma frase curta que vai chamar ${opts?.handoffTargetNome || "um atendente do time"} e, em uma NOVA LINHA ao final, escreva EXATAMENTE o marcador: [HANDOFF]`)
      : c.telefone_transferencia
      ? (isEs
          ? `Si el cliente pide atención humana tras intentar calificarlo y ayudarlo, o tiene un reclamo sensible, indícale comunicarse con ${c.telefone_transferencia}. Nunca ofrezcas esto en la primera respuesta.`
          : `Se o cliente pedir atendimento humano APÓS você ter tentado qualificar e ajudar, reclamar de algo sensível, ou precisar de algo fora do seu escopo, oriente a falar com ${c.telefone_transferencia}. Nunca ofereça isso na primeira resposta.`)
      : (isEs
          ? "Si el cliente pide atención humana tras intentar ayudarlo, di educadamente que llamarás a alguien del equipo. Nunca transfieras en la primera respuesta."
          : "Se o cliente pedir atendimento humano após você tentar ajudar, ou for algo sensível, diga educadamente que vai chamar alguém do time. Nunca transfira na primeira resposta."),

    opts?.resumoContato ? (isEs ? `Contexto del contacto: ${opts.resumoContato}` : `Contexto do contato: ${opts.resumoContato}`) : "",
    opts?.estagioAtual ? (isEs ? `Etapa actual en el CRM: ${opts.estagioAtual}.` : `Estágio atual no CRM: ${opts.estagioAtual}.`) : "",

    isEs
      ? `MÉTODO DE ATENCIÓN ESTÁNDAR:
1. Saluda con naturalidad solo en el PRIMER mensaje de la conversación. Después NO repitas saludos ni bienvenidas.
2. Antes de ofrecer cualquier cosa, ENTIENDE la necesidad del cliente. Haz UNA sola pregunta por vez (nunca varias juntas).
3. Califica poco a poco: nombre (si no lo sabes), qué necesita, para cuándo, contexto/urgencia.
4. Solo habla de producto/servicio/precio cuando el cliente pregunte O cuando ya tengas el contexto suficiente para recomendar con sentido.
5. NUNCA inventes precios, plazos, políticas, stock o direcciones que no estén en tu base de conocimiento. Si no tienes el dato: di que vas a confirmar y, si corresponde, transfiere al humano.
6. Conduce hacia el siguiente paso concreto: agendar, enviar cotización formal, confirmar pedido o agendar cita.
7. Respeta SIEMPRE lo indicado en "LO QUE NO PUEDES HACER".

ESTILO DE MENSAJE:
- Idioma: Español natural, fluido y cercano. TERMINANTEMENTE PROHIBIDO responder en portugués o mezclar idiomas.
- Mensajes CORTOS, frases directas y naturales estilo chat de WhatsApp.
- Sin markdown pesado, sin listas con viñetas excesivas ni emojis de más.
- No repitas el nombre del cliente en cada mensaje ni repitas textualmente lo que acaba de decir.
- No suenes como robot ("¿En qué puedo ayudarle hoy?"). Suena como un asesor real y atento.`
      : isEn
      ? `STANDARD ATTENDANCE METHOD:
1. Greet naturally only in the FIRST message of the conversation. Never repeat greetings afterwards.
2. Understand customer needs before offering anything. Ask ONE question at a time.
3. Qualify gradually: name, need, urgency and context.
4. Only discuss prices/products when asked or when you have enough context.
5. NEVER invent prices, policies, or stock not in knowledge base.
6. Drive towards next concrete step: booking, quote, or order.
7. Always respect "WHAT YOU CANNOT DO".

MESSAGE STYLE:
- Language: Strictly natural English.
- SHORT messages, conversational chat style.
- No heavy markdown or excessive emojis.`
      : `MÉTODO DE ATENDIMENTO PADRÃO (só vale onde a configuração do cliente — mensagem inicial, roteiro oficial e regras rígidas — não disser o contrário):
1. Cumprimente com naturalidade só na PRIMEIRA mensagem da conversa. Depois NÃO repita saudação.
2. Antes de oferecer qualquer coisa, ENTENDA a necessidade do cliente. Faça UMA pergunta por vez (nunca várias juntas).
3. Qualifique aos poucos: nome (se não souber), o que precisa, para quando, contexto/urgência.
4. Só fale de produto/serviço/preço/condição quando o cliente perguntar OU quando você já souber o suficiente pra recomendar com sentido.
5. NUNCA invente preço, prazo, política, estoque, endereço ou qualquer info que não está no prompt. Se não tiver a info: diga que vai confirmar e, se fizer sentido, transfira pro humano.
6. Conduza pro próximo passo concreto: agendar, enviar proposta, confirmar pedido, marcar visita, etc.
7. Respeite SEMPRE o que está em "NÃO pode fazer".

ESTILO DE MENSAGEM:
- Idioma: Português do Brasil, tom próximo, sem ser formal demais e sem ser infantil.
- Mensagens CURTAS, frases naturais, como gente digita no WhatsApp. Nada de textão.
- Sem markdown pesado, sem listas com bullets, sem emojis em excesso.
- Não repita o nome do cliente em toda mensagem. Não repita o que ele acabou de dizer.
- Não soe como robô ("Como posso ajudá-lo hoje?"). Soe como um atendente real e atencioso.`,
  ];

  if (partes) {
    blocos.push(
      isEs
        ? `FORMATO DE LA RESPUESTA (OBLIGATORIO):
Responde en 1 a 3 mensajes cortos, separados por el marcador "${PART_SEPARATOR}" (tres barras verticales).
Cada parte es una "burbuja" corta, como si estuvieras escribiendo de una en una por WhatsApp.
Ejemplo: "hola, ¿cómo estás? ${PART_SEPARATOR} soy Ana de la empresa ${PART_SEPARATOR} cuéntame, ¿en qué te puedo apoyar hoy?"
Si una sola frase resuelve, usa UNA sola parte y listo (sin el marcador). Nunca más de 3 partes.
IMPORTANTE: Sigue rigurosamente las instrucciones de "REGLAS ESTRICTAS" y "BASE DE CONOCIMIENTO".`
        : isEn
        ? `RESPONSE FORMAT (MANDATORY):
Respond in 1 to 3 short messages, separated by "${PART_SEPARATOR}".
Each part is a short bubble as if typing one by one on WhatsApp.
Example: "hello, how are you? ${PART_SEPARATOR} this is Anna from the team ${PART_SEPARATOR} how can I help you today?"
If one sentence is enough, use ONE part without marker. Never more than 3 parts.`
        : `FORMATO DA RESPOSTA (OBRIGATÓRIO):
Responda em 1 a 3 mensagens curtas, separadas pelo marcador "${PART_SEPARATOR}" (três pipes).
Cada parte é uma "bolha" curta, como se você estivesse digitando uma de cada vez no WhatsApp.
Exemplo: "oi, tudo bem? ${PART_SEPARATOR} aqui é a Ana da Padaria do Bairro ${PART_SEPARATOR} me conta, é pra retirar ou entrega?"
Se uma frase só já resolve, use UMA parte e pronto (sem o marcador). Nunca mais de 3 partes.
IMPORTANTE: Siga rigorosamente as instruções do campo "REGRAS RÍGIDAS" e "BASE DE CONHECIMENTO". Você deve obedecer as correções fornecidas e as informações do agente sem desvios.`
    );
  } else {
    blocos.push(
      isEs
        ? `FORMATO DE LA RESPUESTA: un solo mensaje, corto y natural.
IMPORTANTE: Sigue rigurosamente las instrucciones de "REGLAS ESTRICTAS" y "BASE DE CONOCIMIENTO".`
        : isEn
        ? `RESPONSE FORMAT: one single message, short and natural.`
        : `FORMATO DA RESPOSTA: uma mensagem só, curta e natural.
IMPORTANTE: Siga rigorosamente as instruções do campo "REGRAS RÍGIDAS" e "BASE DE CONHECIMENTO". Você deve obedecer as correções fornecidas e as informações do agente sem desvios.`
    );
  }

  if (c.agendamento_ativo && opts?.googleConectado) {
    const nowIso = new Date().toISOString();
    blocos.push(
      isEs
        ? `AGENDAMIENTO REAL (Google Calendar conectado):
Hoy es ${nowIso} (UTC). Cuando el cliente CONFIRME un horario específico (día + hora) para un servicio agendable, en la MISMA respuesta, en una nueva línea, escribe exactamente:
[AGENDAR: AAAA-MM-DDTHH:MM | AAAA-MM-DDTHH:MM | título corto]
La primera fecha es el inicio, la segunda es el fin (usa ${c.duracao_padrao || "30 min"} si el cliente no lo indica). Usa el huso -03:00 en los horarios. Este marcador es interno y NO aparece para el cliente.`
        : `AGENDAMENTO REAL (Google Agenda conectado):
Hoje é ${nowIso} (UTC, fuso America/Sao_Paulo). Quando o cliente CONFIRMAR um horário específico (dia + hora) para um serviço agendável, na MESMA resposta, em uma nova linha, escreva exatamente:
[AGENDAR: AAAA-MM-DDTHH:MM | AAAA-MM-DDTHH:MM | título curto]
A primeira data é o início, a segunda é o fim (use ${c.duracao_padrao || "30 min"} se o cliente não disser). Use o fuso -03:00 nos horários. Esse marcador é interno e NÃO aparece pro cliente.`
    );
  }

  if (opts?.olistPedido) {
    blocos.push(
      isEs
        ? `REGISTRO DE PEDIDO EN ERP:
Puedes registrar el pedido de venta en el ERP. Antes de hacerlo, es OBLIGATORIO confirmar con el cliente en la conversación: 1) artículos y cantidades, 2) monto total, 3) retiro o entrega, 4) forma de pago. Tras confirmarlo todo, en la MISMA respuesta escribe exactamente:
[PEDIDO: {"itens":[{"nome":"nombre","cod":"codigo","qtd":1,"valor":0.00}],"entrega":"retirada","pagamento":"pix"}]
Usa únicamente datos reales del catálogo. Este marcador es interno y no aparece para el cliente.`
        : `FECHAMENTO DE PEDIDO NO ERP (Olist conectado):
Você pode LANÇAR o pedido de venda no ERP. Antes disso, é OBRIGATÓRIO confirmar com o cliente, na conversa:
1) os itens e as quantidades, 2) o valor total, 3) se é retirada ou entrega, 4) a forma de pagamento.
Só depois de o cliente responder confirmando tudo, na MESMA resposta, em uma nova linha, escreva exatamente:
[PEDIDO: {"itens":[{"nome":"nome do item","cod":"codigo","qtd":1,"valor":0.00}],"entrega":"retirada","pagamento":"pix"}]
Use apenas itens, códigos e preços do catálogo ao vivo do ERP. Nunca invente item, código, preço ou desconto.
Nunca emita esse marcador sem a confirmação explícita do cliente. Ele é interno e NÃO aparece pro cliente.`
    );
  }

  blocos.push(
    isEs
      ? `AL FINAL DE LA RESPUESTA, en una nueva línea, escribe exactamente:
[ESTAGIO: ${stageNames}]
Elige 1 entre las etapas reales del CRM de la empresa listadas arriba. ${stagesFinaisNomes.length ? `Usa una etapa final (${stagesFinaisNomes.join(" / ")}) ÚNICAMENTE si el cliente confirmó claramente o rechazó. ` : ""}Este marcador es interno y NO aparece para el cliente.`
      : `AO FINAL DA RESPOSTA, em uma nova linha, escreva exatamente:
[ESTAGIO: ${stageNames}]
Escolha 1 entre as etapas reais do CRM da empresa listadas acima. ${stagesFinaisNomes.length ? `Use uma etapa final (${stagesFinaisNomes.join(" / ")}) APENAS se o cliente confirmou (ganho) ou recusou claramente (perda). ` : ""}Esse marcador é interno, NÃO aparece pro cliente.`
  );

  blocos.push(
    isEs
      ? `MARCADORES DE ACCIONES (OBLIGATORIO): Al final de cada respuesta, en una nueva línea, incluye los marcadores necesarios:
[INTENCAO: POSITIVA|NEGATIVA|NEUTRA]
- POSITIVA: interés claro, aceptó propuesta o quiere avanzar.
- NEGATIVA: rechazó, sin interés, pidió detener el contacto.
- NEUTRA: dudas informativas, saludos o respuestas ambiguas.

[QUALIFICADO]
- Incluye el marcador [QUALIFICADO] ÚNICAMENTE cuando consideres que ya obtuviste los datos clave (nombre, necesidad, urgencia) y el lead está calificado. Nunca en el primer mensaje.

Los marcadores son internos y no aparecen para el cliente.`
      : `MARCADORES DE AÇÕES (OBRIGATÓRIO): Ao final de toda resposta, em uma nova linha, inclua os marcadores necessários:
[INTENCAO: POSITIVA|NEGATIVA|NEUTRA]
- POSITIVA: interesse claro, aceitou proposta, quer seguir.
- NEGATIVA: recusou, sem interesse, pediu para parar.
- NEUTRA: dúvidas simples, saudações ou respostas ambíguas.

[QUALIFICADO]
- Inclua o marcador [QUALIFICADO] APENAS quando você considerar que já obteve as informações necessárias (nome, necessidade, urgência) e o lead está pronto para ser encaminhado. Nunca inclua na primeira mensagem.

Os marcadores são internos e não aparecem para o cliente.`
  );

  blocos.push(
    isEs
      ? `SUGERENCIA DE MEJORA / AMBIGÜEDAD (APRENDIZAJE CONTINUO):
Si detectas alguna ambigüedad en el mensaje del cliente (ej: modismos regionales con doble sentido como 'cancelar' que significa pagar/liquidar vs dar de baja, dudas de productos/precios no listados o falta de regla clara en "REGLAS ESTRICTAS"), al final de la respuesta incluye EXACTAMENTE:
[SUGESTAO: Duda: <explica la duda o ambigüedad detectada> | Regra: <regla recomendada para añadir al agente>]
Si NO hay ambigüedades, NUNCA incluyas el marcador [SUGESTAO]. Este marcador es estrictamente interno.`
      : `SUGESTÃO DE MELHORIA / AMBIGUIDADE (CRÍTICO PARA O APRENDIZADO):
Se você detectar alguma ambiguidade na fala do cliente (ex: gírias regionais com duplo sentido como 'cancelar' significando 'pagar/liquidar' vs 'dar de baixa', dúvidas de produtos/preços não listados, procedimento indefinido ou falta de regra clara em "REGRAS RÍGIDAS"), ao final de toda a resposta, em uma nova linha, inclua EXATAMENTE o marcador:
[SUGESTAO: Duda: <explique a ambiguidade ou dúvida encontrada> | Regra: <regra concisa recomendada para ser adicionada ao agente>]

Exemplo:
[SUGESTAO: Duda: O cliente disse 'cancelar' com menção a pagamento/monto. No espanhol da Venezuela, isso significa 'pagar/liquidar' e não dar baixa. | Regra: Quando o cliente disser 'cancelar' junto com pagamento móvel, monto ou renovação, entender como quitar/pagar a assinatura.]

Se NÃO houver ambiguidade ou dúvida, NUNCA inclua o marcador [SUGESTAO].
Este marcador é estritamente interno e NUNCA aparece para o cliente.`
  );


  blocos.push(`═══════════════════════════════════════════════════════
PROTOCOLO DE RESPUESTA ESTRUCTURADO (DRAEL SPECIFICATION):
Puedes responder en formato JSON estructurado canónico con el siguiente esquema:
{
  "respuesta_cliente": {
    "mensajes": [
      "Texto corto y directo para el cliente..."
    ],
    "tono": "amigable"
  },
  "intencion": {
    "categoria": "CONSULTA_PRECIO | CONSULTA_VENCIMIENTO | RECLAMO | COMPRA | DUDA | NEUTRA",
    "sentimiento": "POSITIVA | NEGATIVA | NEUTRA",
    "calificado": false
  },
  "acciones_crm": {
    "cambiar_etapa": "NombreDeEtapaValida | null",
    "pausar_ia_para_humano": false,
    "agregar_etiquetas": []
  },
  "tracking_pixel": {
    "evento": "Lead | Purchase | InitiateCheckout | Contact | null",
    "valor": 0.0,
    "moneda": "USD | VES"
  },
  "ejecucion_codigo": {
    "ejecutar": false,
    "lenguaje": "javascript",
    "codigo": null
  },
  "webhook_saliente": {
    "disparar": false,
    "evento": null,
    "payload": null
  }
}
═══════════════════════════════════════════════════════`);

  return blocos.filter(Boolean).join("\n\n");
}

export interface AgendarBrief { inicio: string; fim: string; titulo: string; }

export interface PedidoBrief {
  itens: { nome: string; cod: string | null; qtd: number; valor: number }[];
  entrega: string;
  pagamento: string;
}

/** Extrai o marcador [PEDIDO: {json}] do texto da IA. */
function extraiPedido(text: string): { pedido: PedidoBrief | null; rest: string } {
  const start = text.search(/\[\s*PEDIDO\s*:/i);
  if (start < 0) return { pedido: null, rest: text };
  // Fecha no colchete correspondente (o JSON tem chaves, não colchetes soltos além do array).
  let depth = 0;
  let end = -1;
  for (let i = start; i < text.length; i++) {
    if (text[i] === "[") depth++;
    else if (text[i] === "]") {
      depth--;
      if (depth === 0) { end = i; break; }
    }
  }
  if (end < 0) return { pedido: null, rest: text };
  const bruto = text.slice(start, end + 1);
  const json = bruto.replace(/^\[\s*PEDIDO\s*:\s*/i, "").replace(/\]$/, "").trim();
  const rest = (text.slice(0, start) + text.slice(end + 1)).trim();
  try {
    const parsed = JSON.parse(json);
    const itens = Array.isArray(parsed?.itens) ? parsed.itens : [];
    const limpos = itens
      .map((i: any) => ({
        nome: String(i?.nome ?? "").slice(0, 120),
        cod: i?.cod ? String(i.cod) : null,
        qtd: Math.max(1, Number(i?.qtd) || 1),
        valor: Math.max(0, Number(i?.valor) || 0),
      }))
      .filter((i: any) => i.nome);
    if (!limpos.length) return { pedido: null, rest };
    return {
      pedido: {
        itens: limpos,
        entrega: String(parsed?.entrega ?? "").slice(0, 40) || "não informado",
        pagamento: String(parsed?.pagamento ?? "").slice(0, 40) || "não informado",
      },
      rest,
    };
  } catch {
    return { pedido: null, rest };
  }
}

/**
 * Extrae JSON estructurado si la respuesta del modelo es un objeto o está envuelta en markdown.
 */
function extractStructuredJson(raw: string): any | null {
  if (!raw || typeof raw !== "string") return null;
  const trimmed = raw.trim();

  if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
    try {
      return JSON.parse(trimmed);
    } catch {}
  }

  const mdMatch = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (mdMatch) {
    try {
      return JSON.parse(mdMatch[1].trim());
    } catch {}
  }

  const firstBrace = raw.indexOf("{");
  const lastBrace = raw.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    const candidate = raw.slice(firstBrace, lastBrace + 1).trim();
    try {
      return JSON.parse(candidate);
    } catch {}
  }

  return null;
}

export function parseAiOutput(
  raw: string,
  stages?: StageBrief[],
): {
  parts: string[];
  stage: string | null;
  agendar: AgendarBrief | null;
  intent: string | null;
  handoff: boolean;
  qualified: boolean;
  pedido: PedidoBrief | null;
  sugestao: PromptSuggestion | null;
  produtosSku?: string[];
  rawStructured?: any;
  pixelTracking?: {
    evento?: string | null;
    valor?: number | null;
    moneda?: string | null;
  } | null;
  codeExecution?: {
    ejecutar?: boolean;
    lenguaje?: string | null;
    codigo?: string | null;
  } | null;
  webhookSaliente?: {
    disparar?: boolean;
    evento?: string | null;
    payload?: any;
  } | null;
} {
  let text = raw || "";

  // 1. Detección y extracción de JSON estructurado canónico (Drael Protocol)
  const structured = extractStructuredJson(text);
  if (structured && (structured.respuesta_cliente || structured.intencion || structured.acciones_crm || structured.mensajes)) {
    let parts: string[] = [];
    if (Array.isArray(structured.respuesta_cliente?.mensajes)) {
      parts = structured.respuesta_cliente.mensajes.map((m: any) => String(m).trim()).filter(Boolean);
    } else if (Array.isArray(structured.respuesta_cliente)) {
      parts = structured.respuesta_cliente.map((m: any) => String(m).trim()).filter(Boolean);
    } else if (typeof structured.respuesta_cliente?.mensajes === "string") {
      parts = [structured.respuesta_cliente.mensajes.trim()];
    } else if (typeof structured.respuesta_cliente === "string") {
      parts = [structured.respuesta_cliente.trim()];
    } else if (Array.isArray(structured.mensajes)) {
      parts = structured.mensajes.map((m: any) => String(m).trim()).filter(Boolean);
    } else if (typeof structured.mensaje === "string") {
      parts = [structured.mensaje.trim()];
    }

    const stageCandidate = structured.acciones_crm?.cambiar_etapa || structured.stage || null;
    let resolvedStage: string | null = null;
    if (stageCandidate && stages && stages.length) {
      const found = stages.find((s) => s.nome.toLowerCase() === String(stageCandidate).toLowerCase());
      resolvedStage = found ? found.nome : String(stageCandidate);
    } else if (stageCandidate) {
      resolvedStage = String(stageCandidate);
    }

    const intentRaw = structured.intencion?.sentimiento || structured.intencion?.categoria || structured.intent || null;
    const intent = intentRaw ? String(intentRaw).toUpperCase() : null;
    const handoff = Boolean(structured.acciones_crm?.pausar_ia_para_humano ?? structured.handoff ?? false);
    const qualified = Boolean(structured.intencion?.calificado ?? structured.qualified ?? false);
    const agendar = structured.acciones_crm?.agendamiento || structured.agendar || null;
    const pixelTracking = structured.tracking_pixel || structured.pixel_tracking || null;
    const codeExecution = structured.ejecucion_codigo || structured.code_execution || null;
    const webhookSaliente = structured.webhook_saliente || structured.outbound_webhook || null;

    const cleanMarker = (s: string) =>
      s
        .replace(/\[\s*(?:TRACKING|PIXEL|WEBHOOK|CODIGO|CODE|EJECUTAR|ESTAGIO|STAGE|AGENDAR|INTENCAO|HANDOFF|QUALIFICADO|SUGESTAO|PRODUTO|PEDIDO)[^\]]*\]/gi, "")
        .trim();

    if (parts.length > 0) {
      const sanitizedParts = parts.map(cleanMarker).filter(Boolean);
      return {
        parts: sanitizedParts.slice(0, 3),
        stage: resolvedStage,
        agendar,
        intent,
        handoff,
        qualified,
        pedido: structured.pedido || null,
        sugestao: structured.sugestao || null,
        produtosSku: Array.isArray(structured.produtos_sku) ? structured.produtos_sku : [],
        rawStructured: structured,
        pixelTracking,
        codeExecution,
        webhookSaliente,
      };
    }
  }
  let stage: string | null = null;
  let agendar: AgendarBrief | null = null;

  const pedidoExtraido = extraiPedido(text);
  const pedido = pedidoExtraido.pedido;
  text = pedidoExtraido.rest;


  const agMatch = text.match(/\[\s*AGENDAR\s*:\s*([^\]]+)\]/i);
  if (agMatch) {
    const parts = agMatch[1].split("|").map((s) => s.trim());
    if (parts.length >= 2) {
      agendar = {
        inicio: parts[0],
        fim: parts[1],
        titulo: (parts[2] || "Agendamento").slice(0, 120),
      };
    }
    text = text.replace(agMatch[0], "").trim();
  }

  const stageMatch = text.match(/\[\s*ESTAGIO\s*:\s*([^\]\n]+)(?:\]|$)/i);
  if (stageMatch) {
    const candidate = stageMatch[1].trim().toLowerCase();
    if (stages && stages.length) {
      const found = stages.find((s) => s.nome.toLowerCase() === candidate);
      if (found) stage = found.nome;
      else {
        // More resilient matching for truncated or fuzzy stage names
        const starts = stages.find((s) => 
          candidate.startsWith(s.nome.toLowerCase()) || 
          s.nome.toLowerCase().startsWith(candidate)
        );
        if (starts) stage = starts.nome;
      }
    } else {
      stage = stageMatch[1].trim();
    }
    text = text.replace(stageMatch[0], "").trim();
  }

  // Detect and extract intent
  const intentMatch = text.match(/\[\s*INTENCAO\s*:\s*(POSITIVA|NEGATIVA|NEUTRA)\]/i);
  const intent = intentMatch ? intentMatch[1].toUpperCase() : null;
  if (intentMatch) text = text.replace(intentMatch[0], "").trim();

  // Detect Handoff
  const handoffPattern = /\[\s*HANDOFF\s*\]/gi;
  const handoff = handoffPattern.test(text);
  text = text.replace(handoffPattern, "").trim();

  // Detect Qualification
  const qualifiedPattern = /\[\s*QUALIFICADO\s*\]/gi;
  const qualified = qualifiedPattern.test(text);
  text = text.replace(qualifiedPattern, "").trim();

  // Detect Suggestion / AI Training Loop (Phase B)
  const sugestaoMatch = text.match(/\[\s*SUGESTAO\s*:\s*([\s\S]*?)\]/i);
  let sugestao: PromptSuggestion | null = null;
  if (sugestaoMatch) {
    const rawContent = sugestaoMatch[1].trim();
    text = text.replace(sugestaoMatch[0], "").trim();

    const parts = rawContent.split(/\|\s*Regra\s*:\s*/i);
    if (parts.length >= 2) {
      const duda = parts[0].replace(/^Duda\s*:\s*/i, "").trim();
      const regra = parts[1].trim();
      sugestao = { duda, regra, raw: rawContent };
    } else {
      sugestao = { duda: rawContent, regra: rawContent, raw: rawContent };
    }
  }

  // B-04: Extrai e remove [PRODUTO:sku] para não expor marcador cru ao cliente
  const produtosSku: string[] = [];
  text = text.replace(/\[\s*PRODUTO\s*:\s*([^\]]+)\]/gi, (_, sku) => {
    const s = String(sku || "").trim();
    if (s && !produtosSku.includes(s)) produtosSku.push(s);
    return "";
  }).trim();

  text = text
    .replace(/\[\s*(?:TRACKING|PIXEL|WEBHOOK|CODIGO|CODE|EJECUTAR|ESTAGIO|STAGE|AGENDAR|INTENCAO|HANDOFF|QUALIFICADO|SUGESTAO|PRODUTO|PEDIDO)[^\]]*\]/gi, "")
    .trim();

  const parts = text
    .split(PART_SEPARATOR)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .slice(0, 3);
  return { parts: parts.length ? parts : [text.trim()].filter(Boolean), stage, agendar, intent, handoff, qualified, pedido, sugestao, produtosSku };

}


export function classifyStagePromptInstruction(): string {
  return (
    "Você é um classificador. Dado o histórico curto de mensagens entre um vendedor e um lead pelo WhatsApp, " +
    "responda APENAS com UMA palavra correspondente ao nome de uma etapa do CRM."
  );
}
