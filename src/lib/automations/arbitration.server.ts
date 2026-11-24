// src/lib/automations/arbitration.server.ts
/**
 * Módulo de Arbitraje Síncrono y Normalización de Eventos (Capiversa v1.3.07)
 * 
 * Regla 1: Al recibir un mensaje entrante (WhatsApp/DM), verifica de forma síncrona
 * si hace match con un flujo publicado antes de invocar a la IA libre (ai-engine.server.ts).
 * 
 * Regla 2: Filtros y cooldown configurable para comentarios de Meta (Facebook/Instagram).
 */

import type { WorkflowGraph } from "./schema";

/**
 * Normaliza un texto removiendo acentos (diacríticos), emojis, caracteres de puntuación especiales
 * y convirtiendo a minúsculas para comparaciones semánticas de palabras clave resistentes a variaciones.
 * Ejemplos: "¡QUIERO! 😍" -> "quiero", "Información, por favor." -> "informacion por favor"
 */
export function normalizeKeywordText(text: string): string {
  if (!text) return "";
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // quita tildes / diacríticos
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ") // reemplaza signos de puntuación y emojis por espacios
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Comprueba si un texto coincide con un conjunto de palabras clave configuradas.
 * - Si keywords está vacío o no se definió, se considera que coincide (sin restricción).
 * - Palabras de longitud <= 3 letras (ej. "si", "no", "ver", "ola") requieren coincidencia de palabra completa exacta.
 * - Palabras de >= 4 letras o frases compuestas permiten coincidencia por palabra o inclusión de subcadena.
 */
export function matchesKeywords(text: string, keywords?: string[] | null): boolean {
  if (!Array.isArray(keywords) || keywords.length === 0) return true;
  const normalizedInput = normalizeKeywordText(text);
  if (!normalizedInput) return false;

  const inputWords = normalizedInput.split(/\s+/).filter(Boolean);

  return keywords.some((rawKw) => {
    const kw = normalizeKeywordText(String(rawKw || ""));
    if (!kw) return false;

    // Coincidencia de frase con espacios
    if (kw.includes(" ")) {
      return normalizedInput.includes(kw);
    }

    // Coincidencia de palabra corta exacta
    if (kw.length <= 3) {
      return inputWords.includes(kw);
    }

    // Coincidencia de palabra completa o inclusión de término
    return inputWords.includes(kw) || normalizedInput.includes(kw);
  });
}

/**
 * Valida si el canal del evento entrante coincide con los canales autorizados en el trigger.
 */
export function isChannelMatch(
  configuredChannels?: string[] | null,
  actualChannel?: string | null
): boolean {
  if (!Array.isArray(configuredChannels) || configuredChannels.length === 0) {
    return true; // Sin restricción de canal
  }
  if (!actualChannel) return false;

  const actual = actualChannel.toLowerCase().trim();

  return configuredChannels.some((rawCh) => {
    const ch = String(rawCh || "").toLowerCase().trim();
    if (ch === actual) return true;

    // Aliases para Instagram
    if ((actual === "instagram" || actual === "instagram_dm") && (ch === "instagram" || ch === "instagram_dm")) {
      return true;
    }

    // Aliases para Facebook
    if (
      (actual === "facebook" || actual === "facebook_messenger" || actual === "messenger") &&
      (ch === "facebook" || ch === "facebook_messenger" || ch === "messenger")
    ) {
      return true;
    }

    return false;
  });
}

/**
 * Verifica de forma síncrona si un mensaje entrante (WhatsApp/DM/Telegram) coincide
 * con algún flujo de automatización activo y publicado para la empresa.
 * Si coincide, el pipeline de entrada silencia la IA libre para evitar condición de carrera.
 */
export async function checkSynchronousWorkflowMatch(
  admin: any,
  params: {
    companyId: string;
    channel?: string | null;
    instanceId?: string | null;
    text: string;
    isGroup?: boolean;
  }
): Promise<{
  matched: boolean;
  workflowId?: string;
  workflowName?: string;
  triggerNodeId?: string;
}> {
  const { companyId, channel, instanceId, text, isGroup } = params;

  // 1. Obtener flujos publicados para la empresa
  const { data: workflows, error: wfErr } = await admin
    .from("automation_workflows")
    .select("id, name, active_version_id")
    .eq("company_id", companyId)
    .eq("status", "published");

  if (wfErr || !workflows || workflows.length === 0) {
    return { matched: false };
  }

  const activeVersionIds = workflows
    .map((w: any) => w.active_version_id)
    .filter(Boolean);

  if (activeVersionIds.length === 0) {
    return { matched: false };
  }

  // 2. Obtener los grafos de las versiones activas
  const { data: versions, error: verErr } = await admin
    .from("automation_workflow_versions")
    .select("id, workflow_id, graph")
    .eq("company_id", companyId)
    .in("id", activeVersionIds);

  if (verErr || !versions || versions.length === 0) {
    return { matched: false };
  }

  const versionMap = new Map<string, WorkflowGraph>();
  for (const v of versions) {
    if (v.id && v.graph) versionMap.set(v.id, v.graph as WorkflowGraph);
  }

  // 3. Evaluar cada flujo buscando coincidencia con triggers de mensajería entrante
  for (const wf of workflows) {
    const graph = versionMap.get(wf.active_version_id);
    if (!graph || !graph.nodes) continue;

    const triggerNodes = graph.nodes.filter(
      (n) =>
        n.type === "messaging.inbound_received" ||
        (channel === "telegram" && n.type === "telegram.business_message_received")
    );
    if (triggerNodes.length === 0) continue;

    for (const triggerNode of triggerNodes) {
      const cfg = (triggerNode.config || {}) as any;

      // Validación de canal
      const chOk = isChannelMatch(cfg.channels, channel);
      if (!chOk) continue;

      // Validación de conexión / instancia
      const instOk =
        cfg.connectionMode !== "selected" ||
        (Array.isArray(cfg.instanceIds) && cfg.instanceIds.includes(instanceId));
      if (!instOk) continue;

      // Validación de tipo de conversación (direct, group, all)
      const convType = cfg.conversationType || "direct";
      let convOk = true;
      if (convType === "direct") convOk = !isGroup;
      else if (convType === "group") convOk = Boolean(isGroup);
      if (!convOk) continue;

      // Validación de palabras clave
      let kwOk = true;
      if (Array.isArray(cfg.keywords) && cfg.keywords.length > 0) {
        kwOk = matchesKeywords(text, cfg.keywords);
      }
      if (!kwOk) continue;

      // Arbitraje selectivo: solo silenciar la IA si el flujo contiene nodos activos de respuesta o ruteo
      // (evita que un flujo pasivo que solo aplica tags, mueve etapas o realiza auditoría CRM apague al Agente IA).
      const hasActiveMessagingNode = graph.nodes.some(
        (n) =>
          n.type === "messaging.send_text" ||
          n.type === "messaging.send_media" ||
          n.type === "messaging.send_interactive" ||
          n.type === "messaging.collect_input" ||
          n.type === "messaging.route_to_human" ||
          n.type === "messaging.wait_for_reply" ||
          n.type === "messaging.send_template" ||
          n.type === "ai.classify_and_route" ||
          n.type === "meta.send_private_reply"
      );

      if (!hasActiveMessagingNode) {
        continue;
      }

      // Si todas las condiciones coinciden y el flujo tiene acciones de respuesta activas:
      return {
        matched: true,
        workflowId: wf.id,
        workflowName: wf.name || "Workflow",
        triggerNodeId: triggerNode.id,
      };
    }
  }

  return { matched: false };
}

/**
 * Evalúa si un comentario de Meta (Instagram/Facebook) es elegible para disparar
 * automatizaciones basándose en flujos publicados, palabras clave, respuestas anidadas
 * y cooldown por usuario/post (once_per_user_per_post).
 */
export async function checkMetaCommentWorkflowEligibility(
  admin: any,
  params: {
    companyId: string;
    senderId: string;
    postId?: string | null;
    text?: string | null;
    channel?: string | null;
    instanceId?: string | null;
    isNestedReply?: boolean;
  }
): Promise<{
  eligible: boolean;
  hasWorkflow: boolean;
  matchedWorkflowId?: string;
  reason?: string;
}> {
  const { companyId, senderId, postId, text, channel, instanceId, isNestedReply } = params;

  // 1. Obtener flujos publicados
  const { data: workflows, error: wfErr } = await admin
    .from("automation_workflows")
    .select("id, name, active_version_id")
    .eq("company_id", companyId)
    .eq("status", "published");

  if (wfErr || !workflows || workflows.length === 0) {
    return { eligible: false, hasWorkflow: false, reason: "no_active_workflows" };
  }

  const activeVersionIds = workflows
    .map((w: any) => w.active_version_id)
    .filter(Boolean);

  if (activeVersionIds.length === 0) {
    return { eligible: false, hasWorkflow: false, reason: "no_active_versions" };
  }

  const { data: versions, error: verErr } = await admin
    .from("automation_workflow_versions")
    .select("id, workflow_id, graph")
    .eq("company_id", companyId)
    .in("id", activeVersionIds);

  if (verErr || !versions || versions.length === 0) {
    return { eligible: false, hasWorkflow: false, reason: "no_graphs_found" };
  }

  const versionMap = new Map<string, WorkflowGraph>();
  for (const v of versions) {
    if (v.id && v.graph) versionMap.set(v.id, v.graph as WorkflowGraph);
  }

  let foundCommentWorkflow = false;

  for (const wf of workflows) {
    const graph = versionMap.get(wf.active_version_id);
    if (!graph || !graph.nodes) continue;

    const triggerNodes = graph.nodes.filter((n) => n.type === "meta.comment_received");
    if (triggerNodes.length === 0) continue;

    foundCommentWorkflow = true;

    for (const triggerNode of triggerNodes) {
      const cfg = (triggerNode.config || {}) as any;

      // 1. Validar post específico si está configurado ("all" o vacío significa cualquier post)
      const targetPostId = String(cfg.postId || "").trim();
      if (targetPostId && targetPostId.toLowerCase() !== "all" && targetPostId !== String(postId || "").trim()) {
        continue;
      }

      // 2. Validar respuestas anidadas a otros comentarios
      const ignoreNested = Boolean(cfg.ignoreReplies ?? cfg.ignoreNestedReplies ?? false);
      if (ignoreNested && isNestedReply) {
        continue;
      }

      // 3. Validar canal
      const chOk = isChannelMatch(cfg.channels, channel);
      if (!chOk) continue;

      // 4. Validar conexión / instancia específica
      const instOk =
        cfg.connectionMode !== "selected" ||
        (Array.isArray(cfg.instanceIds) && cfg.instanceIds.includes(instanceId));
      if (!instOk) continue;

      // 5. Validar palabras clave con normalización semántica
      if (Array.isArray(cfg.keywords) && cfg.keywords.length > 0) {
        const kwOk = matchesKeywords(text || "", cfg.keywords);
        if (!kwOk) continue;
      }

      // 6. Validar cooldown por (workflow_id, sender_id, post_id) (once_per_user_per_post)
      const oncePerUser = Boolean(cfg.oncePerUserPerPost ?? true);
      if (oncePerUser && senderId && postId) {
        // Verificar si ya existe una ejecución previa para este flujo, usuario y post
        const { data: priorExec } = await admin
          .from("automation_executions")
          .select("id")
          .eq("company_id", companyId)
          .eq("workflow_id", wf.id)
          .filter("context->trigger->>senderId", "eq", String(senderId))
          .filter("context->trigger->>postId", "eq", String(postId))
          .limit(1)
          .maybeSingle();

        if (priorExec?.id) {
          continue; // Cooldown activo: este flujo específico ya atendió a este usuario en este post
        }
      }

      // Flujo coincidente y elegible
      return {
        eligible: true,
        hasWorkflow: true,
        matchedWorkflowId: wf.id,
      };
    }
  }

  return {
    eligible: false,
    hasWorkflow: foundCommentWorkflow,
    reason: foundCommentWorkflow ? "filtered_by_rules_or_cooldown" : "no_meta_comment_trigger",
  };
}
