import { lovableAiChat, type ChatMsg } from "@/lib/lovable-ai.server";
import { buildSystemPrompt, parseAiOutput, type AgentConfig } from "@/lib/ai-prompt";
import { redactToolHeaders } from "@/lib/agent-tools.server";

export interface CopilotActionProposal {
  type:
    | "catalog"
    | "rule"
    | "replace_rules"
    | "resolve_suggestion"
    | "config"
    | "simulation"
    | "audit"
    | "test_webhook"
    | "webhook"
    | "tool";
  title: string;
  description: string;
  status: "pending" | "applied" | "rejected" | "failed";
  payload: any;
  sandboxResult?: any;
}

export interface CopilotTurnResult {
  sessionId?: string;
  userMessageId?: string | null;
  assistantMessageId?: string | null;
  reply: string;
  proposals: CopilotActionProposal[];
}

/**
 * Enmascara tokens Bearer y API keys conocidas en texto plano antes de guardar en BD.
 */
export function redactCopilotSecretsInText(text: unknown): string {
  const raw = String(text ?? "");
  if (!raw) return "";
  return raw
    .replace(/(Bearer\s+)[A-Za-z0-9._\-+/=]{8,}/gi, "$1***redacted***")
    .replace(/\b(smp_(?:live|test)|sk|dk|pk_live|pk_test|ghp|xoxb|xoxp)_[A-Za-z0-9_-]{8,}/gi, "***redacted***")
    .replace(/\b(sk-[A-Za-z0-9_-]{12,}|dk-[A-Za-z0-9_-]{8,}|AIza[A-Za-z0-9_-]{12,})/g, "***redacted***")
    .replace(/((?:x-api-key|api-key|apikey|authorization|secret|token)\s*[:=]\s*["']?)[^\s"',;}{]+/gi, "$1***redacted***");
}

function sanitizeJsonValueForStorage(value: any, depth = 0): any {
  if (depth > 8 || value === null || value === undefined) return value;
  if (typeof value === "string") {
    return redactCopilotSecretsInText(value);
  }
  if (Array.isArray(value)) {
    return value.slice(0, 100).map((item) => sanitizeJsonValueForStorage(item, depth + 1));
  }
  if (typeof value === "object") {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) {
      const lower = k.toLowerCase();
      if (lower === "headers" && v && typeof v === "object" && !Array.isArray(v)) {
        out[k] = redactToolHeaders(v);
      } else if (
        (lower === "token" || lower === "secret" || lower === "apikey" || lower === "api_key" || lower === "authorization") &&
        typeof v === "string" &&
        v.trim().length > 0
      ) {
        out[k] = "***redacted***";
      } else {
        out[k] = sanitizeJsonValueForStorage(v, depth + 1);
      }
    }
    return out;
  }
  return value;
}

export function sanitizeSandboxResultForStorage(res: any): any {
  if (!res || typeof res !== "object") return undefined;
  let sample = res.responseSample ?? null;
  if (sample !== null && sample !== undefined) {
    try {
      const serialized = typeof sample === "string" ? sample : JSON.stringify(sample);
      const masked = redactCopilotSecretsInText(serialized);
      sample = masked.length > 1500 ? `${masked.slice(0, 1500)}...` : masked;
    } catch {
      sample = null;
    }
  }
  return {
    ok: Boolean(res.ok),
    status: Number(res.status || 0),
    statusText: String(res.statusText || ""),
    latencyMs: Math.max(0, Number(res.latencyMs || 0)),
    responseSample: sample,
    ...(res.error ? { error: redactCopilotSecretsInText(String(res.error)).slice(0, 300) } : {}),
  };
}

/**
 * Redacta credenciales sensibles (headers Authorization/API Key y tokens en texto claro)
 * antes de persistir propuestas en agent_copilot_messages.
 */
export function sanitizeCopilotProposalsForStorage(
  proposals: CopilotActionProposal[] | null | undefined,
): CopilotActionProposal[] {
  if (!Array.isArray(proposals)) return [];
  return proposals.map((prop) => {
    const clonedPayload = prop?.payload && typeof prop.payload === "object"
      ? sanitizeJsonValueForStorage(prop.payload)
      : {};
    if (clonedPayload?.headers && typeof clonedPayload.headers === "object") {
      clonedPayload.headers = redactToolHeaders(clonedPayload.headers);
    }
    if (clonedPayload?.updates?.headers && typeof clonedPayload.updates.headers === "object") {
      clonedPayload.updates.headers = redactToolHeaders(clonedPayload.updates.headers);
    }
    if (clonedPayload?.sandboxTestResult) {
      clonedPayload.sandboxTestResult = sanitizeSandboxResultForStorage(clonedPayload.sandboxTestResult);
    }

    const sanitizedSandbox = prop?.sandboxResult
      ? sanitizeSandboxResultForStorage(prop.sandboxResult)
      : undefined;

    return {
      type: prop.type,
      title: redactCopilotSecretsInText(prop.title || "Acción recomendada"),
      description: redactCopilotSecretsInText(prop.description || ""),
      status: prop.status || "pending",
      payload: clonedPayload,
      ...(sanitizedSandbox ? { sandboxResult: sanitizedSandbox } : {}),
    };
  });
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
  const thirtyDaysAgoIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

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
      .gte("created_at", thirtyDaysAgoIso)
      .order("created_at", { ascending: false })
      .limit(25),
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
    .filter((s: any) => s.status === "pending")
    .slice(0, 5);

  let agentTools: any[] = [];
  let recentTraces: Array<{ route: string; error: string; latency_ms: number | null; created_at: string }> = [];

  await Promise.all([
    (async () => {
      if (!agentCfg?.id) return;
      try {
        const { data: toolsRows } = await supabase
          .from("agent_tools")
          .select("id, name, display_name, description, kind, method, url, headers, input_schema, body_template, permission_level, verified, verified_at, last_test_status, last_test_latency_ms, active, updated_at")
          .eq("company_id", companyId)
          .eq("agent_id", agentCfg.id)
          .order("created_at", { ascending: true });
        agentTools = (toolsRows ?? []).map((t: any) => ({
          ...t,
          headers: redactToolHeaders(t.headers),
        }));
      } catch {}
    })(),
    (async () => {
      try {
        let traceQuery = supabase
          .from("ai_turn_traces")
          .select("route, error, latency_ms, created_at")
          .eq("company_id", companyId)
          .not("error", "is", null)
          .order("created_at", { ascending: false })
          .limit(5);
        if (agentCfg?.id) {
          traceQuery = traceQuery.eq("agent_id", agentCfg.id);
        }
        const { data: traceRows } = await traceQuery;
        recentTraces = (traceRows ?? [])
          .filter((r: any) => String(r?.error || "").trim().length > 0)
          .map((r: any) => ({
            route: String(r.route || "general"),
            error: String(r.error || "").trim(),
            latency_ms: r.latency_ms ?? null,
            created_at: String(r.created_at || ""),
          }));
      } catch {}
    })(),
  ]);

  return {
    agent: agentCfg as AgentConfig | null,
    produtos: produtos ?? [],
    stages: stages ?? [],
    pendingSuggestions,
    agentTools,
    recentTraces,
    channels: {
      whatsapp: waInstances ?? [],
    },
  };
}

function capText(text: unknown, maxChars: number): string {
  const clean = String(text ?? "").trim();
  if (!clean) return "";
  if (clean.length <= maxChars) return clean;
  return `${clean.slice(0, maxChars).trimEnd()}... [truncado]`;
}

/**
 * Prompt Mestre do Copilot Arquitecto e Entrenador
 */
export function buildCopilotSystemPrompt(context: {
  agent: any;
  produtos: any[];
  stages: any[];
  pendingSuggestions: any[];
  agentTools?: any[];
  recentTraces?: Array<{ route: string; error: string; latency_ms: number | null; created_at: string }>;
  channels: any;
}): string {
  const agent = context.agent || {};
  const produtos = context.produtos || [];
  const suggestions = context.pendingSuggestions || [];

  const catalogSummary = produtos.length > 0
    ? produtos.map((p) => `- ${p.nome}${p.sku ? ` [SKU: ${p.sku}]` : ""}: $${p.preco} (${p.categoria || "Geral"}) ${p.ativo ? "[Activo]" : "[Inactivo]"}`).join("\n")
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

  const agentTools = context.agentTools || [];
  const verifiedToolsSummary = agentTools.length > 0
    ? agentTools
        .map(
          (t: any) =>
            `- [${t.name}] (${t.display_name || t.name}) | Tipo: ${t.kind} | Método: ${t.method} | URL: ${t.url} | Estado: ${t.verified ? "verificada" : "pendiente"} | Activa: ${t.active ? "sí" : "no"} | Permiso: ${t.permission_level} | Uso: ${t.description}`,
        )
        .join("\n")
    : "Sin herramientas verificadas registradas aún.";

  const rawKnowledgeFiles = Array.isArray(agent.knowledge_files) ? agent.knowledge_files : [];
  const ragFilesSummary = rawKnowledgeFiles.length > 0
    ? rawKnowledgeFiles
        .map((f: any) => `- ${f?.name || "Archivo"} | textStatus: ${f?.textStatus || "pendiente"} | textChars: ${Number(f?.textChars || 0)}`)
        .join("\n")
    : "Sin archivos RAG indexados.";

  const recentTraces = context.recentTraces || [];
  const recentErrorsSummary = recentTraces.length > 0
    ? recentTraces
        .map((t) => `- ${t.created_at} | ${t.route} | ${capText(t.error, 180)}`)
        .join("\n")
    : "Sin errores recientes en trazas del motor.";

  const cappedRegras = capText(agent.regras_rigidas, 5000);
  const cappedComoVender = capText(agent.como_vender, 2500);
  const cappedNaoPode = capText(agent.nao_pode_fazer, 1200);
  const cappedFaq = capText(agent.faq, 1200);
  const cappedObjecoes = capText(agent.objecoes, 1200);
  const cappedPoliticas = capText(agent.politicas, 1200);

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
   - 'como_vender', 'nao_pode_fazer', 'faq', 'objecoes', 'politicas': Guion comercial, límites negativos y políticas oficiales.
   - 'produto': Catálogo oficial con precios, categorías y disponibilidad (soporta upsert por SKU o nombre).
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
- Cómo Vender (guion comercial):
${cappedComoVender || "(No configurado)"}
- Qué NO Puede Hacer:
${cappedNaoPode || "(No configurado)"}
- FAQ Configuradas:
${cappedFaq || "(Sin FAQ)"}
- Manejo de Objeciones:
${cappedObjecoes || "(Sin objeciones configuradas)"}
- Políticas:
${cappedPoliticas || "(Sin políticas configuradas)"}
- Reglas Rígidas Actuales:
${cappedRegras || "(Sin reglas rígidas configuradas)"}

ARCHIVOS RAG INDEXADOS (${rawKnowledgeFiles.length}):
${ragFilesSummary}

ÚLTIMOS ERRORES REALES DEL MOTOR (ai_turn_traces):
${recentErrorsSummary}

HERRAMIENTAS VERIFICADAS DEL AGENTE (${agentTools.length}):
${verifiedToolsSummary}

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

FLUJO ESTRICTO PARA WEBHOOKS Y HERRAMIENTAS EXTERNAS:
1. PASO 1 (Descubrimiento): Haz las preguntas necesarias para obtener la URL, método, headers/token, parámetros esperados, nivel de permiso ('read_only', 'write_confirm_customer' o 'write_require_owner_approval') y tipo ('http' para consultar/ejecutar datos o 'webhook_out' para notificar eventos salientes).
2. PASO 2 (Prueba Obligatoria en Sandbox): En cuanto tengas los datos técnicos (o si el usuario te pide probar un endpoint), genera SIEMPRE primero la acción 'test_webhook' para verificar en el sandbox que el endpoint responde con HTTP 2xx y ver la latencia y JSON real.
3. PASO 3 (Guardar Herramienta Verificada): NUNCA guardes una herramienta nueva sin antes haber propuesto probarla con 'test_webhook' y validar HTTP 2xx. Tras comprobarla en el sandbox, genera la acción 'tool' (o 'webhook' si es consulta heredada customerLookup) con 'name' (slug único en minúsculas con guiones bajos), 'display_name', 'description', 'url', 'method', 'headers', 'input_schema', 'body_template', 'test_body' (payload real de prueba), 'permission_level' y 'kind'.

REGLA CRÍTICA DE TIPADO PARA ACCIONES:
- Para webhooks, APIs o herramientas externas:
  * Para pruebas previas obligatorias en el sandbox: usa EXCLUSIVAMENTE "type": "test_webhook"
  * Para guardar una herramienta verificada en la librería del agente (agent_tools): usa "type": "tool" (o "type": "webhook" cuando incluya integration: "customerLookup")
  * NUNCA uses "type": "config" para webhooks ni APIs externas. "config" es sólo para campos nativos como segundos_buffer o sobre_empresa.
- Para reglas nuevas puntuales usa "type": "rule".
- Para LIMPIAR contradicciones, eliminar reglas obsoletas o CONSOLIDAR/REORDENAR todas las 'regras_rigidas', usa "type": "replace_rules" con el texto completo limpio en 'payload.rulesText' (en lugar de seguir apilando parches con "rule").
- Para marcar sugerencias pendientes (ai_prompt_suggestion) como aprobadas o descartadas después de atenderlas o actualizar catálogo/reglas, usa "type": "resolve_suggestion".

ESTRUCTURA OBLIGATORIA DE TU RESPUESTA:
1. RESPUESTA COMPLETA Y SIN CORTES:
   - Responde de forma natural, consultiva y empática en español antes de cualquier bloque técnico.
2. ACCIONES PROPUESTAS ESTRICTAMENTE AL FINAL (solo incluye los tipos que realmente vayas a proponer):

\`\`\`json_actions
[
  { "type": "rule", "title": "Agregar regla", "description": "Motivo breve", "payload": { "ruleText": "- Directiva clara...", "agentId": "${agent.id || ""}" } },
  { "type": "replace_rules", "title": "Consolidar Reglas Rígidas", "description": "Reemplaza reglas eliminando conflictos", "payload": { "rulesText": "- Regla 1...\n- Regla 2...", "reason": "Motivo", "agentId": "${agent.id || ""}" } },
  { "type": "resolve_suggestion", "title": "Resolver sugerencias", "description": "Marca sugerencias pendientes como resueltas o descartadas", "payload": { "suggestionIds": ["uuid"], "resolution": "approved", "note": "..." } },
  { "type": "catalog", "title": "Actualizar Catálogo", "description": "Upsert por SKU/nombre y consolida duplicados", "payload": { "items": [{ "nome": "Producto", "sku": "OPCIONAL", "preco": 10.0, "descricao": "Desc", "categoria": "Cat" }] } },
  { "type": "config", "title": "Ajustar Configuración", "description": "Actualiza campos nativos del agente", "payload": { "agentId": "${agent.id || ""}", "updates": { "segundos_buffer": 5, "tamanho_resposta": "curtas" } } },
  { "type": "test_webhook", "title": "Probar API en Sandbox", "description": "Prueba controlada HTTP 2xx", "payload": { "url": "https://api.ejemplo.com/endpoint", "method": "POST", "headers": { "Authorization": "Bearer token" }, "body": { "phone": "584120000000" } } },
  { "type": "tool", "title": "Guardar Herramienta", "description": "Registra herramienta verificada", "payload": { "name": "slug_unico", "display_name": "Nombre", "description": "Uso", "kind": "http", "method": "POST", "url": "https://api.ejemplo.com/endpoint", "headers": { "Authorization": "Bearer token" }, "input_schema": { "phone": "string" }, "body_template": { "phone": "{{phone}}" }, "test_body": { "phone": "584120000000" }, "permission_level": "read_only" } },
  { "type": "webhook", "title": "Conectar Integración", "description": "Consulta heredada customerLookup", "payload": { "integration": "customerLookup", "name": "API Clientes", "url": "https://api.ejemplo.com/endpoint", "method": "POST", "headers": { "Authorization": "Bearer token" }, "body_template": { "phone": "{{phone}}" }, "test_body": { "phone": "584120000000" }, "ruleText": "- Regla de uso..." } }
]
\`\`\`

3. NUNCA escribas texto conversacional DESPUÉS del bloque \`\`\`json_actions.
4. Si NO tienes acciones que proponer (por ejemplo, si sólo estás aconsejando, analizando o haciendo preguntas de descubrimiento), NO incluyas el bloque \`\`\`json_actions.

REGLAS DE CONDUCTA:
- Si el usuario te pega una lista desordenada de precios o catálogo, extráela limpiamente y propón la acción 'catalog'.
- Si el usuario te pregunta por qué el bot falló o cómo mejorar una duda, diagnostica el motivo con precisión (apoyándote en las reglas y trazas de error si aplica) y propón la acción 'rule' o 'replace_rules'.
- Si detectas que una regla nueva entra en conflicto con una regla existente, ALÉRTALO inmediatamente y propón 'replace_rules' para consolidarlas limpiamente.
- Sé conciso y directo; no aburras al usuario con teoría innecesaria.`;
}

const ACTION_TYPES_RE = /(?:catalog|rule|replace_rules|resolve_suggestion|config|simulation|audit|test_webhook|webhook|tool)/i;

function parseActionsJsonArray(rawJson: string): any[] | null {
  if (!rawJson) return null;
  let parsed: any = null;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    try {
      const cleaned = rawJson
        .replace(/,\s*([}\]])/g, "$1")
        .replace(/\/\*[\s\S]*?\*\/|([^:]|^)\/\/.*$/gm, "");
      parsed = JSON.parse(cleaned);
    } catch {
      const recovered: any[] = [];
      const itemRegex = /{\s*"type"\s*:\s*"(?:catalog|rule|replace_rules|resolve_suggestion|config|simulation|audit|test_webhook|webhook|tool)"[\s\S]*?}(?=\s*,\s*{|\s*\]|\s*$)/g;
      let m: RegExpExecArray | null;
      while ((m = itemRegex.exec(rawJson)) !== null) {
        try {
          recovered.push(JSON.parse(m[0]));
        } catch {
          try {
            const closedCandidate = m[0].trim().replace(/,$/, "") + "}";
            recovered.push(JSON.parse(closedCandidate));
          } catch {}
        }
      }
      parsed = recovered;
    }
  }
  return Array.isArray(parsed) && parsed.length > 0 ? parsed : null;
}

