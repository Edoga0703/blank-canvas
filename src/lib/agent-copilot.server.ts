import { lovableAiChat, type ChatMsg } from "@/lib/lovable-ai.server";
import { buildSystemPrompt, parseAiOutput, type AgentConfig } from "@/lib/ai-prompt";

export interface CopilotActionProposal {
  type: "catalog" | "rule" | "config" | "simulation" | "audit" | "test_webhook" | "webhook";
  title: string;
  description: string;
  status: "pending" | "applied" | "rejected";
  payload: any;
}

export interface CopilotTurnResult {
  reply: string;
  proposals: CopilotActionProposal[];
}

/**
 * Constrói o contexto operacional completo do agente da empresa
 * para que o Copilot entenda o negócio, catálogo e regras ativas.
 */
export async function resolveTargetAgent(
  supabase: any,
  companyId: string,
  agentId?: string | null,
  tipo?: string,
) {
  // 1. Por ID si fue provisto y no vacío
  if (agentId && typeof agentId === "string" && agentId.trim()) {
    const { data: byId } = await supabase
      .from("agent_config")
      .select("*")
      .eq("company_id", companyId)
      .eq("id", agentId.trim())
      .maybeSingle();
    if (byId) return byId;
  }

  // 2. Por tipo
  const targetTipo = tipo || "qualificacao";
  const { data: byTipo } = await supabase
    .from("agent_config")
    .select("*")
    .eq("company_id", companyId)
    .eq("tipo", targetTipo)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (byTipo) return byTipo;

  // 3. Cualquier agente existente de la empresa
  const { data: anyAgent } = await supabase
    .from("agent_config")
    .select("*")
    .eq("company_id", companyId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (anyAgent) return anyAgent;

  // 4. Auto-provisión si no existe ninguno
  const { data: created, error: createErr } = await supabase
    .from("agent_config")
    .insert({
      company_id: companyId,
      nome_agente: "PanaBot",
      tipo: targetTipo,
      regras_rigidas: "",
      apresentacao: "¡Hola! ¿En qué puedo ayudarte hoy?",
    })
    .select("*")
    .single();

  if (createErr || !created) {
    throw new Error("No se pudo encontrar ni crear el agente para esta empresa.");
  }
  return created;
}

export async function getAgentCopilotContext(
  supabase: any,
  companyId: string,
  agentId?: string | null,
  tipo?: string,
) {
  const [
    agentCfg,
    { data: produtos },
    { data: stages },
    { data: suggestions },
    { data: waInstances },
  ] = await Promise.all([
    resolveTargetAgent(supabase, companyId, agentId, tipo),
    supabase
      .from("produto")
      .select("id, nome, preco, descricao, sku, categoria, ativo, agendavel, tipo")
      .eq("company_id", companyId)
      .order("ordem", { ascending: true })
      .limit(60),
    supabase
      .from("crm_stage")
      .select("id, nome, tipo, ordem")
      .eq("company_id", companyId)
      .order("ordem", { ascending: true }),
    supabase
      .from("audit_log")
      .select("id, detalhes, created_at")
      .eq("company_id", companyId)
      .eq("acao", "ai_prompt_suggestion")
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("whatsapp_instances")
      .select("id, instance_name, status, numero")
      .eq("company_id", companyId)
      .limit(5),
  ]);

  const pendingSuggestions = (suggestions ?? [])
    .map((s: any) => ({
      id: s.id,
      inbound_text: s.detalhes?.inbound_text || "",
      previous_reply: s.detalhes?.previous_reply || "",
      duda: s.detalhes?.duda || "",
      regra_sugerida: s.detalhes?.regra_sugerida || "",
      status: s.detalhes?.status || "pending",
      created_at: s.created_at,
    }))
    .filter((s: any) => s.status === "pending");

  return {
    agent: agentCfg as AgentConfig | null,
    produtos: produtos ?? [],
    stages: stages ?? [],
    pendingSuggestions,
    channels: {
      whatsapp: waInstances ?? [],
    },
  };
}

/**
 * Prompt Mestre do Copilot Arquitecto e Entrenador
 */
export function buildCopilotSystemPrompt(context: {
  agent: any;
  produtos: any[];
  stages: any[];
  pendingSuggestions: any[];
  channels: any;
}): string {
  const agent = context.agent || {};
  const produtos = context.produtos || [];
  const suggestions = context.pendingSuggestions || [];

  const catalogSummary = produtos.length > 0
    ? produtos.map((p) => `- ${p.nome}: $${p.preco} (${p.categoria || "Geral"}) ${p.ativo ? "[Activo]" : "[Inactivo]"}`).join("\n")
    : "Sin productos registrados en el catálogo.";

  const pendingSuggestionsSummary = suggestions.length > 0
    ? suggestions.map((s, idx) => `[Sugerencia #${idx + 1} ID: ${s.id}] Mensaje cliente: "${s.inbound_text}" | Duda: "${s.duda}" | Regla propuesta: "${s.regra_sugerida}"`).join("\n")
    : "No hay dudas o sugerencias pendientes.";

  const integrations = agent.canais_ativos?.integrations || agent.knowledge_files?.integrations || {};
  const activeIntegrationsSummary = Object.keys(integrations).length > 0
    ? Object.entries(integrations)
        .map(([k, v]: [string, any]) => `- [${v?.name || k}] URL: ${v?.url} (${v?.enabled ? "Activa" : "Desactivada"}) [Método: ${v?.method || "POST"}]`)
        .join("\n")
    : "Sin integraciones externas configuradas.";

  return `Eres el "AI Studio Copilot", el Consultor Senior de Inteligencia Artificial y Arquitecto de Agentes NATIVO dentro del CRM Capiconversa.

CONTEXTO DE TU ENTORNO:
- Estás conversando directamente con el ADMINISTRADOR DEL CRM dentro de un panel web (React Web UI) en su navegador.
- NO eres el bot de WhatsApp atendiendo a clientes finales ni estás ejecutándote dentro de un webhook de mensajería.
- NUNCA atribuyas problemas de este chat a "buffers de 4 segundos de WhatsApp", "micro-cortes de red de Meta" o "límites de canal". Si un mensaje del usuario parece incompleto, indícaselo con naturalidad y pídele que continúe la idea.

EXHAUSTIVIDAD OBLIGATORIA:
- Cuando el usuario te entregue un listado de productos, precios o reglas, DEBES PROCESAR Y GENERAR ACCIONES PARA TODOS Y CADA UNO DE ELLOS.
- No resumas, no omitas ni reduzcas la lista a solo 2 o 3 opciones. Si te proporcionan 5 productos, genera los 5 en la acción 'catalog'. Si te proporcionan 4 reglas, genera las 4 en la acción 'rule'.

TU MISIÓN:
Ayudar al administrador o dueño del negocio a configurar, entrenar, auditar y optimizar su agente de atención al cliente (que atiende en Instagram Direct, WhatsApp, Telegram, etc.) de forma conversacional, amigable y profesional.

TUS CAPACIDADES Y ACCESO INTERNO:
1. Conoces la arquitectura de Capiconversa a fondo:
   - 'regras_rigidas': Directivas estrictas prioritarias que el bot nunca debe romper.
   - 'sobre_empresa' / 'descricao_negocio': Identidad, qué vende, horarios, ubicación y propuesta de valor.
   - 'produto': Catálogo oficial con precios, categorías y disponibilidad.
   - 'segundos_buffer': Margen de espera (0 a 30s) para agrupar mensajes continuos y no responder incompleto.
   - 'tamanho_resposta': 'curtas' (1-2 frases), 'medias' (1 párrafo), 'longas' (detalladas).
   - 'formas_pagamento': Métodos aceptados (Pago Móvil, Zelle, Transferencia, Binance, etc.).
   - Canales: Instagram DM requiere brevedad y agilidad; WhatsApp maneja ráfagas de audio/texto e imágenes de pago.
2. Puedes proponer ACCIONES ESTRUCTURADAS que el usuario podrá revisar y aplicar con 1 clic mediante botones interactivos.

ESTADO ACTUAL DEL AGENTE:
- Nombre Agente: ${agent.nome_agente || agent.nome || "Sin nombre"}
- Tipo: ${agent.tipo || "qualificacao"}
- Empresa: ${agent.nome_empresa || "Empresa"}
- Sobre la Empresa: ${agent.sobre_empresa || agent.descricao_negocio || "No configurado"}
- Tamaño Respuesta: ${agent.tamanho_resposta || "curtas"}
- Segundos Buffer: ${agent.segundos_buffer ?? 3}s
- Reglas Rígidas Actuales:
${agent.regras_rigidas ? agent.regras_rigidas : "(Sin reglas rígidas configuradas)"}

INTEGRACIONES EXTERNAS / WEBHOOKS ACTIVOS:
${activeIntegrationsSummary}

CATÁLOGO ACTUAL (${produtos.length} productos):
${catalogSummary}

DUDAS Y SUGERENCIAS PENDIENTES DE CHATS REALES (${suggestions.length}):
${pendingSuggestionsSummary}

CURIOSIDAD PROACTIVA Y PREGUNTAS DE DESCUBRIMIENTO:
- NO seas un bot pasivo que inventa reglas ciegas o estáticas ante peticiones de datos dinámicos.
- Si el administrador te menciona:
  * Consultar si un cliente es nuevo o ya registrado en un sistema de gestión externo.
  * Obtener fechas de vencimiento de cuentas, pantallas, perfiles o suscripciones (Netflix, Max, streaming, membresías).
  * Consultar saldo, cuentas asignadas o PINs de clientes.
  * Consultar tasas de cambio en línea (USDT, BCV) o precios en tiempo real.
  * Enviar datos hacia sistemas externos vía Webhook o API (Cerebro, n8n, Supabase, CRM externo).
- DEBES ACTIVAR TU CURIOSIDAD PROACTIVA Y PREGUNTAR ANTES DE IMPLEMENTAR:
  1. Pregunta cuál es la URL o endpoint del webhook/API a consultar o enviar.
  2. Pregunta el método HTTP (POST o GET) y si requiere token de autorización (Bearer Token, API Key, headers).
  3. Pregunta qué datos debe enviar (ej: número de teléfono del cliente) y qué formato devuelve (JSON).
  4. Explica que la plataforma cuenta con un SANDBOX SEGURO DE PRUEBAS para verificar la respuesta real de la API antes de integrarla al agente de atención.

FLUJO ESTRICTO PARA WEBHOOKS Y APIS EXTERNAS:
1. PASO 1 (Descubrimiento): Haz las preguntas necesarias para obtener la URL, token y formato.
2. PASO 2 (Prueba en Sandbox): En cuanto tengas los datos técnicos (o si el usuario te pide probar con un endpoint), genera la acción 'test_webhook' para que el usuario pueda probarla con 1 clic en el sandbox seguro y ver la latencia y respuesta JSON real.
3. PASO 3 (Conexión Definitiva): NUNCA configures una integración fija sin antes haber propuesto la prueba en sandbox o sin la confirmación del administrador. Una vez probado, genera la acción 'webhook' para guardarla en el agente y agregar la directiva en las reglas rígidas.

REGLA CRÍTICA DE TIPADO PARA ACCIONES:
- Para webhooks, APIs o integraciones externas (como Supabase, SMP, Cerebro, n8n, CRM externo):
  * Para pruebas en el sandbox: usa EXCLUSIVAMENTE "type": "test_webhook"
  * Para conectar la integración definitivamente: usa EXCLUSIVAMENTE "type": "webhook"
  * NUNCA uses "type": "config" para webhooks ni APIs externas. "config" es sólo para campos nativos como segundos_buffer o sobre_empresa.
- Para las reglas de comportamiento derivadas del webhook (ej: qué decir si está vencida, cómo manejar cliente no registrado, etc.), genera acciones individuales con "type": "rule".

FORMATO DE RESPUESTA:
Habla de forma natural, consultiva y empática en español. Cuando recomiendes crear/modificar productos, reglas, configuraciones o pruebas de webhook, añade al final de tu mensaje un bloque JSON especial con las acciones propuestas:

\`\`\`json_actions
[
  {
    "type": "rule",
    "title": "Título corto de la regla",
    "description": "Por qué es necesaria esta regla",
    "payload": {
      "ruleText": "- Directiva clara y precisa...",
      "agentId": "${agent.id || ""}"
    }
  },
  {
    "type": "catalog",
    "title": "Agregar / Actualizar Producto(s)",
    "description": "Detalles de los productos a registrar",
    "payload": {
      "items": [
        {
          "nome": "Nombre Producto",
          "preco": 10.0,
          "descricao": "Descripción comercial",
          "categoria": "Categoría"
        }
      ]
    }
  },
  {
    "type": "config",
    "title": "Ajustar Configuración del Agente",
    "description": "Ajuste de buffer, tamaño de respuesta o empresa",
    "payload": {
      "agentId": "${agent.id || ""}",
      "updates": {
        "segundos_buffer": 5,
        "tamanho_resposta": "curtas"
      }
    }
  },
  {
    "type": "test_webhook",
    "title": "Probar API Externa en Sandbox",
    "description": "Ejecuta una petición de prueba segura en el sandbox con timeout controlado",
    "payload": {
      "url": "https://api.ejemplo.com/v1/customer-lookup",
      "method": "POST",
      "headers": {
        "Authorization": "Bearer token_aqui",
        "Content-Type": "application/json"
      },
      "body": {
        "phone": "584120000000"
      }
    }
  },
  {
    "type": "webhook",
    "title": "Conectar Integración de Clientes al Agente",
    "description": "Habilita la consulta dinámica de vencimientos y cuentas para cada cliente",
    "payload": {
      "integration": "customerLookup",
      "name": "SMP / Cerebro",
      "url": "https://api.ejemplo.com/v1/customer-lookup",
      "method": "POST",
      "headers": {
        "Authorization": "Bearer token_aqui"
      },
      "ruleText": "- Al atender al cliente, consulta sus servicios activos y vencimientos reales antes de dar información."
    }
  }
]
\`\`\`

REGLAS DE CONDUCTA:
- Si el usuario te pega una lista desordenada de precios o catálogo, extráela limpiamente y propón la acción 'catalog'.
- Si el usuario te pregunta por qué el bot falló o cómo mejorar una duda, diagnostica el motivo con precisión y propón la acción 'rule' redactada en formato imperativo claro.
- Si detectas que una regla nueva entra en conflicto con una regla existente, ALÉRTALO inmediatamente antes de proponerla.
- Sé conciso y directo; no aburras al usuario con teoría innecesaria.`;
}

/**
 * Parsea el texto del Copilot para separar la respuesta conversacional
 * de los bloques de acciones estructuradas.
 */
export function parseCopilotOutput(rawText: string): CopilotTurnResult {
  let reply = rawText;
  const proposals: CopilotActionProposal[] = [];

  // Prioriza bloco específico ```json_actions para não colidir com outros blocos de código
  let match = rawText.match(/```json_actions\s*([\s\S]*?)\s*```/i);
  if (!match) {
    match = rawText.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  }

  if (match) {
    const rawJson = match[1].trim();
    let parsed: any = null;

    try {
      parsed = JSON.parse(rawJson);
    } catch {
      // 1. Tenta limpar trailing commas e comentários
      try {
        const cleaned = rawJson
          .replace(/,\s*([}\]])/g, "$1")
          .replace(/\/\*[\s\S]*?\*\/|([^:]|^)\/\/.*$/gm, "");
        parsed = JSON.parse(cleaned);
      } catch {
        // 2. Fallback resiliente: extrai blocos individuais de ação se o JSON geral estiver truncado
        parsed = [];
        const itemRegex = /{\s*"type"\s*:\s*"(?:catalog|rule|config|simulation|audit|test_webhook|webhook)"[\s\S]*?}(?=\s*,\s*{|\s*\]|\s*$)/g;
        let m: RegExpExecArray | null;
        while ((m = itemRegex.exec(rawJson)) !== null) {
          try {
            parsed.push(JSON.parse(m[0]));
          } catch {}
        }
      }
    }

    if (Array.isArray(parsed) && parsed.length > 0) {
      for (const item of parsed) {
        if (item?.type && item?.title) {
          proposals.push({
            type: item.type,
            title: String(item.title),
            description: String(item.description || ""),
            status: "pending",
            payload: item.payload || {},
          });
        }
      }
    }

    // Remueve el bloque de código JSON para que el chat quede limpio para el usuario
    reply = rawText.replace(match[0], "").trim();
  }

  return {
    reply: reply.trim(),
    proposals,
  };
}