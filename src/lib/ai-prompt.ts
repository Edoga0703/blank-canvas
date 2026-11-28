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

type PromptLang = "es" | "en" | "pt";

function resolvePromptLang(idioma?: string | null): PromptLang {
  const raw = (idioma || "es").toLowerCase().trim();
  if (raw.startsWith("es") || /español|spanish/i.test(raw)) return "es";
  if (raw.startsWith("en") || /english/i.test(raw)) return "en";
  return "pt";
}

function describeTom(tom: number | null | undefined, lang: PromptLang) {
  const n = typeof tom === "number" ? tom : 70;
  if (lang === "es") {
    if (n <= 25) return "tono serio y sobrio";
    if (n <= 55) return "tono equilibrado y atento";
    if (n <= 80) return "tono cálido y simpático";
    return "tono muy cálido, cercano y amigable";
  }
  if (lang === "en") {
    if (n <= 25) return "serious and restrained tone";
    if (n <= 55) return "balanced and attentive tone";
    if (n <= 80) return "warm and friendly tone";
    return "very warm, close, friendly tone";
  }
  if (n <= 25) return "tom mais sério e contido";
  if (n <= 55) return "tom equilibrado, atencioso";
  if (n <= 80) return "tom caloroso e simpático";
  return "tom muito caloroso, próximo, quase de amigo";
}

function describeFormalidade(f: number | null | undefined, lang: PromptLang) {
  const n = typeof f === "number" ? f : 40;
  if (lang === "es") {
    if (n <= 25) return "lenguaje informal y natural (tuteo cercano, trato amigable)";
    if (n <= 55) return "lenguaje semiformal (tuteo cordial y respetuoso)";
    if (n <= 80) return "lenguaje formal (usted, trato cortés y profesional)";
    return "lenguaje muy formal (ceremonioso y protocolar)";
  }
  if (lang === "en") {
    if (n <= 25) return "casual, informal language";
    if (n <= 55) return "semi-formal, cordial language";
    if (n <= 80) return "formal, professional language";
    return "very formal language";
  }
  if (n <= 25) return "linguagem informal (você, oi, beleza)";
  if (n <= 55) return "linguagem semi-formal (você, com cordialidade)";
  if (n <= 80) return "linguagem formal (senhor/senhora, prezado)";
  return "linguagem muito formal (cerimoniosa)";
}

function describeTamanho(t: string | null | undefined, lang: PromptLang) {
  const key = (t || "curtas").toLowerCase();
  if (lang === "es") {
    switch (key) {
      case "longas": return "respuestas más largas y explicativas cuando tenga sentido";
      case "medias":
      case "médias": return "respuestas de extensión media";
      default: return "respuestas cortas, estilo WhatsApp";
    }
  }
  if (lang === "en") {
    switch (key) {
      case "longas": return "longer, detailed replies when helpful";
      case "medias":
      case "médias": return "medium-length replies";
      default: return "short, WhatsApp-style replies";
    }
  }
  switch (key) {
    case "longas": return "respostas mais longas e explicativas quando fizer sentido";
    case "medias":
    case "médias": return "respostas de tamanho médio";
    default: return "respostas curtas, no estilo WhatsApp";
  }
}