/**
 * Parsea el texto del Copilot para separar la respuesta conversacional
 * de los bloques de acciones estructuradas de forma resiliente contra
 * respuestas truncadas o códigos de ejemplo explicativos.
 */
export function parseCopilotOutput(rawText: string): CopilotTurnResult {
  if (!rawText || typeof rawText !== "string") {
    return { reply: "", proposals: [] };
  }

  let reply = rawText;
  const proposals: CopilotActionProposal[] = [];
  let parsed: any[] | null = null;

  // 1. Prioridad: busca todos los bloques ```json_actions, selecciona el último válido y limpia todos del texto
  const jsonActionMatches = Array.from(rawText.matchAll(/```json_actions\s*([\s\S]*?)(?:```|$)/gi));
  if (jsonActionMatches.length > 0) {
    for (const m of jsonActionMatches) {
      reply = reply.replace(m[0], "");
    }
    reply = reply.trim();

    for (let i = jsonActionMatches.length - 1; i >= 0; i--) {
      const candidate = parseActionsJsonArray(jsonActionMatches[i][1].trim());
      if (candidate) {
        parsed = candidate;
        break;
      }
    }
  } else {
    // 2. Fallback: último bloque ```json o ``` que contenga tipos válidos de acciones del copilot
    const codeBlockMatches = Array.from(rawText.matchAll(/```(?:json)?\s*([\s\S]*?)(?:```|$)/gi));
    for (let i = codeBlockMatches.length - 1; i >= 0; i--) {
      const candidateText = codeBlockMatches[i][1].trim();
      if (candidateText.includes('"type"') && ACTION_TYPES_RE.test(candidateText)) {
        const candidate = parseActionsJsonArray(candidateText);
        if (candidate) {
          parsed = candidate;
          reply = reply.replace(codeBlockMatches[i][0], "").trim();
          break;
        }
      }
    }
  }

  if (Array.isArray(parsed) && parsed.length > 0) {
    for (const item of parsed) {
      if (item?.type && (item?.title || item?.payload)) {
        proposals.push({
          type: item.type,
          title: String(item.title || "Acción recomendada"),
          description: String(item.description || ""),
          status: "pending",
          payload: item.payload || {},
        });
      }
    }
  }

  // Si la respuesta conversacional quedó vacía porque el modelo sólo emitió json_actions,
  // proveer un mensaje amigable por defecto en lugar de una burbuja en blanco
  if (!reply && proposals.length > 0) {
    reply = "He analizado tu solicitud y preparé las siguientes acciones para tu agente:";
  }

  return {
    reply: reply.trim(),
    proposals,
  };
}