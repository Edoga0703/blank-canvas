// src/lib/crm-copilot.server.ts
import { lovableAiChat, type ChatMsg } from "@/lib/lovable-ai.server";
import { resolveStageAiMeta, DEFAULT_CRM_MASTER_PROMPT } from "@/lib/crm-stage-meta";

export interface CrmCopilotActionProposal {
  type: "stage_criteria" | "create_stage" | "pipeline_prompt" | "stage_automation" | "move_lead";
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
 * Recopila el contexto completo del embudo CRM, sus etapas, criterios actuales
 * y la información del lead (si el chat fue iniciado desde una auditoría).
 */
export async function getCrmCopilotContext(
  supabase: any,
  companyId: string,
  pipelineId?: string | null,
  cardId?: string | null,
) {
  let resolvedPipelineId = pipelineId;

  if (!resolvedPipelineId) {
    const { data: firstPipe } = await supabase
      .from("crm_pipeline")
      .select("id")
      .eq("company_id", companyId)
      .order("ordem", { ascending: true })
      .limit(1)
      .maybeSingle();
    resolvedPipelineId = firstPipe?.id || null;
  }

  const [
    { data: pipeline },
    { data: allPipelines },
    { data: stages },
    { data: card },
  ] = await Promise.all([
    resolvedPipelineId
      ? supabase
          .from("crm_pipeline")
          .select("id, nome, agent_id, crm_master_prompt, tipo")
          .eq("id", resolvedPipelineId)
          .eq("company_id", companyId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("crm_pipeline")
      .select("id, nome, tipo")
      .eq("company_id", companyId)
      .order("ordem", { ascending: true }),
    resolvedPipelineId
      ? supabase
          .from("crm_stage")
          .select("id, nome, cor, tipo, ordem, criterio_ia, bloqueada_para_ia, mensagem_prompt, modo_atendimento, move_apos_qualificar_para, ia_handoff_stage_id")
          .eq("pipeline_id", resolvedPipelineId)
          .order("ordem", { ascending: true })
      : Promise.resolve({ data: [] }),
    cardId
      ? supabase
          .from("crm_cards")
          .select("id, nome, numero, stage_id, valor, campos_extras, ultimo_analise_ia_em")
          .eq("id", cardId)
          .eq("company_id", companyId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const parsedStages = (stages || []).map((s: any) => {
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
    };
  });

  return {
    pipeline: pipeline || null,
    allPipelines: allPipelines || [],
    stages: parsedStages,
    card: card || null,
  };
}

/**
 * Construye el System Prompt para el CRM & Pipeline Copilot.
 */
export function buildCrmCopilotSystemPrompt(context: {
  pipeline: any;
  allPipelines: any[];
  stages: any[];
  card: any;
}): string {
  const pipe = context.pipeline || {};
  const stages = context.stages || [];
  const card = context.card || null;

  const stagesSummary = stages.length > 0
    ? stages
        .map(
          (s, idx) =>
            `${idx + 1}. [ID: "${s.id}"] Etapa "${s.nome}" (${s.tipo}, modo: ${s.modo_atendimento})\n` +
            `   - Criterio IA: ${s.criterio_ia ? `"${s.criterio_ia}"` : "(Sin criterio definido)"}\n` +
            `   - Bloqueada para IA: ${s.bloqueada_para_ia ? "SÍ (Solo humanos pueden mover aquí)" : "NO (La IA puede mover automáticamente)"}`
        )
        .join("\n\n")
    : "No hay etapas configuradas en este embudo.";

  let leadContextBlock = "";
  if (card) {
    const extras = card.campos_extras || {};
    const diag = extras.ultimo_diagnostico_ia;
    leadContextBlock = `
LEAD EN ANÁLISIS ACTUAL:
- Nombre / Teléfono: ${card.nome || card.numero} (ID: ${card.id})
- Etapa Actual: ID "${card.stage_id}"
${diag ? `- Último Diagnóstico IA:
   * Resumen: "${diag.resumo}"
   * Intención: "${diag.intencao}"
   * Etapa Sugerida: "${diag.etapa_sugerida_nome}" (ID: "${diag.etapa_sugerida_id}")
   * Justificación: "${diag.justificativa}"
   * Sugerencia de Entrenamiento: "${diag.sugestao_treinamento || "Ninguna"}"` : ""}
`;
  }

  return `Eres el "CRM Pipeline & Leads Copilot", el Consultor Senior de Sales Operations, Arquitecto de Embudos de Venta y Especialista en Auditoría de Leads dentro del CRM Capiconversa.

CONTEXTO DE TU ENTORNO:
- Estás conversando con el ADMINISTRADOR o JEFE DE VENTAS dentro del CRM en su navegador web.
- Tu misión es ayudarle a estructurar, refinar y optimizar su embudo de ventas, los criterios con los que la IA clasifica y mueve leads, y resolver dudas o inconsistencias detectadas en las conversaciones reales.
${leadContextBlock}
EMBUDO ACTUAL:
- Nombre: "${pipe.nome || "Comercial"}" (ID: "${pipe.id || ""}")
- Prompt Maestro del Embudo:
${pipe.crm_master_prompt ? pipe.crm_master_prompt : DEFAULT_CRM_MASTER_PROMPT}

ETAPAS ACTUALES Y SUS CRITERIOS:
${stagesSummary}

TUS CAPACIDADES:
Puedes proponer ACCIONES ESTRUCTURADAS que el usuario podrá revisar y aplicar con 1 clic en su pantalla:
1. 'stage_criteria': Modificar el 'criterio_ia' o 'bloqueada_para_ia' de una etapa existente.
2. 'create_stage': Crear una nueva etapa en el embudo con su nombre, color, tipo y criterio.
3. 'pipeline_prompt': Actualizar o ampliar el 'crm_master_prompt' del embudo.
4. 'stage_automation': Cambiar el 'modo_atendimento' ('auto', 'ia', 'manual') o configuración de paso.
5. 'move_lead': Mover el lead en análisis a la etapa sugerida.

FORMATO DE ACCIONES (OBLIGATORIO):
Cuando recomiendes cambios concretos, redacta tu respuesta conversacional en español claro, profesional y constructivo, y AL FINAL incluye un bloque de código exactamente con la etiqueta \`\`\`json_actions:

\`\`\`json_actions
[
  {
    "type": "stage_criteria",
    "title": "Ajustar Criterio de la Etapa 'Soporte'",
    "description": "Especifica qué ocurre cuando se resuelve el problema del cliente.",
    "payload": {
      "stageId": "ID_DE_LA_ETAPA",
      "stageName": "Soporte",
      "criterio_ia": "Nuevo texto del criterio exacto...",
      "bloqueada_para_ia": false
    }
  },
  {
    "type": "create_stage",
    "title": "Crear Etapa 'Reengajamento'",
    "description": "Para clientes que resolvieron su soporte y pueden volver a comprar.",
    "payload": {
      "pipelineId": "${pipe.id || ""}",
      "nome": "Reengajamento",
      "cor": "#60A5FA",
      "tipo": "normal",
      "criterio_ia": "Criterio para clasificar leads en esta nueva etapa...",
      "bloqueada_para_ia": false
    }
  },
  {
    "type": "pipeline_prompt",
    "title": "Actualizar Reglas del Auditor Comercial",
    "description": "Añade directrices sobre el tratamiento de quejas y soporte.",
    "payload": {
      "pipelineId": "${pipe.id || ""}",
      "crm_master_prompt": "Texto completo y mejorado del prompt maestro..."
    }
  }
]
\`\`\`

DIRECTIVAS IMPORTANTES:
- Si el usuario te envía una sugerencia de auditoría generada por un lead real (por ejemplo: "El criterio de Soporte no especifica a qué etapa moverse al resolverse..."), genera de inmediato la acción 'stage_criteria' con el texto redactado con máxima precisión, listo para aplicar con 1 clic.
- Si una etapa como 'Ganado' o 'Perdido' debe requerir confirmación humana, pon 'bloqueada_para_ia': true.
- Sé conciso, proactivo y explica brevemente por qué tu ajuste hace el análisis automático más inteligente y confiable.`;
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
        const itemRegex = /{\s*"type"\s*:\s*"(?:stage_criteria|create_stage|pipeline_prompt|stage_automation|move_lead)"[\s\S]*?}(?=\s*,\s*{|\s*\]|\s*$)/g;
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

    reply = rawText.replace(match[0], "").trim();
  }

  return {
    reply: reply.trim(),
    proposals,
  };
}