function describePersonalidade(p: string | null | undefined, lang: PromptLang): string {
  const key = (p || "padrao").toLowerCase();
  if (lang === "es") {
    switch (key) {
      case "extrovertido":
        return "personalidad EXTROVERTIDA: animado, entusiasmado, usa exclamaciones con naturalidad y transmite energía positiva sin sonar artificial";
      case "serio":
      case "sério":
        return "personalidad SERIA: postura profesional, objetivo, directo al punto, sin bromas, transmite competencia y seguridad";
      case "divertido":
        return "personalidad DIVERTIDA: con buen humor, ligero, puede hacer comentarios ingeniosos sin perder el profesionalismo";
      case "consultivo":
        return "personalidad CONSULTIVA: actúa como especialista/consultor, hace preguntas inteligentes y recomienda con fundamento";
      case "amigavel":
      case "amigável":
        return "personalidad AMIGABLE: cálido, cercano, muestra interés genuino y trato amable";
      default:
        return "personalidad EQUILIBRADA: amable sin exagerar y profesional sin ser frío";
    }
  }
  if (lang === "en") {
    switch (key) {
      case "extrovertido":
        return "EXTROVERTED personality: lively, enthusiastic, naturally positive energy without sounding robotic";
      case "serio":
      case "sério":
        return "SERIOUS personality: professional posture, objective, straight to the point, no jokes";
      case "divertido":
        return "FUN personality: lighthearted, witty without losing professionalism";
      case "consultivo":
        return "CONSULTATIVE personality: acts as an expert advisor, asks smart questions, recommends clearly";
      case "amigavel":
      case "amigável":
        return "FRIENDLY personality: warm, approachable, genuinely helpful";
      default:
        return "BALANCED personality: friendly without exaggerating, professional without being cold";
    }
  }
  switch (key) {
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

function describeFoco(f: string | null | undefined, lang: PromptLang): string {
  const key = (f || "ambos").toLowerCase();
  if (lang === "es") {
    switch (key) {
      case "vendas":
        return "ENFOQUE PRINCIPAL = VENTAS. Califica, genera interés y guía hacia el cierre. Sin presionar de más, pero sin dejar pasar oportunidades.";
      case "suporte":
        return "ENFOQUE PRINCIPAL = SOPORTE. Resuelve problemas y aclara dudas con claridad y paciencia. No fuerces ventas.";
      default:
        return "ENFOQUE HÍBRIDO: identifica la intención. Si es duda o problema → resuélvelo primero. Si es interés de compra → guía hacia la venta. Haz ambos con naturalidad.";
    }
  }
  if (lang === "en") {
    switch (key) {
      case "vendas":
        return "PRIMARY FOCUS = SALES. Qualify, build interest and guide toward closing without being pushy.";
      case "suporte":
        return "PRIMARY FOCUS = SUPPORT. Solve problems and answer questions clearly and patiently. Do not push sales.";
      default:
        return "HYBRID FOCUS: detect intent. If it is a question or issue -> solve first. If it is buying interest -> guide toward the sale naturally.";
    }
  }
  switch (key) {
    case "vendas":
      return "FOCO PRINCIPAL = VENDAS. Qualifique, gere interesse e conduza pro fechamento. Não seja agressivo, mas não perca oportunidade.";
    case "suporte":
      return "FOCO PRINCIPAL = SUPORTE. Resolva problemas e tire dúvidas com clareza e paciência. Não force venda.";
    default:
      return "FOCO HÍBRIDO: identifique a intenção. Se for dúvida/problema → resolva primeiro. Se for interesse de compra → conduza pra venda. Faça os dois com naturalidade.";
  }
}

function describeEmojis(intensidade: string | null | undefined, legacy: boolean | null | undefined, lang: PromptLang): string {
  const i = (intensidade || (legacy === false ? "nenhum" : "pouco")).toLowerCase();
  if (lang === "es") {
    switch (i) {
      case "nenhum": return "NUNCA uses emojis";
      case "moderado": return "usa emojis con frecuencia moderada (1 por mensaje cuando combine)";
      case "muito": return "usa emojis con soltura para dar vida a la conversación, sin exagerar";
      default: return "usa como máximo 1 emoji ocasional, solo cuando venga bien";
    }
  }
  if (lang === "en") {
    switch (i) {
      case "nenhum": return "NEVER use emojis";
      case "moderado": return "use emojis moderately (around 1 per message when fitting)";
      case "muito": return "use emojis freely to keep the chat lively, without overdoing it";
      default: return "use at most 1 occasional emoji only when fitting";
    }
  }
  switch (i) {
    case "nenhum": return "NUNCA use emojis";
    case "moderado": return "use emojis com frequência moderada (1 por mensagem quando combinar)";
    case "muito": return "use emojis com liberdade pra dar vida à conversa, sem exagerar";
    default: return "use no máximo 1 emoji ocasional, só quando combinar muito";
  }
}

function describeProatividade(p: number | null | undefined, lang: PromptLang): string {
  const n = typeof p === "number" ? p : 50;
  if (lang === "es") {
    if (n <= 25) return "sé REACTIVO: responde solo lo que pregunte el cliente, no anticipes ofertas";
    if (n <= 60) return "sé MODERADAMENTE PROACTIVO: sugiere el siguiente paso cuando tenga sentido";
    return "sé MUY PROACTIVO: anticípate a las necesidades, sugiere upsell/cross-sell y guía activamente hacia el cierre";
  }
  if (lang === "en") {
    if (n <= 25) return "be REACTIVE: only answer what the customer asks, do not push unprompted offers";
    if (n <= 60) return "be MODERATELY PROACTIVE: suggest the next step when it makes sense";
    return "be HIGHLY PROACTIVE: anticipate needs, suggest upsell/cross-sell and actively guide toward closing";
  }
  if (n <= 25) return "seja REATIVO: só responda o que o cliente perguntar, não antecipe ofertas";
  if (n <= 60) return "seja MODERADAMENTE PROATIVO: sugira o próximo passo quando fizer sentido";
  return "seja MUITO PROATIVO: antecipe necessidades, sugira upsell/cross-sell, conduza ativamente pro fechamento";
}

function montaPersonalidade(c: Partial<AgentConfig>, lang: PromptLang): string {
  if (lang === "es") {
    return [
      describePersonalidade(c.personalidade, lang),
      describeTom(c.tom, lang),
      describeFormalidade(c.formalidade, lang),
      describeTamanho(c.tamanho_resposta, lang),
      describeEmojis(c.emoji_intensidade, c.usar_emojis, lang),
      describeProatividade(c.proatividade, lang),
      c.usar_girias ? "puedes usar modismos ligeros y naturales en español" : "evita jergas excesivas o expresiones demasiado informales",
      c.pode_brincar ? "puedes hacer comentarios amenos y breves" : "evita bromas",
      c.chamar_por_nome === false ? "NO llames al cliente por su nombre en cada mensaje" : "llama al cliente por su nombre cuando lo sepas, sin repetirlo en todos los mensajes",
      c.perguntar_uma_por_vez === false ? "" : "haz SIEMPRE una sola pregunta a la vez (nunca varias juntas)",
    ].filter(Boolean).join("; ");
  }
  if (lang === "en") {
    return [
      describePersonalidade(c.personalidade, lang),
      describeTom(c.tom, lang),
      describeFormalidade(c.formalidade, lang),
      describeTamanho(c.tamanho_resposta, lang),
      describeEmojis(c.emoji_intensidade, c.usar_emojis, lang),
      describeProatividade(c.proatividade, lang),
      c.usar_girias ? "light natural idioms are allowed" : "avoid slang or overly casual phrases",
      c.pode_brincar ? "light, tasteful humor is allowed" : "avoid jokes",
      c.chamar_por_nome === false ? "do NOT address the customer by name in every message" : "use the customer's name when known without repeating it every message",
      c.perguntar_uma_por_vez === false ? "" : "ALWAYS ask one question at a time",
    ].filter(Boolean).join("; ");
  }
  return [
    describePersonalidade(c.personalidade, lang),
    describeTom(c.tom, lang),
    describeFormalidade(c.formalidade, lang),
    describeTamanho(c.tamanho_resposta, lang),
    describeEmojis(c.emoji_intensidade, c.usar_emojis, lang),
    describeProatividade(c.proatividade, lang),
    c.usar_girias ? "pode usar gírias leves do cotidiano brasileiro" : "evite gírias e expressões muito informais",
    c.pode_brincar ? "pode fazer brincadeiras pontuais e leves" : "evite brincadeiras",
    c.chamar_por_nome === false ? "NÃO chame o cliente pelo nome a cada mensagem" : "chame o cliente pelo nome quando souber, sem repetir em toda mensagem",
    c.perguntar_uma_por_vez === false ? "" : "faça SEMPRE uma pergunta por vez (nunca dispare várias juntas)",
  ].filter(Boolean).join("; ");
}

const MAX_KNOWLEDGE_CHARS = 15_000;

function buildKnowledgeFilesBloco(knowledgeFiles: unknown, lang: PromptLang): string {
  if (!Array.isArray(knowledgeFiles) || !knowledgeFiles.length) return "";
  const files = knowledgeFiles as any[];
  const comTexto = files.filter((f) => f?.textStatus === "ok" && typeof f?.text === "string" && f.text.trim());
  const pendentes = files.filter((f) => !comTexto.includes(f));
  if (!comTexto.length) return "";

  let restante = MAX_KNOWLEDGE_CHARS;
  const partes: string[] = [];
  const fileLabel = lang === "es" ? "ARCHIVO" : lang === "en" ? "FILE" : "ARQUIVO";
  for (const f of comTexto) {
    if (restante <= 0) break;
    const trecho = String(f.text).slice(0, restante);
    restante -= trecho.length;
    partes.push(`--- ${fileLabel}: ${f.name || "documento"} ---\n${trecho}`);
  }
  const aviso = pendentes.length
    ? lang === "es"
      ? `\n(Otros ${pendentes.length} archivo(s) adjunto(s) aún sin texto indexado — ignora sus nombres y no inventes su contenido.)`
      : lang === "en"
        ? `\n(${pendentes.length} other attached file(s) not indexed yet — ignore their filenames and do not guess their contents.)`
        : `\n(Outros ${pendentes.length} arquivo(s) anexado(s) ainda sem texto indexado — ignore os nomes e não invente o conteúdo deles.)`
    : "";
  const header =
    lang === "es"
      ? "CONTENIDO COMPLETO DE LOS ARCHIVOS DE LA BASE DE CONOCIMIENTO (fuente oficial — úsalo para responder; si la respuesta está aquí, NO digas que no sabes):\n"
      : lang === "en"
        ? "FULL KNOWLEDGE BASE FILE CONTENTS (official source — use to reply; if the answer is here, do NOT say you don't know):\n"
        : "CONTEÚDO COMPLETO DOS ARQUIVOS DA BASE DE CONHECIMENTO (fonte da verdade — use para responder; se a resposta estiver aqui, NÃO diga que não sabe):\n";
  return header + partes.join("\n\n") + aviso;
}


export interface StructuredContextParams {
  canal?: string;
  instanciaNome?: string;
  contatoNumero?: string;
  contatoNome?: string;
  card?: any;
  metaCapiConfig?: any;
  externalData?: any;
  hasWebhookOutTools?: boolean;
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
        ejecucion_sandbox: false,
        lookup_cliente: true,
        mover_etapa_crm: true,
        pausar_chat: true,
        disparar_webhooks: Boolean(params.hasWebhookOutTools),
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
    /** Fragmentos recuperados por RAG Nivel 1 */
    ragChunks?: Array<{ id?: string; source_name: string; content: string; score?: number }>;
    /** Indica si existen chunks RAG indexados en Postgres para este agente */
    hasIndexedRagChunks?: boolean;
    /** Memoria aguda de hechos confirmados del cliente */
    clientMemory?: Record<string, any> | null;
    /** Tarea activa en curso (cita, comprobante, pedido, etc.) */
    activeTask?: Record<string, any> | null;
    /** Flag determinista de posible comprobante de pago detectado en el turno */
    receiptDetected?: boolean;
    /** Herramientas externas verificadas disponibles para este agente */
    verifiedTools?: Array<{
      name: string;
      display_name?: string;
      description: string;
      kind?: string;
      permission_level: string;
      input_schema?: any;
    }>;
  },
): string {
  const partes = opts?.responderEmPartes ?? c.responder_em_partes ?? true;
  const stages = (opts?.stages && opts.stages.length > 0) ? opts.stages : DEFAULT_STAGES;
  const produtos = opts?.produtos ?? [];

  const lang = resolvePromptLang(c.idioma);
  const isEs = lang === "es";
  const isEn = lang === "en";

  const personalidade = montaPersonalidade(c, lang);

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
    ? (isEs
        ? "EJEMPLOS DE ATENCIÓN (sigue el estilo y el criterio de estos):\n" +
          exemplos.map((e, i) => `Ejemplo ${i + 1}\nCliente: ${e.cliente}\nAgente: ${e.agente}`).join("\n\n")
        : isEn
          ? "ATTENDANCE EXAMPLES (follow their style and reasoning):\n" +
            exemplos.map((e, i) => `Example ${i + 1}\nCustomer: ${e.cliente}\nAgent: ${e.agente}`).join("\n\n")
          : "EXEMPLOS DE ATENDIMENTO (siga o estilo e o raciocínio destes):\n" +
            exemplos.map((e, i) => `Exemplo ${i + 1}\nCliente: ${e.cliente}\nAgente: ${e.agente}`).join("\n\n"))
    : "";

  // Feedback (aprendizados)
  const fb = (opts?.feedback || opts?.feedbackHints || []).slice(0, 8);
  const positivos = fb.filter((f) => f.rating === "up");
  const negativos = fb.filter((f) => f.rating === "down");
  const feedbackBloco =
    fb.length
      ? (isEs
          ? "APRENDIZAJES DEL EQUIPO (revisiones humanas — respeta):\n" +
            [
              negativos.length
                ? "❌ Respuestas malas (NO repitas este tipo de frase/error):\n" +
                  negativos.map((f) => `- "${f.texto.slice(0, 220)}"${f.nota ? ` — motivo: ${f.nota.slice(0, 180)}` : ""}`).join("\n")
                : "",
              positivos.length
                ? "✅ Respuestas buenas (mantén este patrón):\n" +
                  positivos.map((f) => `- "${f.texto.slice(0, 220)}"${f.nota ? ` — motivo: ${f.nota.slice(0, 180)}` : ""}`).join("\n")
                : "",
            ].filter(Boolean).join("\n\n")
          : isEn
            ? "TEAM LEARNINGS (human reviews — obey):\n" +
              [
                negativos.length
                  ? "❌ Bad replies (DO NOT repeat this kind of wording/error):\n" +
                    negativos.map((f) => `- "${f.texto.slice(0, 220)}"${f.nota ? ` — reason: ${f.nota.slice(0, 180)}` : ""}`).join("\n")
                  : "",
                positivos.length
                  ? "✅ Good replies (keep this standard):\n" +
                    positivos.map((f) => `- "${f.texto.slice(0, 220)}"${f.nota ? ` — reason: ${f.nota.slice(0, 180)}` : ""}`).join("\n")
                  : "",
              ].filter(Boolean).join("\n\n")
            : "APRENDIZADOS DA EQUIPE (revisões humanas — respeite):\n" +
              [
                negativos.length
                  ? "❌ Respostas ruins (NÃO repita este tipo de fala/erro):\n" +
                    negativos.map((f) => `- "${f.texto.slice(0, 220)}"${f.nota ? ` — motivo: ${f.nota.slice(0, 180)}` : ""}`).join("\n")
                  : "",
                positivos.length
                  ? "✅ Respostas boas (mantenha esse padrão):\n" +
                    positivos.map((f) => `- "${f.texto.slice(0, 220)}"${f.nota ? ` — motivo: ${f.nota.slice(0, 180)}` : ""}`).join("\n")
                  : "",
              ].filter(Boolean).join("\n\n"))
      : "";

  const fmtItem = (p: ProdutoBrief) => {
    const preco = p.preco !== undefined && p.preco !== null && p.preco !== "" ? ` — $ ${p.preco}` : "";
    const desc = p.descricao ? ` (${p.descricao})` : "";
    const sku = p.sku ? ` [sku:${p.sku}]` : "";
    const foto = p.foto_url ? (isEs ? " [tiene foto]" : isEn ? " [has photo]" : " [tem foto]") : "";
    const dur = p.duracao_min ? (isEs ? ` — duración ${p.duracao_min} min` : isEn ? ` — duration ${p.duracao_min} min` : ` — duração ${p.duracao_min} min`) : "";
    const agenda = p.agendavel ? (isEs ? " [agendable]" : isEn ? " [bookable]" : " [agendável]") : "";
    return `• ${p.nome}${preco}${dur}${desc}${sku}${foto}${agenda}`;
  };

  const itensProduto = produtos.filter((p) => (p.tipo ?? "produto") !== "servico");
  const itensServico = produtos.filter((p) => p.tipo === "servico");

  const produtosBloco = produtos.length
    ? (isEs
        ? "CATÁLOGO REAL DE LA EMPRESA (usa ÚNICAMENTE estos artículos y precios):\n" +
          [
            itensProduto.length ? "PRODUCTOS:\n" + itensProduto.map(fmtItem).join("\n") : "",
            itensServico.length ? "SERVICIOS:\n" + itensServico.map(fmtItem).join("\n") : "",
          ].filter(Boolean).join("\n\n") +
          (itensServico.some((s) => s.agendavel)
            ? "\n\nLos servicios marcados como [agendable] pueden agendarse — respeta la duración indicada al proponer horarios."
            : "") +
          "\n\nENVÍO DE PRODUCTO POR WHATSAPP: cuando el cliente demuestre interés en un producto específico de la lista anterior, " +
          "en una nueva línea al final de la respuesta, escribe EXACTAMENTE el marcador: [PRODUTO:sku] (cambia `sku` por el SKU real). " +
          "El sistema enviará automáticamente la foto, nombre, precio y descripción del producto. Puedes enviar hasta 3 productos por respuesta " +
          "(un marcador por línea). Úsalo solo si el producto realmente existe en la lista. NO menciones el marcador en el texto normal — es interno."
        : isEn
          ? "REAL COMPANY CATALOG (use ONLY these items and prices):\n" +
            [
              itensProduto.length ? "PRODUCTS:\n" + itensProduto.map(fmtItem).join("\n") : "",
              itensServico.length ? "SERVICES:\n" + itensServico.map(fmtItem).join("\n") : "",
            ].filter(Boolean).join("\n\n") +
            (itensServico.some((s) => s.agendavel)
              ? "\n\nServices marked [bookable] can be scheduled — respect the listed duration when proposing slots."
              : "") +
            "\n\nPRODUCT SENDING VIA WHATSAPP: when the customer shows interest in a specific listed product, " +
            "on a new line at the end, write EXACTLY: [PRODUTO:sku]. Up to 3 products per reply. Do NOT mention the tag to the customer."
          : "CATÁLOGO REAL DA EMPRESA (use SOMENTE estes itens e preços):\n" +
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
            "(um marcador por linha). Só use se o produto realmente existe na lista. NÃO cite o marcador na fala normal — ele é interno.")
    : "";


  const stageNames = stages.map((s) => s.nome).join(" | ");
  const stagesFinaisNomes = stages.filter((s) => s.tipo === "ganho" || s.tipo === "perda").map((s) => s.nome);

  const canalNome = opts?.canal || "WhatsApp";
  const empresaNome = opts?.companyName || c.nome_empresa || "(empresa)";
  const hasCustomPlaybook = Boolean(c.como_vender && String(c.como_vender).trim());

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

    describeFoco(c.foco_atendimento, lang),
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
    opts?.ragChunks && opts.ragChunks.length > 0
      ? (isEs
          ? "FRAGMENTOS RELEVANTES DE LA BASE DE CONOCIMIENTO (fuente oficial — úsalos y cita la fuente si ayuda):\n"
          : isEn
            ? "RELEVANT KNOWLEDGE BASE EXCERPTS (official source — use them accurately):\n"
            : "TRECHOS RELEVANTES DA BASE DE CONHECIMENTO (fonte oficial — use para responder com precisão):\n") +
        opts.ragChunks.map((ch) => `[Fuente: ${ch.source_name}]\n${ch.content}`).join("\n\n")
      : !opts?.hasIndexedRagChunks
        ? buildKnowledgeFilesBloco(c.knowledge_files, lang)
        : "",
    opts?.clientMemory && typeof opts.clientMemory === "object" && Object.keys(opts.clientMemory).length > 0
      ? (isEs
          ? `MEMORIA PERSISTENTE DEL CLIENTE (hechos ya confirmados — no vuelvas a preguntar esto):\n${JSON.stringify(opts.clientMemory)}`
          : isEn
            ? `PERSISTENT CLIENT MEMORY (confirmed facts — do not re-ask):\n${JSON.stringify(opts.clientMemory)}`
            : `MEMÓRIA PERSISTENTE DO CLIENTE (fatos já confirmados — não pergunte novamente):\n${JSON.stringify(opts.clientMemory)}`)
      : "",
    opts?.activeTask && typeof opts.activeTask === "object" && Object.keys(opts.activeTask).length > 0
      ? (isEs
          ? `TAREA EN CURSO CON ESTE CLIENTE:\n${JSON.stringify(opts.activeTask)}`
          : isEn
            ? `ACTIVE TASK IN PROGRESS:\n${JSON.stringify(opts.activeTask)}`
            : `TAREFA EM ANDAMENTO COM ESTE CLIENTE:\n${JSON.stringify(opts.activeTask)}`)
      : "",
    opts?.receiptDetected
      ? (isEs
          ? "DIRECTIVA OBLIGATORIA DE COMPROBANTE DE PAGO: El cliente envió un posible comprobante de pago. NUNCA confirmes ni apruebes el pago por tu cuenta; agradece el envío e indica que el equipo lo verificará en breve."
          : isEn
            ? "MANDATORY PAYMENT RECEIPT DIRECTIVE: The customer sent a possible payment receipt. NEVER confirm or approve payment yourself; thank them and let them know the team will verify it shortly."
            : "DIRETIVA OBRIGATÓRIA DE COMPROVANTE: O cliente enviou um possível comprovante de pagamento. NUNCA confirme nem aprove o pagamento por conta própria; agradeça o envio e informe que a equipe irá verificar em breve.")
      : "",

    opts?.verifiedTools && opts.verifiedTools.length > 0
      ? (isEs
          ? "HERRAMIENTAS EXTERNAS VERIFICADAS (úsalas SOLO si necesitas consultar o ejecutar datos reales en sistemas externos; si tipo='http', devuelve \"usar_herramienta\": {\"nombre\":\"slug\",\"argumentos\":{}}; si tipo='webhook_out', usa \"webhook_saliente\"; si permission_level='write_confirm_customer' pide confirmación primero y envía customer_confirmed:true; si es 'write_require_owner_approval' NO inventes ejecución y avisa que requiere aprobación del dueño):\n"
          : isEn
            ? "VERIFIED EXTERNAL TOOLS (call with \"usar_herramienta\" for kind='http' or \"webhook_saliente\" for kind='webhook_out'):\n"
            : "FERRAMENTAS EXTERNAS VERIFICADAS (use \"usar_herramienta\" para tipo='http' ou \"webhook_saliente\" para tipo='webhook_out'):\n") +
        opts.verifiedTools
          .map((t) => {
            const schemaStr = t.input_schema && Object.keys(t.input_schema).length > 0 ? JSON.stringify(t.input_schema) : "{}";
            return `- slug: "${t.name}" | tipo: ${t.kind || "http"} | permiso: ${t.permission_level} | esquema: ${schemaStr} | descripción: ${t.description}`;
          })
          .join("\n")
      : "",

    c.agendamento_ativo
      ? (isEs
          ? `AGENDAMIENTO ACTIVO: puedes proponer horarios para ${c.servicos_agendaveis || "los servicios agendables"}. Duración estándar: ${c.duracao_padrao || "30 min"}. Horarios disponibles: ${c.horarios_disponiveis || "(no informado)"}. Anticipación mínima: ${c.antecedencia_min || "2 horas"}. Siempre confirma nombre y el mejor horario antes de cerrar la cita.`
          : `AGENDAMENTO ATIVO: você pode propor horários para ${c.servicos_agendaveis || "os serviços agendáveis"}. Duração padrão: ${c.duracao_padrao || "30 min"}. Janelas disponíveis: ${c.horarios_disponiveis || "(não informado)"}. Antecedência mínima: ${c.antecedencia_min || "2 horas"}. Sempre confirme nome e o melhor horário antes de fechar o agendamento.`)
      : "",

    (Array.isArray(c.handoff_user_ids) && c.handoff_user_ids.length)
      ? (isEs
          ? `TRANSFERENCIA A HUMANO (solo transfiere cuando sea necesario o el cliente lo solicite):
- Si el cliente pide EXPLÍCITAMENTE hablar con una persona, asesor o humano (incluso en el primer mensaje), transfiere de inmediato sin retenerlo ni insistir.
- Para casos sin solicitud explícita, califica brevemente antes (nombre, necesidad, urgencia).
- También transfiere si es un reclamo serio/sensible (legal, conflicto grave) o está claramente fuera de tu alcance según "LO QUE NO PUEDES HACER".
- Duda simple, consulta de precio o saludo sin petición de humano — no transfieras, sigue atendiendo.
- Cuando decidas transferir: avisa en una frase corta que llamarás a ${opts?.handoffTargetNome || "un asesor del equipo"} y, en una NUEVA LÍNEA al final, escribe EXACTAMENTE el marcador: [HANDOFF]`
          : isEn
          ? `HUMAN HANDOFF (hand off when needed or explicitly requested):
- If the customer EXPLICITLY asks to speak with a human/person/agent (even on the first message), hand off immediately.
- Otherwise, briefly qualify first (name, need, urgency) or hand off on serious complaints / out-of-scope requests.
- When handing off, notify in one short sentence and on a NEW LINE write: [HANDOFF]`
          : `TRANSFERÊNCIA PARA HUMANO (transfira quando necessário ou quando o cliente pedir):
- Se o cliente pedir EXPLICITAMENTE falar com um humano, atendente, pessoa ou vendedor (mesmo na primeira mensagem), transfira imediatamente sem reter.
- Sem pedido explícito, qualifique brevemente antes (nome, necessidade, urgência).
- Também transfira em reclamação séria/sensível (jurídico, atrito grave) ou assunto fora do seu escopo listado em "NÃO pode fazer".
- Dúvida simples, preço ou saudação sem pedido de humano — não transfira, continue atendendo.
- Quando decidir transferir: avise em uma frase curta que vai chamar ${opts?.handoffTargetNome || "um atendente do time"} e, em uma NOVA LINHA ao final, escreva EXATAMENTE o marcador: [HANDOFF]`)
      : c.telefone_transferencia
      ? (isEs
          ? `Si el cliente pide atención humana (incluso en la primera respuesta) o tiene un reclamo sensible, indícale de inmediato comunicarse con ${c.telefone_transferencia}.`
          : `Se o cliente pedir atendimento humano (mesmo na primeira mensagem) ou tiver reclamação sensível, oriente imediatamente a falar com ${c.telefone_transferencia}.`)
      : (isEs
          ? "Si el cliente pide atención humana (incluso en el primer mensaje), di educadamente que llamarás a alguien del equipo."
          : "Se o cliente pedir atendimento humano (mesmo na primeira mensagem), diga educadamente que vai chamar alguém do time."),

    opts?.resumoContato ? (isEs ? `Contexto del contacto: ${opts.resumoContato}` : `Contexto do contato: ${opts.resumoContato}`) : "",
    opts?.estagioAtual ? (isEs ? `Etapa actual en el CRM: ${opts.estagioAtual}.` : `Estágio atual no CRM: ${opts.estagioAtual}.`) : "",

    hasCustomPlaybook
      ? (isEs
          ? `RESGUARDO DE GUION Y ESTILO:
- Sigue ESTRICTAMENTE el "GUION OFICIAL DE ESTE AGENTE" y respeta siempre "LO QUE NO PUEDES HACER". Nunca inventes precios, políticas ni stock; si falta algún dato o piden humano, transfiere al equipo.
- Idioma: Español natural, fluido y cercano, mensajes cortos estilo WhatsApp (PROHIBIDO portugués o mezclar idiomas).`
          : isEn
          ? `PLAYBOOK & STYLE SAFEGUARD:
- STRICTLY follow the "OFFICIAL AGENT PLAYBOOK" and respect "WHAT YOU CANNOT DO". Never invent prices or stock; hand off if data is missing or human help is requested.
- Language: Natural, concise English chat style.`
          : `RESGUARDO DE ROTEIRO E ESTILO:
- Siga ESTRITAMENTE o "ROTEIRO OFICIAL DESTE AGENTE" e respeite sempre o que está em "NÃO pode fazer". Nunca invente preços ou dados; se faltar informação ou pedirem humano, transfira para a equipe.
- Idioma: Português do Brasil natural, frases curtas no estilo WhatsApp.`)
      : isEs
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

  if (c.agendamento_ativo && opts?.googleConectado) {
    const nowIso = new Date().toISOString();
    blocos.push(
      isEs
        ? `AGENDAMIENTO (Google Calendar): Hoy es ${nowIso} (UTC). Si el cliente confirma una cita con día y hora para un servicio agendable, registra las fechas en el campo "agendamiento" del JSON (huso -03:00). Duración estándar: ${c.duracao_padrao || "30 min"}.`
        : `AGENDAMENTO (Google Agenda): Hoje é ${nowIso} (UTC, fuso America/Sao_Paulo). Quando o cliente confirmar um horário para serviço agendável, preencha o campo "agendamiento" do JSON. Duração padrão: ${c.duracao_padrao || "30 min"}.`
    );
  }

  // PROTOCOLO UNIVERSAL DE RESPUESTA EN FORMATO JSON CANÓNICO (VÁLIDO PARA TODOS LOS MODELOS E INTEGRACIONES)
  blocos.push(
    isEs
      ? `═══════════════════════════════════════════════════════
FORMATO DE RESPUESTA OBLIGATORIO (PROTOCOLO JSON CANÓNICO):
Tu respuesta DEBE ser SIEMPRE y EXCLUSIVAMENTE un objeto JSON válido, sin texto adicional fuera del JSON.

ESQUEMA OBLIGATORIO:
{
  "respuesta_cliente": {
    "mensajes": [
      "Mensaje 1 directo para el cliente..."
    ],
    "tono": "amigable"
  },
  "intencion": {
    "categoria": "CONSULTA_PRECIO | CONSULTA_VENCIMIENTO | RECLAMO | COMPRA | DUDA | NEUTRA",
    "sentimiento": "POSITIVA | NEGATIVA | NEUTRA",
    "calificado": false
  },
  "acciones_crm": {
    "cambiar_etapa": "${stageNames} | null",
    "pausar_ia_para_humano": false,
    "agregar_etiquetas": []
  },
  "agendamiento": null,
  "pedido": null,
  "sugestao": null,
  "tracking_pixel": null,
  "webhook_saliente": null,
  "usar_herramienta": null,
  "memoria_cliente": null,
  "tarea_activa": null
}

DIRECTIVAS ESTRICTAS DE CADA CAMPO:
1. "respuesta_cliente.mensajes":
   - Array con 1 a 3 mensajes cortos (o array vacío [] ÚNICAMENTE si una Regla Estricta exige silencio total al derivar con pausar_ia_para_humano: true).
   - Cada string en el array representa una burbuja de chat. Si 1 sola frase resuelve, pon un array con 1 solo mensaje.
   - Lenguaje natural, empático, conciso y profesional. NUNCA incluyas código, JSON ni etiquetas dentro del texto para el cliente.
2. "intencion":
   - "categoria": clasifica el motivo principal del mensaje.
   - "sentimiento": "POSITIVA", "NEGATIVA" o "NEUTRA".
   - "calificado": true ÚNICAMENTE cuando ya se hayan obtenido los datos necesarios (nombre, necesidad, urgencia) y el lead esté calificado para avanzar.
3. "acciones_crm":
   - "cambiar_etapa": elige 1 etapa entre las etapas reales del CRM (${stageNames}) si la conversación amerita mover al lead, o null si permanece en la etapa actual. ${stagesFinaisNomes.length ? `(Usa etapas finales como ${stagesFinaisNomes.join(" / ")} ÚNICAMENTE ante confirmación o rechazo explícito).` : ""}
   - "pausar_ia_para_humano": true si el cliente solicita expresamente hablar con un humano o si se requiere atención personalizada inmediata.
4. "agendamiento":
   - Si el cliente confirmó una fecha y hora específica para un servicio agendable: { "inicio": "AAAA-MM-DDTHH:MM", "fim": "AAAA-MM-DDTHH:MM", "titulo": "Cita" }, de lo contrario null.
5. "pedido":
   - Si el cliente confirmó formalmente un pedido: { "itens": [{"nome": "nombre", "qtd": 1, "valor": 0}], "entrega": "retirada", "pagamento": "metodo_acordado" }, de lo contrario null.
6. "sugestao":
   - Si detectas alguna ambigüedad o duda no cubierta en tus reglas rígidas: { "duda": "explicación", "regra": "regla sugerida" }, de lo contrario null.
7. "memoria_cliente":
   - Opcional: objeto clave-valor corto con hechos nuevos confirmados del cliente (ej. {"ciudad": "Caracas", "interes": "Plan Pro"}), o null.
8. "tarea_activa":
   - Opcional: { "tipo": "booking|verify_payment|order|support", "estado": "...", "datos": {} } si hay una tarea en curso o se completó, o null si no aplica.
9. "usar_herramienta":
   - Opcional: si necesitas ejecutar una herramienta HTTP verificada de la lista ("tipo: http"), usa { "nombre": "slug", "argumentos": {} }, de lo contrario null.
10. "webhook_saliente":
   - Opcional: si necesitas emitir un evento hacia un webhook_out verificado y capacidades_activas.disparar_webhooks es true, usa { "disparar": true, "evento": "slug_o_evento", "payload": {} }, de lo contrario null.
═══════════════════════════════════════════════════════`
      : `═══════════════════════════════════════════════════════
FORMATO DA RESPOSTA OBRIGATÓRIO (PROTOCOLO JSON CANÔNICO):
Sua resposta DEVE ser SEMPRE e EXCLUSIVAMENTE um objeto JSON válido, sem texto fora do JSON.

ESQUEMA OBRIGATÓRIO:
{
  "respuesta_cliente": {
    "mensajes": [
      "Mensagem 1 direta para o cliente..."
    ],
    "tono": "amigavel"
  },
  "intencion": {
    "categoria": "CONSULTA_PRECIO | CONSULTA_VENCIMIENTO | RECLAMO | COMPRA | DUDA | NEUTRA",
    "sentimiento": "POSITIVA | NEGATIVA | NEUTRA",
    "calificado": false
  },
  "acciones_crm": {
    "cambiar_etapa": "${stageNames} | null",
    "pausar_ia_para_humano": false,
    "agregar_etiquetas": []
  },
  "agendamiento": null,
  "pedido": null,
  "sugestao": null,
  "tracking_pixel": null,
  "webhook_saliente": null,
  "usar_herramienta": null,
  "memoria_cliente": null,
  "tarea_activa": null
}

DIRETIVAS ESTRITAS DE CADA CAMPO:
1. "respuesta_cliente.mensajes":
   - Array com 1 a 3 mensagens curtas no estilo WhatsApp / Instagram (ou array vazio [] UNICAMENTE se uma Regra Rígida exigir silêncio total ao transferir com pausar_ia_para_humano: true).
   - Cada elemento é uma bolha de chat. Se 1 frase resolver, inclua apenas 1 elemento. NUNCA mais de 3.
   - NUNCA inclua JSON ou marcadores internos dentro do texto visível para o cliente.
2. "intencion":
   - "categoria": motivo da mensagem.
   - "sentimiento": "POSITIVA", "NEGATIVA" ou "NEUTRA".
   - "calificado": true APENAS quando obtiver os dados essenciais e o lead estiver pronto para avançar.
3. "acciones_crm":
   - "cambiar_etapa": escolha 1 etapa real do CRM (${stageNames}) se a conversa justificar, ou null para manter. ${stagesFinaisNomes.length ? `(Use etapas finais como ${stagesFinaisNomes.join(" / ")} APENAS se o cliente confirmou ou recusou claramente).` : ""}
   - "pausar_ia_para_humano": true se o cliente pedir expressamente para falar com um humano.
4. "agendamiento":
   - Se o cliente confirmou data e hora: { "inicio": "AAAA-MM-DDTHH:MM", "fim": "AAAA-MM-DDTHH:MM", "titulo": "Agendamento" }, senão null.
5. "pedido":
   - Se o cliente confirmou um pedido: { "itens": [{"nome": "item", "qtd": 1, "valor": 0}], "entrega": "...", "pagamento": "..." }, senão null.
6. "sugestao":
   - Se detectar ambiguidade ou dúvida não coberta nas regras: { "duda": "...", "regra": "..." }, senão null.
7. "memoria_cliente":
   - Opcional: objeto chave-valor curto com novos fatos confirmados do cliente (ex. {"cidade": "SP", "plano": "Pro"}), ou null.
8. "tarea_activa":
   - Opcional: { "tipo": "booking|verify_payment|order|support", "estado": "...", "datos": {} } se houver tarefa em curso/concluída, ou null.
9. "usar_herramienta":
   - Opcional: se precisar consultar/executar uma ferramenta HTTP verificada da lista ("tipo: http"), use { "nombre": "slug", "argumentos": {} }, senão null.
10. "webhook_saliente":
   - Opcional: se precisar disparar um webhook_out verificado e capacidades_activas.disparar_webhooks for true, use { "disparar": true, "evento": "slug_ou_evento", "payload": {} }, senão null.
═══════════════════════════════════════════════════════`
  );

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
 * Es ultra-resiliente contra respuestas cortadas a mitad de JSON (ej: truncadas en "tono": ").
 */
function extractStructuredJson(raw: string): any | null {
  if (!raw || typeof raw !== "string") return null;
  const trimmed = raw.trim();

  // 1. JSON estándar cerrado
  if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
    try {
      return JSON.parse(trimmed);
    } catch {}
  }

  // 2. Bloque markdown ```json ... ```
  const mdMatch = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (mdMatch) {
    try {
      return JSON.parse(mdMatch[1].trim());
    } catch {}
  }

  // 3. Substring entre la primera y última llave
  const firstBrace = raw.indexOf("{");
  const lastBrace = raw.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    const candidate = raw.slice(firstBrace, lastBrace + 1).trim();
    try {
      return JSON.parse(candidate);
    } catch {}
  }

  // 4. Extracción resiliente para JSON truncado o incompleto (ej: cortado en "tono": ")
  if (raw.includes('"respuesta_cliente"') || raw.includes('"mensajes"')) {
    const extracted: any = { respuesta_cliente: { mensajes: [] } };

    // Intenta extraer el array de mensajes: "mensajes": [ "..." ]
    const msgArrayMatch = raw.match(/"mensajes"\s*:\s*\[([\s\S]*?)\]/i);
    if (msgArrayMatch) {
      const stringMatches = Array.from(msgArrayMatch[1].matchAll(/"((?:\\.|[^"\\])*)"/g));
      if (stringMatches.length > 0) {
        extracted.respuesta_cliente.mensajes = stringMatches.map((m) => {
          try { return JSON.parse(`"${m[1]}"`); } catch { return m[1]; }
        });
      }
    } else {
      // Si el array quedó sin cerrar: "mensajes": [ "mensaje..."
      const unclosedMsgMatch = raw.match(/"mensajes"\s*:\s*\[\s*"((?:\\.|[^"\\])*)"/i);
      if (unclosedMsgMatch) {
        try {
          extracted.respuesta_cliente.mensajes = [JSON.parse(`"${unclosedMsgMatch[1]}"`)];
        } catch {
          extracted.respuesta_cliente.mensajes = [unclosedMsgMatch[1]];
        }
      } else {
        // Clave directa: "respuesta_cliente": "mensaje..."
        const singleMsgMatch = raw.match(/"respuesta_cliente"\s*:\s*"((?:\\.|[^"\\])*)"/i);
        if (singleMsgMatch) {
          try {
            extracted.respuesta_cliente.mensajes = [JSON.parse(`"${singleMsgMatch[1]}"`)];
          } catch {
            extracted.respuesta_cliente.mensajes = [singleMsgMatch[1]];
          }
        }
      }
    }

    // Extraer etapa si existe
    const stageMatch = raw.match(/"cambiar_etapa"\s*:\s*"([^"]+)"/i);
    if (stageMatch && stageMatch[1] !== "null") {
      extracted.acciones_crm = { cambiar_etapa: stageMatch[1] };
    }

    // Extraer intención si existe
    const intentMatch = raw.match(/"(?:categoria|sentimiento|intent)"\s*:\s*"([^"]+)"/i);
    if (intentMatch) {
      extracted.intencion = { categoria: intentMatch[1], sentimiento: intentMatch[1] };
    }

    if (Array.isArray(extracted.respuesta_cliente?.mensajes) && extracted.respuesta_cliente.mensajes.length > 0) {
      return extracted;
    }
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
  toolCall?: {
    nombre: string;
    argumentos: Record<string, any>;
  } | null;
  clientMemoryUpdate?: Record<string, any> | null;
  activeTaskUpdate?: Record<string, any> | null;
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
    const agendar = structured.agendamiento || structured.acciones_crm?.agendamiento || structured.agendar || null;
    const pixelTracking = structured.tracking_pixel || structured.pixel_tracking || null;
    const codeExecution = structured.ejecucion_codigo || structured.code_execution || null;
    const webhookSaliente = structured.webhook_saliente || structured.outbound_webhook || null;

    const rawToolCall = structured.usar_herramienta ?? structured.tool_call;
    const toolCall =
      rawToolCall &&
      typeof rawToolCall === "object" &&
      !Array.isArray(rawToolCall) &&
      typeof rawToolCall.nombre === "string" &&
      rawToolCall.nombre.trim()
        ? {
            nombre: rawToolCall.nombre.trim(),
            argumentos:
              rawToolCall.argumentos &&
              typeof rawToolCall.argumentos === "object" &&
              !Array.isArray(rawToolCall.argumentos)
                ? rawToolCall.argumentos
                : {},
          }
        : null;

    const rawMem = structured.memoria_cliente ?? structured.client_memory;
    const clientMemoryUpdate =
      rawMem && typeof rawMem === "object" && !Array.isArray(rawMem) && Object.keys(rawMem).length > 0
        ? (rawMem as Record<string, any>)
        : null;

    const rawTask = structured.tarea_activa ?? structured.active_task;
    const activeTaskUpdate =
      rawTask && typeof rawTask === "object" && !Array.isArray(rawTask) && Object.keys(rawTask).length > 0
        ? (rawTask as Record<string, any>)
        : null;

    const skusFromParts: string[] = [];
    const cleanMarker = (s: string) => {
      const prodMatches = s.matchAll(/\[PRODUTO:([^\]]+)\]/gi);
      for (const m of prodMatches) {
        if (m[1]) skusFromParts.push(m[1].trim());
      }
      return s
        .replace(/\[\s*(?:TRACKING|PIXEL|WEBHOOK|CODIGO|CODE|EJECUTAR|ESTAGIO|STAGE|AGENDAR|INTENCAO|HANDOFF|QUALIFICADO|SUGESTAO|PRODUTO|PEDIDO)[^\]]*\]/gi, "")
        .trim();
    };

    const sanitizedParts = parts.map(cleanMarker).filter(Boolean);
    const combinedSkus = Array.from(
      new Set([
        ...(Array.isArray(structured.produtos_sku) ? structured.produtos_sku : []),
        ...(Array.isArray(structured.acciones_crm?.produtos_sku) ? structured.acciones_crm.produtos_sku : []),
        ...skusFromParts,
      ]),
    );

    return {
      parts: sanitizedParts.slice(0, 3),
      stage: resolvedStage,
      agendar,
      intent,
      handoff,
      qualified,
      pedido: structured.pedido || null,
      sugestao: structured.sugestao || null,
      produtosSku: combinedSkus,
      rawStructured: structured,
      pixelTracking,
      codeExecution,
      webhookSaliente,
      toolCall,
      clientMemoryUpdate,
      activeTaskUpdate,
    };
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
  const rawParts = parts.length ? parts : [text.trim()].filter(Boolean);
  // Limpieza de seguridad final: Si algún fragmento contiene JSON crudo ({ "respuesta_cliente"...), extraer solo el mensaje
  const sanitized = rawParts.map((part) => {
    let p = part.trim();
    if (p.startsWith("{") && (p.includes('"respuesta_cliente"') || p.includes('"mensajes"'))) {
      const match = p.match(/"(?:mensajes|respuesta_cliente)"\s*:\s*(?:\[\s*)?"((?:\\.|[^"\\])*)"/i);
      if (match) {
        try { return JSON.parse(`"${match[1]}"`).trim(); } catch { return match[1].trim(); }
      }
    }
    return p;
  }).filter(Boolean);

  return { parts: sanitized, stage, agendar, intent, handoff, qualified, pedido, sugestao, produtosSku, toolCall: null };

}


export function classifyStagePromptInstruction(): string {
  return (
    "Você é um classificador. Dado o histórico curto de mensagens entre um vendedor e um lead pelo WhatsApp, " +
    "responda APENAS com UMA palavra correspondente ao nome de uma etapa do CRM."
  );
}
