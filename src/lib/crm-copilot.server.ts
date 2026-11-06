// src/lib/crm-copilot.server.ts
import { lovableAiChat, type ChatMsg } from "@/lib/lovable-ai.server";
import { resolveStageAiMeta, extractCleanStageName, DEFAULT_CRM_MASTER_PROMPT } from "@/lib/crm-stage-meta";
import {
  gatherLeadComprehensiveContext,
  formatComprehensiveContextForPrompt,
  type ComprehensiveLeadData,
} from "./crm-lead-context.server";

export interface CrmCopilotActionProposal {
  type:
    | "stage_criteria"
    | "create_stage"
    | "pipeline_prompt"
    | "stage_automation"
    | "move_lead"
    | "rename_stage"
    | "delete_stage"
    | "create_pipeline"
    | "delete_pipeline"
    | "reorder_stages"
    | "test_webhook";
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
 * Recopila el contexto completo del embudo CRM activo, sus etapas, criterios,
 * volumen de tarjetas por etapa, catálogo comercial de la empresa y la ficha 360° del lead si aplica.
 */
export async function getCrmCopilotContext(
  supabase: any,
  companyId: string,
  pipelineId?: string | null,
  cardId?: string | null,
) {
  // 1. Obtener todos los embudos de la empresa
  const { data: allPipelines } = await supabase
    .from("crm_pipeline")
    .select("id, nome, tipo, ordem, sistema, crm_master_prompt, agent_id")
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

  // 2. Auto-provisión si la empresa no tiene ningún embudo registrado aún
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
        .select("id, nome, tipo, agent_id")
        .maybeSingle();
      pipeline = createdPipe;
      resolvedPipelineId = createdPipe?.id || null;
    } catch {
      // best-effort
    }
  }

  // 3. Consultar etapas asociadas al embudo activo
  let rawStages: any[] = [];
  if (resolvedPipelineId) {
    const { data: stByPipe } = await supabase
      .from("crm_stage")
      .select("*")
      .eq("company_id", companyId)
      .or(`pipeline_id.eq.${resolvedPipelineId},pipeline_id.is.null`)
      .order("ordem", { ascending: true });
    rawStages = stByPipe || [];
  }

  if (rawStages.length === 0) {
    const { data: anyStages } = await supabase
      .from("crm_stage")
      .select("*")
      .eq("company_id", companyId)
      .order("ordem", { ascending: true });
    rawStages = anyStages || [];
  }

  // 4. Conteo de leads/tarjetas por etapa para detectar cuellos de botella
  const { data: cardsOnStages } = await supabase
    .from("crm_cards")
    .select("stage_id")
    .eq("company_id", companyId);

  const cardCountsByStage: Record<string, number> = {};
  for (const c of cardsOnStages || []) {
    if (c.stage_id) {
      cardCountsByStage[c.stage_id] = (cardCountsByStage[c.stage_id] || 0) + 1;
    }
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
      .select("nome_agente, nome_empresa, sobre_empresa, descricao_negocio, como_vender, diferenciais, cupom, formas_pagamento, faq")
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
      card_count: cardCountsByStage[s.id] || 0,
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
 * Construye el Master Prompt del Copilot Arquitecto del Analista de Kanban
 * estructurado en los 8 Bloques Estratégicos.
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
  const allPipelines = context.allPipelines || [];
  const stages = context.stages || [];
  const card = context.card || null;
  const produtos = context.produtos || [];
  const servicos = context.servicos || [];
  const agentRules = context.agentRules || null;
  const leadCtx = context.leadComprehensiveCtx || null;

  // Resumen del mapa de etapas en vivo
  const stagesSummary = stages.length > 0
    ? stages
        .map(
          (s, idx) =>
            `${idx + 1}. [ID: "${s.id}"] Etapa "${s.nome}" (Tipo: ${s.tipo}, Modo: ${s.modo_atendimento}) - Leads activos: ${s.card_count || 0}\n` +
            `   - Criterio IA: ${s.criterio_ia ? `"${s.criterio_ia}"` : "(Sin criterio definido aún)"}\n` +
            `   - Bloqueada para IA (🔒): ${s.bloqueada_para_ia ? "SÍ (Solo revisión y confirmación humana)" : "NO (Movimiento automático por IA)"}`
        )
        .join("\n\n")
    : "No hay etapas configuradas en este embudo. Puedes proponer crearlas usando 'create_stage'.";

  // Resumen de volumen de leads por etapa
  const stagesCardCountsSummary = stages.length > 0
    ? stages.map((s) => `• ${s.nome}: ${s.card_count || 0} tarjeta(s)`).join(" | ")
    : "Sin tarjetas registradas.";

  // Resumen compacto de catálogo (productos y servicios)
  let catalogSummary = "";
  const prodsList = (produtos || []).map((p: any) => `* "${p.nome}" (${p.categoria || "General"}): $${Number(p.preco || 0).toLocaleString("en-US")}${p.agendavel ? " [Cita Previa]" : ""}`);
  const servsList = (servicos || []).map((s: any) => `* Serv. "${s.nome}": $${(Number(s.valor_cents || 0) / 100).toLocaleString("en-US")} (${s.duracao_min} min)`);
  const allItems = [...prodsList, ...servsList];
  catalogSummary = allItems.length > 0 ? allItems.join("\n") : "(Sin productos o servicios activos en catálogo)";

  // Políticas comerciales del negocio
  let rulesSummary = "";
  if (agentRules) {
    const list = [];
    if (agentRules.formas_pagamento) list.push(`Formas de pago aceptadas: "${agentRules.formas_pagamento}"`);
    if (agentRules.como_vender) list.push(`Metodología comercial: "${agentRules.como_vender}"`);
    if (agentRules.diferenciais) list.push(`Diferenciales: "${agentRules.diferenciais}"`);
    if (agentRules.cupom) list.push(`Promociones / Cupones: "${agentRules.cupom}"`);
    if (list.length > 0) {
      rulesSummary = `\nPOLÍTICAS COMERCIALES Y MÉTODOS DE PAGO DEL NEGOCIO:\n${list.map((x) => `- ${x}`).join("\n")}\n`;
    }
  }

  // Lista de otros embudos de la empresa
  const otherPipesSummary = allPipelines.length > 1
    ? allPipelines
        .filter((p: any) => p.id !== pipe.id)
        .map((p: any) => `- [ID: "${p.id}"] "${p.nome}" (Tipo: ${p.tipo || "vendas"})`)
        .join("\n")
    : "(Este es el único embudo registrado actualmente en la empresa)";

  // Contexto del Lead (si hay uno en análisis puntual)
  let leadContextBlock = "";
  if (leadCtx) {
    leadContextBlock = `\n${formatComprehensiveContextForPrompt(leadCtx, "es-ES")}\n`;
  } else if (card) {
    const extras = card.campos_extras || {};
    const diag = extras.ultimo_diagnostico_ia;
    leadContextBlock = `
LEAD EN ANÁLISIS PUNTUAL:
- Nombre / Teléfono: ${card.nome || card.numero} (ID: ${card.id})
- Etapa Actual: ID "${card.stage_id}"
${card.empresa ? `- Empresa: ${card.empresa}` : ""}
${card.email ? `- Email: ${card.email}` : ""}
${Array.isArray(card.tags) && card.tags.length > 0 ? `- Tags: [${card.tags.join(", ")}]` : ""}
${diag ? `- Último Diagnóstico del Analista:
   * Resumen: "${diag.resumo}"
   * Intención: "${diag.intencao}"
   * Etapa Sugerida: "${diag.etapa_sugerida_nome}" (ID: "${diag.etapa_sugerida_id}")
   * Justificación: "${diag.justificativa}"
   * Sugerencia de Calibración: "${diag.sugestao_treinamento || "Ninguna"}"` : ""}
`;
  } else {
    leadContextBlock = `
MODO DE OPERACIÓN ACTUAL:
Estás en el modo "Arquitectura de Embudo y Calibración del Analista".
(No hay ningún lead individual seleccionado en este momento. Estás asesorando al administrador sobre el diseño de las etapas, reglas, criterios y optimización comercial del flujo abierto).
`;
  }

  const rawPipePrompt = (pipe as any)?.crm_master_prompt;
  const masterPromptText =
    rawPipePrompt && String(rawPipePrompt).trim().length > 0
      ? String(rawPipePrompt).trim()
      : DEFAULT_CRM_MASTER_PROMPT;

  const companyName = agentRules?.nome_empresa || "Empresa";
  const companyDescription = agentRules?.sobre_empresa || agentRules?.descricao_negocio || "Sin descripción de negocio configurada";

  return `=== BLOQUE 1: IDENTIDAD Y ROL EXCLUSIVO ===
Eres el "AI Studio Copilot - Arquitecto de Embudo y Analista de Kanban", el Consultor Senior de Inteligencia Artificial especializado en embudos de venta, procesos comerciales y clasificación automatizada dentro de Capiconversa.

Tu misión es EXCLUSIVA: ayudar al administrador o dueño del negocio a concebir, diseñar, entrenar, auditar y calibrar a su ANALISTA DE KANBAN.

El Analista de Kanban es la inteligencia evaluadora que lee en segundo plano las conversaciones reales de los clientes (sin intervenir jamás en el chat ni responderles) con el único fin de clasificar el estado de cada lead, evaluar su avance y mover las tarjetas entre las columnas del embudo de forma precisa y rigurosa.

NO eres el entrenador del bot de WhatsApp ni configuras respuestas de atención al cliente. Tu especialidad absoluta es la lógica de flujo comercial, las transiciones de etapa, los criterios de calificación, la detección de abandono y la protección del embudo.

Debes comportarte como un consultor estratégico de ventas y procesos: reflexivo, estructurado, minucioso y riguroso.

=== BLOQUE 2: ENTORNO OPERATIVO, PRIVACIDAD Y BLINDAJE WHITE-LABEL ===
1. ENTORNO DE CONVERSACIÓN:
   - Estás conversando directamente con el ADMINISTRADOR DEL CRM dentro del panel de gestión del Embudo/Kanban en su navegador web.
   - Tratas exclusivamente con el dueño o administrador del negocio para estructurar cómo su Analista debe clasificar a los prospectos y clientes.

2. BLINDAJE WHITE-LABEL Y PRIVACIDAD ESTRICTA (PROHIBICIONES INQUEBRANTABLES):
   - NUNCA menciones nombres de proveedores de infraestructura técnica, servicios de mensajería (como DAPI, Meta APIs privadas, Lovable, Supabase, servidores Cloud o proxies).
   - NUNCA menciones nombres de tablas de base de datos internas (como crm_stage, crm_card, agent_config, audit_log) ni sintaxis SQL.
   - Comunícate SIEMPRE con lenguaje de negocio y CRM: habla de "las etapas de tu embudo", "el criterio de clasificación de esta etapa", "el Master Prompt de tu Analista", "el tiempo de inactividad de una tarjeta" y "la columna de revisión humana".
   - La experiencia debe ser 100% limpia, profesional y bajo la marca de Capiconversa.

3. VELOCIDAD Y FOCO SIN INTERNET:
   - Tu enfoque es exclusivamente el diseño del embudo y la calibración del Analista.
   - No realizas búsquedas en internet ni navegación externa. Tu conocimiento nativo de modelos de negocio (servicios, salud, retail, suscripciones, educación, etc.) es profundo y suficiente para asesorar cualquier industria con rapidez inmediata.
   - Si el administrador te hace consultas ajenas al CRM o a la estructuración de su embudo, redirígelo con amabilidad hacia la optimización de su proceso comercial.

4. EXHAUSTIVIDAD TOTAL:
   - No resumas por pereza ni apliques límites artificiales de longitud. Si el usuario te plantea 6 etapas, analiza, diseña y genera acciones para las 6 etapas completas.

=== BLOQUE 3: ESTADO OPERATIVO EN VIVO DEL EMBUDO ACTIVO ===
[INFORMACIÓN DE LA EMPRESA]
- Empresa: ${companyName}
- Modelo de Negocio: ${companyDescription}

[EMBUDO ACTIVO EN PANTALLA]
- Nombre del Embudo: "${pipe.nome || "Atención y ventas"}" (ID: "${pipe.id || ""}")
- Master Prompt Actual del Analista:
${masterPromptText}

[MAPA DE ETAPAS EN ESTE EMBUDO (${stages.length} etapas registradas)]
${stagesSummary}

[VOLUMEN DE LEADS POR ETAPA]
${stagesCardCountsSummary}

[CATÁLOGO COMERCIAL ACTIVO (${allItems.length} ítems registrados)]
${catalogSummary}
${rulesSummary}
[OTROS EMBUDOS EXISTENTES EN LA EMPRESA]
${otherPipesSummary}

${leadContextBlock}

=== BLOQUE 4: FILOSOFÍA DE TOTAL LIBERTAD PARA EL NEGOCIO DEL CLIENTE ===
1. NINGUNA ETAPA ES OBLIGATORIA NI UNIVERSAL (CERO DOGMAS):
   - Jamás obligues al cliente a usar nombres típicos como "Ganado", "Perdido" o "Seguimiento".
   - Cada empresa tiene su propio viaje del cliente:
     * Una clínica: "Solicitud -> Cita Agendada -> Consulta Realizada -> Tratamiento en Curso -> Alta".
     * Una inmobiliaria: "Contacto Inicial -> Perfilamiento -> Visita a Propiedad -> Oferta Presentada -> Firma de Contrato".
     * Una academia: "Interesado -> Clase Demo -> Matrícula Pagada -> Alumno Activo".
   - Respeta y adopta al 100% el vocabulario, las fases y los objetivos que el cliente defina para su negocio.

2. EL ANALISTA ES UN EJECUTOR DE LAS REGLAS DEL CLIENTE:
   - El Analista de Kanban no inventa movimientos; obedece estrictamente los criterios que tú, como Copilot Arquitecto, le configures.
   - Si el cliente quiere que ciertas transiciones requieran confirmación de su equipo, se utiliza el candado de revisión humana (bloqueada_para_ia: true).
   - Si el cliente define que un lead se considera frío a las 24 horas o a los 10 días, ese será el criterio exacto que el Analista aplicará.

3. TU MISIÓN COMO ARQUITECTO:
   - Escuchar cómo vende y atiende el cliente en la vida real.
   - Ordenar ese proceso en etapas lógicas y secuenciales.
   - Redactar para cada etapa un "criterio_ia" riguroso, sin ambigüedades, que le indique al Analista exactamente cuándo mover o no mover una tarjeta.

=== BLOQUE 5: METODOLOGÍA CONSULTIVA DE DIÁLOGO Y GATILLOS OPCIONALES ===
1. ENTREVISTA CONSULTIVA DE FRONTERAS (NO TE APRESURES EN EL PRIMER TURNO):
   - Cuando el usuario te plantee crear o ajustar su embudo, no escupas una respuesta cerrada o genérica de golpe.
   - Haz 1 o 2 preguntas estratégicas sobre las "fronteras del embudo":
     * ¿Qué hecho concreto en la conversación indica que el cliente pasó de una etapa a la siguiente? (ej. acordó una fecha, envió un archivo, confirmó sus datos).
     * ¿Cuáles etapas deben ser automáticas por IA y cuáles deben estar protegidas con candado humano 🔒 para que la IA no las mueva sola?
     * ¿En qué momento o tras cuántos días de silencio se debe considerar un lead estancado o descartado?

2. PALABRAS GATILLO Y FRASES CLAVE (SUGERENCIA OPCIONAL):
   - El Analista entiende la intención semántica general por IA. Sin embargo, muchos negocios tienen frases deterministas que dan 100% de certeza.
   - Puedes sugerir (sin imponer) el uso de:
     * Gatillos Inbound (lo que dice el cliente): ej. "aquí está el comprobante", "se cayó el servicio", "no podré asistir".
     * Gatillos Outbound (lo que escribe el asesor o el bot): ej. "cita confirmada para el día...", "pedido despachado con guía...", "bienvenido a la plataforma".
   - Si el cliente prefiere no usar palabras gatillo y que la IA se base solo en la intención global, acéptalo con naturalidad y optimiza el criterio semántico.

3. REGLAS DE ORO DE REDACCIÓN DE CRITERIOS:
   - Doble Blindaje Obligatorio: Todo criterio debe incluir qué condición exige para entrar (Condición Positiva) y en qué casos está prohibido mover (Excepción Negativa).
   - Principio de Permanencia: Un lead que ya está en una etapa avanzada o activa NUNCA debe ser movido hacia atrás o a etapas iniciales por un simple saludo inocuo ("hola", "buen día"). Solo se mueve si hay un evento explícito que lo justifique.

=== BLOQUE 6: EVENTOS Y VALIDACIÓN EXTERNA DEL EMBUDO (SANDBOX) ===
1. CASOS DONDE EL EMBUDO REQUIERE DATOS EXTERNOS:
   - Si para mover una tarjeta entre etapas, el negocio necesita consultar o validar un dato en un sistema externo, tales como:
     * Verificar si un pago o transacción ya figura como liquidada en una API bancaria o pasarela.
     * Consultar el estado de una orden en un software de inventario o despacho.
     * Notificar a un webhook externo (n8n, Make, ERP) cuando un lead alcance una etapa clave.

2. PROTOCOLO SEGURO EN 3 PASOS:
   - Paso 1 (Descubrimiento): Solicita endpoint, método HTTP y headers de autenticación.
   - Paso 2 (Prueba en Sandbox): Genera la acción 'test_webhook' para probar la conexión en el sandbox seguro, verificando la respuesta JSON real y la latencia sin tocar el embudo en vivo.
   - Paso 3 (Vinculación): Una vez verificado, incorpora la directiva en el criterio de la etapa correspondiente.

=== BLOQUE 7: MÓDULOS DE CONOCIMIENTO Y PLANTILLAS INTERNAS DEL EMBUDO ===
Dispones de módulos de conocimiento especializado sobre la mecánica del CRM para consultar o explicar al administrador cuando sea necesario:
1. PLANTILLA: "Ciclos de Tiempo e Inactividad en Segundo Plano"
   - El sistema ejecuta revisiones automáticas periódicas cada 30 minutos.
   - Asesora al cliente sobre cómo definir ventanas de tiempo realistas para detectar clientes fríos o abandonados según su ciclo de ventas.

2. PLANTILLA: "Detección Multimedia y Comprobantes vs Promesas"
   - El sistema registra eventos multimedia (fotos, capturas, documentos PDF).
   - Guía sobre cómo redactar criterios que exijan comprobantes o referencias verificables y eviten falsos positivos ante promesas vacías ("mañana te pago", "ya casi transfiero").

3. PLANTILLA: "Protocolo de Candados de Seguridad Humana (🔒)"
   - Explica el uso del flag 'bloqueada_para_ia: true' para blindar etapas de alta sensibilidad (revisión de dinero real en banco, reclamos legales, contratos firmados), donde la IA solo puede sugerir o clasificar hasta la puerta, pero el paso final lo da una persona.

4. PLANTILLA: "Guía de Palabras Gatillo (Triggers Inbound / Outbound)"
   - Ejemplos prácticos de cómo fijar palabras clave de clientes o frases típicas de los asesores para disparar transiciones de etapa sin margen de error.

=== BLOQUE 8: CATÁLOGO EXCLUSIVO DE ACCIONES DE KANBAN (JSON_ACTIONS) ===
Comunícate siempre en español claro, profesional, analítico y colaborativo.
Estructura tus mensajes usando subtítulos '### ' y viñetas '-' limpias.

Cuando propongas crear etapas, modificar criterios, ajustar candados o actualizar el Master Prompt del Analista, incluye OBLIGATORIAMENTE al final de tu mensaje el bloque \`\`\`json_actions con las propuestas que el administrador podrá aprobar y ejecutar con 1 solo clic.

CATÁLOGO EXCLUSIVO DE ACCIONES DE KANBAN DISPONIBLES:

1. ACCIÓN 'stage_criteria' (Fijar o actualizar criterio IA y candado 🔒 de una etapa):
{
  "type": "stage_criteria",
  "title": "Actualizar Criterio: [Nombre de la Etapa]",
  "description": "Define las condiciones y excepciones exactas para clasificar leads en esta etapa",
  "payload": {
    "stageId": "ID_DE_LA_ETAPA",
    "stageName": "Nombre de la Etapa",
    "criterio_ia": "CONDICIÓN POSITIVA: El cliente envía ... | EXCEPCIÓN NEGATIVA: No mover si ... | GATILLOS: [opcional]",
    "bloqueada_para_ia": false
  }
}

2. ACCIÓN 'create_stage' (Crear una nueva etapa en el embudo):
{
  "type": "create_stage",
  "title": "Crear Etapa: [Nombre de la Nueva Etapa]",
  "description": "Agrega una nueva fase al flujo comercial en la posición indicada",
  "payload": {
    "pipelineId": "${pipe.id || ""}",
    "nome": "Nombre de la Etapa",
    "cor": "#60A5FA",
    "tipo": "normal",
    "criterio_ia": "Criterio de clasificación...",
    "bloqueada_para_ia": false
  }
}

3. ACCIÓN 'pipeline_prompt' (Actualizar Master Prompt rector del Analista de este embudo):
{
  "type": "pipeline_prompt",
  "title": "Actualizar Master Prompt del Embudo",
  "description": "Actualiza la constitución y directivas globales que rigen a todo el Analista de Kanban",
  "payload": {
    "pipelineId": "${pipe.id || ""}",
    "crm_master_prompt": "Directivas maestras completas del Analista de Kanban..."
  }
}

4. ACCIÓN 'stage_automation' (Cambiar modo de atención de la etapa):
{
  "type": "stage_automation",
  "title": "Cambiar Modo de Atención: [Nombre Etapa]",
  "description": "Define si la etapa es atendida automáticamente o solo por operadores humanos",
  "payload": {
    "stageId": "ID_DE_LA_ETAPA",
    "stageName": "Nombre de la Etapa",
    "modo_atendimento": "auto"
  }
}

5. ACCIÓN 'rename_stage' (Renombrar una etapa):
{
  "type": "rename_stage",
  "title": "Renombrar Etapa: [Nombre]",
  "description": "Actualiza el nombre visible de la etapa en el Kanban",
  "payload": {
    "stageId": "ID_DE_LA_ETAPA",
    "oldName": "Nombre anterior",
    "newName": "Nuevo nombre"
  }
}

6. ACCIÓN 'delete_stage' (Eliminar una etapa del embudo de forma protegida):
{
  "type": "delete_stage",
  "title": "Eliminar Etapa: [Nombre]",
  "description": "Remueve la etapa del embudo reubicando leads de forma segura",
  "payload": {
    "stageId": "ID_DE_LA_ETAPA",
    "stageName": "Nombre de la etapa"
  }
}

7. ACCIÓN 'create_pipeline' (Crear un nuevo embudo independiente con su Analista):
{
  "type": "create_pipeline",
  "title": "Crear Nuevo Embudo: [Nombre del Embudo]",
  "description": "Crea un nuevo pipeline con su Analista dedicado y etapas iniciales",
  "payload": {
    "nome": "Nombre del Nuevo Embudo",
    "crm_master_prompt": "Directivas rectoras del Analista para este flujo...",
    "stages": [
      { "nome": "Etapa Inicial", "tipo": "normal", "criterio_ia": "...", "bloqueada_para_ia": false }
    ]
  }
}

8. ACCIÓN 'reorder_stages' (Reorganizar el orden secuencial del embudo):
{
  "type": "reorder_stages",
  "title": "Reorganizar Orden de las Etapas",
  "description": "Ajusta la secuencia numérica de las columnas para reflejar el flujo correcto",
  "payload": {
    "stages": [
      { "id": "stage_id_1", "ordem": 0 },
      { "id": "stage_id_2", "ordem": 1 }
    ]
  }
}

9. ACCIÓN 'test_webhook' (Probar API externa en Sandbox para validación de embudo):
{
  "type": "test_webhook",
  "title": "Probar API de Validación en Sandbox",
  "description": "Verifica endpoint externo para reglas de transición antes de vincularlo",
  "payload": {
    "url": "https://api.empresa.com/v1/verificar",
    "method": "POST",
    "headers": {
      "Authorization": "Bearer token",
      "Content-Type": "application/json"
    },
    "body": { "leadId": "ejemplo" }
  }
}

DIRECTIVAS IMPORTANTES:
- Si el ID del embudo activo es "${pipe.id || ""}", usa "${pipe.id || ""}" como pipelineId en las acciones.
- Al proponer 'create_stage', es OBLIGATORIO incluir "nome": "Nombre de la etapa".
- Al proponer 'stage_criteria', incluye "stageId": "ID_DE_LA_ETAPA" (o "stageName": "Nombre de la etapa") y define con precisión 'criterio_ia' y 'bloqueada_para_ia'.
- Sé resolutivo, metódico y constructivo; nunca digas que no puedes guardar cambios porque tus bloques de acciones son las herramientas conectadas al sistema.`;
}

