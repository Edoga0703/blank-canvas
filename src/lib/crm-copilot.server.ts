// src/lib/crm-copilot.server.ts
import { lovableAiChat, type ChatMsg } from "@/lib/lovable-ai.server";
import { resolveStageAiMeta, extractCleanStageName, DEFAULT_CRM_MASTER_PROMPT } from "@/lib/crm-stage-meta";
import {
  gatherLeadComprehensiveContext,
  formatComprehensiveContextForPrompt,
  type ComprehensiveLeadData,
} from "./crm-lead-context.server";

export interface CrmCopilotActionProposal {
  type: "stage_criteria" | "create_stage" | "pipeline_prompt" | "stage_automation" | "move_lead" | "rename_stage" | "delete_stage";
  title: string;
  description: string;
  status: "pending" | "applied" | "rejected";
  payload: any;
}

export interface CrmCopilotTurnResult {
  reply: string;
  proposals: CrmCopilotActionProposal[];
}

/**
 * Recopila el contexto completo del embudo CRM, sus etapas, criterios actuales,
 * catálogo comercial de la empresa y la información integral 360° del lead.
 */
export async function getCrmCopilotContext(
  supabase: any,
  companyId: string,
  pipelineId?: string | null,
  cardId?: string | null,
) {
  // 1. Obtener todos los embudos de la empresa (solo columnas existentes en Postgres)
  const { data: allPipelines } = await supabase
    .from("crm_pipeline")
    .select("id, nome, tipo, agent_id, crm_master_prompt")
    .eq("company_id", companyId)
    .order("ordem", { ascending: true });

  let pipeline = null;
  let resolvedPipelineId = pipelineId;

  if (resolvedPipelineId) {
    pipeline = (allPipelines || []).find((p: any) => p.id === resolvedPipelineId) || null;
  }

  if (!pipeline && allPipelines && allPipelines.length > 0) {
    pipeline = allPipelines[0];
    resolvedPipelineId = pipeline.id;
  }

  // 2. Si la empresa aún no tiene ningún registro en crm_pipeline, crear uno por defecto o buscar el ID
  if (!pipeline) {
    try {
      const { data: createdPipe } = await supabase
        .from("crm_pipeline")
        .insert({
          company_id: companyId,
          nome: "Atención y ventas",
          tipo: "vendas",
          ordem: 0,
          sistema: true,
        })
        .select("id, nome, tipo, agent_id, crm_master_prompt")
        .maybeSingle();
      pipeline = createdPipe;
      resolvedPipelineId = createdPipe?.id || null;
    } catch {
      // best-effort
    }
  }

  // 3. Consultar etapas asociadas (solo columnas existentes; criterio_ia se extrae de mensagem_prompt)
  let rawStages: any[] = [];
  if (resolvedPipelineId) {
    const { data: stByPipe } = await supabase
      .from("crm_stage")
      .select("id, nome, cor, tipo, ordem, mensagem_prompt, modo_atendimento, move_apos_qualificar_para, ia_handoff_stage_id, pipeline_id, criterio_ia, bloqueada_para_ia")
      .eq("company_id", companyId)
      .or(`pipeline_id.eq.${resolvedPipelineId},pipeline_id.is.null`)
      .order("ordem", { ascending: true });
    rawStages = stByPipe || [];
  }

  if (rawStages.length === 0) {
    const { data: anyStages } = await supabase
      .from("crm_stage")
      .select("id, nome, cor, tipo, ordem, mensagem_prompt, modo_atendimento, move_apos_qualificar_para, ia_handoff_stage_id, pipeline_id, criterio_ia, bloqueada_para_ia")
      .eq("company_id", companyId)
      .order("ordem", { ascending: true });
    rawStages = anyStages || [];
  }

  const [
    { data: card },
    { data: produtos },
    { data: servicos },
    { data: agentRules },
    leadComprehensiveCtx,
  ] = await Promise.all([
    cardId
      ? supabase
          .from("crm_cards")
          .select("id, nome, numero, stage_id, valor, campos_extras, tags, observacao, email, empresa, item_nome, stage_entrou_em")
          .eq("id", cardId)
          .eq("company_id", companyId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("produto")
      .select("id, nome, preco, categoria, sku, agendavel, tipo")
      .eq("company_id", companyId)
      .eq("ativo", true)
      .order("ordem", { ascending: true })
      .limit(30),
    supabase
      .from("servico")
      .select("id, nome, valor_cents, duracao_min")
      .eq("company_id", companyId)
      .eq("ativo", true)
      .limit(20),
    supabase
      .from("agent_config")
      .select("como_vender, diferenciais, cupom, formas_pagamento, faq, descricao_negocio")
      .eq("company_id", companyId)
      .order("is_default", { ascending: false })
      .limit(1)
      .maybeSingle(),
    cardId ? gatherLeadComprehensiveContext(supabase, companyId, cardId) : Promise.resolve(null),
  ]);

  const parsedStages = (rawStages || []).map((s: any) => {
    const meta = resolveStageAiMeta(s);
    return {
      id: s.id,
      nome: s.nome,
      cor: s.cor,
      tipo: s.tipo,
      ordem: s.ordem,
      modo_atendimento: s.modo_atendimento || "auto",
      criterio_ia: meta.criterio_ia,
      bloqueada_para_ia: meta.bloqueada_para_ia,
      move_apos_qualificar_para: s.move_apos_qualificar_para,
      ia_handoff_stage_id: s.ia_handoff_stage_id,
      pipeline_id: s.pipeline_id || resolvedPipelineId,
    };
  });

  return {
    pipeline: pipeline || { id: resolvedPipelineId || "", nome: "Atención y ventas", crm_master_prompt: null },
    allPipelines: allPipelines || [],
    stages: parsedStages,
    card: card || null,
    produtos: produtos || [],
    servicos: servicos || [],
    agentRules: agentRules || null,
    leadComprehensiveCtx: leadComprehensiveCtx as ComprehensiveLeadData | null,
  };
}

/**
 * Construye el System Prompt para el CRM & Pipeline Copilot con contexto enriquecido.
 */
export function buildCrmCopilotSystemPrompt(context: {
  pipeline: any;
  allPipelines: any[];
  stages: any[];
  card: any;
  produtos?: any[];
  servicos?: any[];
  agentRules?: any;
  leadComprehensiveCtx?: ComprehensiveLeadData | null;
}): string {
  const pipe = context.pipeline || {};
  const stages = context.stages || [];
  const card = context.card || null;
  const produtos = context.produtos || [];
  const servicos = context.servicos || [];
  const agentRules = context.agentRules || null;
  const leadCtx = context.leadComprehensiveCtx || null;

  const stagesSummary = stages.length > 0
    ? stages
        .map(
          (s, idx) =>
            `${idx + 1}. [ID: "${s.id}"] Etapa "${s.nome}" (${s.tipo}, modo: ${s.modo_atendimento})\n` +
            `   - Criterio IA: ${s.criterio_ia ? `"${s.criterio_ia}"` : "(Sin criterio definido aún)"}\n` +
            `   - Bloqueada para IA: ${s.bloqueada_para_ia ? "SÍ (Solo humanos pueden mover aquí)" : "NO (La IA puede mover automáticamente)"}`
        )
        .join("\n\n")
    : "No hay etapas configuradas en este embudo. Puedes proponer crearlas usando 'create_stage'.";

  // Resumen del Catálogo
  let catalogSummary = "CATÁLOGO DE PRODUCTOS Y SERVICIOS DE LA EMPRESA:\n";
  const prodsList = (produtos || []).map((p: any) => `* "${p.nome}" (${p.categoria || "Geral"}): ${Number(p.preco || 0).toLocaleString("en-US")}${p.agendavel ? " [Requiere Cita Previa]" : ""}`);
  const servsList = (servicos || []).map((s: any) => `* Serv. "${s.nome}": ${(Number(s.valor_cents || 0) / 100).toLocaleString("en-US")} (${s.duracao_min} min)`);
  const allItems = [...prodsList, ...servsList];
  catalogSummary += allItems.length > 0 ? allItems.join("\n") : "(Sin productos activos en catálogo)";

  // Políticas de venta corporativas
  let rulesSummary = "";
  if (agentRules) {
    const list = [];
    if (agentRules.cupom) list.push(`Cupones autorizados: "${agentRules.cupom}"`);
    if (agentRules.formas_pagamento) list.push(`Formas de pago aceptadas: "${agentRules.formas_pagamento}"`);
    if (agentRules.diferenciais) list.push(`Diferenciales del negocio: "${agentRules.diferenciais}"`);
    if (agentRules.como_vender) list.push(`Metodología de venta: "${agentRules.como_vender}"`);
    if (list.length > 0) {
      rulesSummary = `\nPOLÍTICAS COMERCIALES Y DE DESCUENTO CONFIGURADAS:\n${list.map((x) => `- ${x}`).join("\n")}\n`;
    }
  }

  let leadContextBlock = "";
  if (leadCtx) {
    leadContextBlock = `\n${formatComprehensiveContextForPrompt(leadCtx, "es-ES")}\n`;
  } else if (card) {
    const extras = card.campos_extras || {};
    const diag = extras.ultimo_diagnostico_ia;
    leadContextBlock = `
LEAD EN ANÁLISIS ACTUAL:
- Nombre / Teléfono: ${card.nome || card.numero} (ID: ${card.id})
- Etapa Actual: ID "${card.stage_id}"
${card.empresa ? `- Empresa: ${card.empresa}` : ""}
${card.email ? `- Email: ${card.email}` : ""}
${Array.isArray(card.tags) && card.tags.length > 0 ? `- Tags: [${card.tags.join(", ")}]` : ""}
${diag ? `- Último Diagnóstico IA:
   * Resumen: "${diag.resumo}"
   * Intención: "${diag.intencao}"
   * Etapa Sugerida: "${diag.etapa_sugerida_nome}" (ID: "${diag.etapa_sugerida_id}")
   * Justificación: "${diag.justificativa}"
   * Sugerencia de Entrenamiento: "${diag.sugestao_treinamento || "Ninguna"}"` : ""}
`;
  } else {
    leadContextBlock = `
MODO DE OPERACIÓN ACTUAL:
Estás en el modo "Arquitectura de Embudo y Configuración General".
(No hay ningún lead individual seleccionado en este momento. Estás asesorando al administrador sobre el diseño de las etapas, reglas, criterios y optimización comercial general).
`;
  }

  return `Eres el "CRM Pipeline & Leads Copilot", el Consultor Senior de Sales Operations, Arquitecto de Embudos de Venta y Gerente Autónomo del CRM dentro de Capiconversa.

CONTEXTO DE TU ENTORNO:
- Estás conversando con el ADMINISTRADOR o JEFE DE VENTAS dentro del CRM en su navegador web.
- Tu misión es gerenciar, estructurar, refinar y optimizar su embudo de ventas Kanban, los criterios con los que la IA clasifica y mueve leads, y resolver dudas o inconsistencias detectadas en las conversaciones reales.
- Cuentas con HERRAMIENTAS DIRECTAS integradas para administrar y configurar la base de datos del embudo en tiempo real.
- Tienes acceso directo al Catálogo Comercial, Citas, Notas del Equipo, Políticas de Venta y Ficha 360° de los leads.

${leadContextBlock}

${catalogSummary}
${rulesSummary}
EMBUDO ACTUAL:
- Nombre: "${pipe.nome || "Atención y ventas"}" (ID: "${pipe.id || ""}")
- Prompt Maestro del Embudo:
${DEFAULT_CRM_MASTER_PROMPT}

ETAPAS ACTUALES Y SUS CRITERIOS:
${stagesSummary}

TUS HERRAMIENTAS Y CAPACIDADES DE GESTIÓN DIRECTA:
Tienes herramientas nativas de lectura y ESCRITURA DIRECTA para gerenciar el embudo y el Kanban de Capiconversa:
1. 'stage_criteria': Modificar el 'criterio_ia' o 'bloqueada_para_ia' de una etapa existente.
2. 'create_stage': Crear una nueva etapa en el embudo con su nombre, color, tipo y criterio.
3. 'pipeline_prompt': Actualizar o ampliar el 'crm_master_prompt' del embudo en el agente comercial.
4. 'stage_automation': Cambiar el 'modo_atendimento' ('auto', 'ia', 'manual') o configuración de paso.
5. 'move_lead': Mover el lead en análisis a la etapa sugerida.
6. 'rename_stage': Cambiar el nombre de una etapa existente.
7. 'delete_stage': Eliminar una etapa innecesaria.

CÓMO PRESENTAS TUS ACCIONES:
- Cada bloque de acciones estructuradas que incluyas en \`\`\`json_actions se renderiza en la pantalla del usuario en forma de tarjetas interactivas de acción.
- El usuario revisa tus propuestas y las aplica con un solo clic (individualmente con 'Aplicar' o todas en lote con '⚡ Aplicar todas las acciones pendientes').
- Cuando el usuario te pida crear una etapa, modificar criterios, optimizar el embudo o auditar un lead, genera siempre el bloque \`\`\`json_actions completo, explica brevemente los beneficios de cada ajuste e invítale a pulsar 'Aplicar' o 'Aplicar todas' en las tarjetas para integrarlas al embudo.
- NUNCA digas cosas como "no puedo escribir en base de datos" o "no tengo herramientas de guardar"; tus bloques de acciones son las herramientas conectadas al sistema.

FORMATO DE ACCIONES (OBLIGATORIO):
Cuando recomiendes o ejecutes cambios, redacta tu respuesta conversacional en español claro, profesional y constructivo, y AL FINAL incluye un bloque de código exactamente con la etiqueta \`\`\`json_actions con una lista de objetos.
EJEMPLOS DE LAS ESTRUCTURAS DISPONIBLES:

1) Modificar Criterio de Etapa existente:
{
  "type": "stage_criteria",
  "title": "Ajustar Criterio de la Etapa 'Atención humana'",
  "description": "Especifica cuándo un cliente debe pasar a ser atendido por un humano.",
  "payload": {
    "stageId": "ID_DE_LA_ETAPA",
    "stageName": "Atención humana",
    "criterio_ia": "El lead solicita hablar con una persona o requiere cotización personalizada compleja.",
    "bloqueada_para_ia": false
  }
}

2) Crear una Nueva Etapa:
{
  "type": "create_stage",
  "title": "Crear Etapa 'Demostración Agendada'",
  "description": "Etapa para leads con cita confirmada en Google Meet o llamada.",
  "payload": {
    "pipelineId": "${pipe.id || ""}",
    "nome": "Demostración Agendada",
    "cor": "#60A5FA",
    "tipo": "normal",
    "criterio_ia": "El lead acordó fecha y hora o tiene una reunión agendada en calendario.",
    "bloqueada_para_ia": false
  }
}

3) Actualizar Prompt Maestro del Embudo:
{
  "type": "pipeline_prompt",
  "title": "Actualizar Prompt Maestro del Embudo",
  "description": "Reglas globales para evaluación y auditoría comercial.",
  "payload": {
    "pipelineId": "${pipe.id || ""}",
    "crm_master_prompt": "Texto completo del prompt maestro con reglas y fuentes de auditoría..."
  }
}

4) Cambiar Automatización / Modo de Atención de una Etapa:
{
  "type": "stage_automation",
  "title": "Cambiar Modo de Atención a Humano",
  "description": "Solo asesores humanos responderán en esta etapa.",
  "payload": {
    "stageId": "ID_DE_LA_ETAPA",
    "modo_atendimento": "manual"
  }
}

5) Renombrar una Etapa:
{
  "type": "rename_stage",
  "title": "Renombrar Etapa",
  "description": "Actualiza el nombre visible de la etapa en el Kanban.",
  "payload": {
    "stageId": "ID_DE_LA_ETAPA",
    "oldName": "Nombre anterior",
    "newName": "Nuevo nombre"
  }
}

6) Eliminar una Etapa:
{
  "type": "delete_stage",
  "title": "Eliminar Etapa",
  "description": "Remueve la etapa del embudo de forma segura.",
  "payload": {
    "stageId": "ID_DE_LA_ETAPA",
    "stageName": "Nombre de la etapa"
  }
}

DIRECTIVAS IMPORTANTES:
- Si el usuario te pide aplicar, crear, modificar o gestionar cualquier cosa, responde afirmativamente y genera el bloque \`\`\`json_actions correspondiente para su ejecución inmediata.
- Si el ID del embudo es "${pipe.id || ""}", usa "${pipe.id || ""}" como pipelineId en las acciones.
- Al proponer o ejecutar 'create_stage', es OBLIGATORIO incluir la propiedad "nome": "Nombre de la etapa".
- Al proponer o ejecutar 'stage_criteria', incluye "stageId": "ID_DE_LA_ETAPA" (o "stageName": "Nombre de la etapa").
- Si una etapa como 'Ganado' o 'Perdido' debe requerir confirmación humana, pon 'bloqueada_para_ia': true.
- Sé conciso, proactivo, con mentalidad resolutiva de Gerente de Operaciones de CRM.`;
}

/**
 * Parsea el texto del Copilot para separar la respuesta conversacional
 * de los bloques de acciones estructuradas.
 */
export function parseCrmCopilotOutput(rawText: string): CrmCopilotTurnResult {
  let reply = rawText;
  const proposals: CrmCopilotActionProposal[] = [];

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
      try {
        const cleaned = rawJson
          .replace(/,\s*([}\]])/g, "$1")
          .replace(/\/\*[\s\S]*?\*\/|([^:]|^)\/\/.*$/gm, "");
        parsed = JSON.parse(cleaned);
      } catch {
        parsed = [];
        const itemRegex = /{\s*"type"\s*:\s*"(?:stage_criteria|create_stage|pipeline_prompt|stage_automation|move_lead|rename_stage|delete_stage)"[\s\S]*?}(?=\s*,\s*{|\s*\]|\s*$)/g;
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
        if (item?.type) {
          const payload = { ...(item.payload || {}) };

          // Normalizar create_stage
          if (item.type === "create_stage") {
            payload.nome = extractCleanStageName(item);
            payload.cor = String(payload.cor || payload.color || "#60A5FA").trim();
            let tipo = String(payload.tipo || payload.type || "normal").toLowerCase().trim();
            if (tipo === "ganado" || tipo === "won") tipo = "ganho";
            if (tipo === "perdido" || tipo === "lost") tipo = "perda";
            payload.tipo = ["normal", "ganho", "perda"].includes(tipo) ? tipo : "normal";
            payload.criterio_ia = String(payload.criterio_ia || payload.criterio || payload.criteria || payload.ai_criteria || "").trim();
          }

          // Normalizar stage_criteria
          if (item.type === "stage_criteria") {
            payload.stageId = String(payload.stageId || payload.stage_id || payload.id || "").trim();
            payload.stageName = String(payload.stageName || payload.stage_name || payload.nome || payload.name || "").trim();
            payload.criterio_ia = String(payload.criterio_ia || payload.criterio || payload.criteria || payload.ai_criteria || "").trim();
          }

          // Normalizar pipeline_prompt
          if (item.type === "pipeline_prompt") {
            payload.crm_master_prompt = String(payload.crm_master_prompt || payload.master_prompt || payload.prompt || payload.crmMasterPrompt || payload.content || "").trim();
          }

          // Normalizar stage_automation
          if (item.type === "stage_automation") {
            payload.stageId = String(payload.stageId || payload.stage_id || payload.id || "").trim();
            payload.stageName = String(payload.stageName || payload.stage_name || payload.nome || payload.name || "").trim();
            payload.modo_atendimento = String(payload.modo_atendimento || payload.modo || payload.mode || "auto").trim();
          }

          proposals.push({
            type: item.type,
            title: String(item.title || item.name || `Acción de ${item.type}`),
            description: String(item.description || item.justification || ""),
            status: "pending",
            payload,
          });
        }
      }
    }

    reply = rawText.replace(match[0], "").trim();
  }

  return {
    reply: reply.trim(),
    proposals,
  };
}
