import { lovableAiChat, type ChatMsg } from "@/lib/lovable-ai.server";
import { buildSystemPrompt, parseAiOutput, type AgentConfig } from "@/lib/ai-prompt";

export interface CopilotActionProposal {
  type: "catalog" | "rule" | "config" | "simulation" | "audit";
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
export async function getAgentCopilotContext(
  supabase: any,
  companyId: string,
  agentId?: string | null,
  tipo?: string,
) {
  let agentQuery = supabase.from("agent_config").select("*");
  if (agentId) agentQuery = agentQuery.eq("id", agentId);
  else agentQuery = agentQuery.eq("company_id", companyId).eq("tipo", tipo || "qualificacao");

  const [
    { data: agentCfg },
    { data: produtos },
    { data: stages },
    { data: suggestions },
    { data: waInstances },
  ] = await Promise.all([
    agentQuery.maybeSingle(),
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
      .select("id, instance_name, status, phone_number")
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

  return `Eres el "AI Studio Copilot", el Consultor Senior de Inteligencia Artificial y Arquitecto de Agentes NATIVO dentro del CRM Capiconversa.

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

CATÁLOGO ACTUAL (${produtos.length} productos):
${catalogSummary}

DUDAS Y SUGERENCIAS PENDIENTES DE CHATS REALES (${suggestions.length}):
${pendingSuggestionsSummary}

FORMATO DE RESPUESTA:
Habla de forma natural, consultiva y empática en español. Cuando recomiendes crear/modificar productos, reglas o configuraciones, añade al final de tu mensaje un bloque JSON especial con las acciones propuestas:

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

  const jsonBlockRegex = /```(?:json_actions|json)?\s*([\s\S]*?)\s*```/;
  const match = rawText.match(jsonBlockRegex);

  if (match) {
    try {
      const parsed = JSON.parse(match[1]);
      if (Array.isArray(parsed)) {
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
    } catch (e) {
      console.warn("[parseCopilotOutput] JSON actions parse error:", e);
    }
  }

  return {
    reply: reply.trim(),
    proposals,
  };
}