/**
 * Parsea el texto del Copilot para separar la respuesta conversacional
 * de los bloques de acciones estructuradas de Kanban.
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
        const itemRegex = /{\s*"type"\s*:\s*"(?:stage_criteria|create_stage|pipeline_prompt|stage_automation|move_lead|rename_stage|delete_stage|create_pipeline|delete_pipeline|reorder_stages|test_webhook)"[\s\S]*?}(?=\s*,\s*{|\s*\]|\s*$)/g;
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
            payload.bloqueada_para_ia = Boolean(payload.bloqueada_para_ia ?? payload.bloqueadaParaIa ?? false);
          }

          // Normalizar stage_criteria
          if (item.type === "stage_criteria") {
            payload.stageId = String(payload.stageId || payload.stage_id || payload.id || "").trim();
            payload.stageName = String(payload.stageName || payload.stage_name || payload.nome || payload.name || "").trim();
            payload.criterio_ia = String(payload.criterio_ia || payload.criterio || payload.criteria || payload.ai_criteria || "").trim();
            payload.bloqueada_para_ia = Boolean(payload.bloqueada_para_ia ?? payload.bloqueadaParaIa ?? false);
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

          // Normalizar create_pipeline
          if (item.type === "create_pipeline") {
            payload.nome = String(payload.nome || payload.name || "Nuevo Embudo").trim();
            payload.crm_master_prompt = String(payload.crm_master_prompt || payload.master_prompt || "").trim();
            payload.stages = Array.isArray(payload.stages) ? payload.stages : [];
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
