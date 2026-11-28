import { processAiResponse } from "@/lib/ai-engine.server";
import { processKanbanReguaForNumero, onCardResponse } from "@/lib/kanban-engine.server";
import { processDepartmentMenu } from "@/lib/department-menu.server";
import { processCsatChatReply } from "@/lib/csat-chat.server";

type Admin = any;

export async function processInboundAutomation(
  admin: Admin,
  params: {
    companyId: string;
    numero: string;
    texto: string;
    inboundMessageId: string;
    stageId?: string | null;
    responderEmAudio?: boolean;
    isAudioMessage?: boolean;
    instanceId?: string | null;
    channel?: string | null;
    provider?: string | null;
    externalConversationId?: string | null;
  },
) {
  const { companyId, numero, texto, inboundMessageId } = params;

  // Guard temprano: interceptar mensajes del dueño en Modo Secretario antes de pausas o automatizaciones
  const isGroup = Boolean(numero.includes("@g.us"));
  if (!isGroup && (!params.channel || params.channel === "whatsapp")) {
    try {
      const { matchSecretaryForPhone, handleSecretaryMessage } = await import("@/lib/ai-secretary.server");
      const secMatch = await matchSecretaryForPhone(admin, companyId, numero);
      if (secMatch.matched && secMatch.agent) {
        let audioUrl: string | null = null;
        let audioMime: string | null = null;
        const upperSec = (texto || "").trim().toUpperCase();
        const isSecAudio = Boolean(params.isAudioMessage) || upperSec === "[ÁUDIO]" || upperSec === "[AUDIO]";
        if (isSecAudio && inboundMessageId) {
          try {
            const { data: msgRow } = await admin
              .from("mensagens")
              .select("midia_url, midia_mime")
              .eq("company_id", companyId)
              .eq("id", inboundMessageId)
              .maybeSingle();
            audioUrl = msgRow?.midia_url ?? null;
            audioMime = msgRow?.midia_mime ?? null;
          } catch {}
        }
        await handleSecretaryMessage(admin, {
          companyId,
          agent: secMatch.agent,
          ownerPhone: numero,
          text: texto,
          instanceId: params.instanceId ?? null,
          isAudioMessage: isSecAudio,
          audioUrl,
          audioMime,
        });
        return { engine: "ai_secretary", handled: true };
      }
    } catch (secErr: any) {
      console.warn("[inbound-automation] Secretary guard warning:", secErr?.message);
    }
  }

  const triggerBackgroundLeadAudit = async () => {
    try {
      const { checkAndAnalyzeLeadCooldown } = await import("@/lib/crm-lead-analyzer.server");
      await checkAndAnalyzeLeadCooldown(companyId, numero);
    } catch (e: any) {
      console.warn("[inbound-automation] checkAndAnalyzeLeadCooldown error:", e?.message);
    }
  };



  // 0) Se a mensagem recebida for áudio, a IA não deve responder ou alucinar.
  // Pausa a IA para este contato e encaminha para atenção humana.
  const upperText = (texto || "").trim().toUpperCase();
  const isUntranscribedAudio =
    upperText === "[ÁUDIO]" ||
    upperText === "[AUDIO]" ||
    (Boolean(params.isAudioMessage) && !texto.trim());
  if (isUntranscribedAudio) {
    console.log(`[inbound] Áudio recebido de ${numero}. Pausando IA e encaminhando para atendimento humano.`);
    try {
      await admin.from("contact_pause").upsert(
        {
          company_id: companyId,
          numero: numero,
          pausado: true,
          pausado_por: "audio_inbound",
          pausado_em: new Date().toISOString(),
        },
        { onConflict: "company_id,numero" },
      );
    } catch (e: any) {
      console.warn("[inbound] erro ao pausar contato para áudio:", e?.message);
    }
    void triggerBackgroundLeadAudit();
    return { engine: "none", reason: "audio_inbound_human_attention" };
  }

  // 0c) Verificar control de conversación (Humano vs Workflow) scoped por instancia.
  // Un fallo del árbitro propaga error y no autoriza respuestas libres de IA.
  const { getConversationControl } = await import("@/lib/automations/conversation-control.server");
  const control = await getConversationControl({
    companyId,
    externalConversationId: params.externalConversationId || numero,
    instanceId: params.instanceId,
  });
  if (control.ownerKind === "human") {
    console.log(`[inbound] Conversación ${numero} (instancia: ${params.instanceId || 'general'}) controlada por asesor humano. Silenciando IA libre.`);
    void triggerBackgroundLeadAudit();
    return { engine: "none", reason: "human_control" };
  }
  if (control.ownerKind === "workflow" && control.leaseUntil && control.leaseUntil.getTime() > Date.now()) {
    console.log(`[inbound] Conversación ${numero} (instancia: ${params.instanceId || 'general'}) controlada por Workflow activo ${control.ownerExecutionId}. Silenciando IA libre.`);
    void triggerBackgroundLeadAudit();
    return { engine: "workflow", executionId: control.ownerExecutionId };
  }

  // 0d) Arbitraje síncrono con flujos publicados de automatización (Regla 1)
  // Al recibir un mensaje en WhatsApp/DM, verifica de forma síncrona si hace match
  // con un flujo publicado antes de invocar ai-engine.server.ts, para evitar
  // condiciones de carrera con la cola automation_events.
  try {
    const { checkSynchronousWorkflowMatch } = await import("@/lib/automations/arbitration.server");
    const isGroup = Boolean(numero.includes("@g.us"));
    const match = await checkSynchronousWorkflowMatch(admin, {
      companyId,
      channel: params.channel,
      instanceId: params.instanceId,
      text: texto,
      isGroup,
    });
    if (match.matched) {
      console.log(
        `[inbound] Mensaje entrante de ${numero} coincide con flujo publicado "${match.workflowName}" (${match.workflowId}). Priorizando automatización y silenciando IA libre.`,
      );
      void triggerBackgroundLeadAudit();
      return {
        engine: "workflow_matched",
        reason: "automation_priority",
        workflowId: match.workflowId,
        workflowName: match.workflowName,
      };
    }
  } catch (arbErr: any) {
    console.warn("[inbound] Aviso en arbitraje síncrono de automatizaciones:", arbErr?.message);
  }

  // 0b) Pesquisa de satisfação respondida no próprio chat (quando ativa para este contato).
  try {
    const csat = await processCsatChatReply(admin, { companyId, numero, texto, inboundMessageId });
    if (csat?.handled) return { engine: "csat_chat", result: csat };
  } catch (e) {
    console.warn("[inbound] csat chat falhou:", e);
  }

  const departmentMenu = await processDepartmentMenu(admin, { companyId, numero, texto, inboundMessageId });
  if (departmentMenu?.handled) {
    void triggerBackgroundLeadAudit();
    return { engine: "department_menu", result: departmentMenu };
  }

  // 1) O contato respondeu: aplica as regras "se responder" (mover etapa / parar régua).
  //    Só tem efeito se já houve mensagem nossa na etapa atual.
  await onCardResponse(admin, companyId, numero);

  // 2) Relê a etapa atual (pode ter mudado no passo acima).
  let stageId: string | null = null;
  {
    const { data: card } = await admin
      .from("crm_cards")
      .select("stage_id")
      .eq("company_id", companyId)
      .eq("numero", numero)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    stageId = card?.stage_id ?? params.stageId ?? null;
  }

  const { data: stage } = stageId
    ? await admin
        .from("crm_stage")
        .select("modo_atendimento, regua_ativa, mensagem_tipo, mensagem_texto, mensagem_prompt, mensagem_midia_url")
        .eq("id", stageId)
        .maybeSingle()
    : { data: null };

  const { resolveStageAiMeta } = await import("@/lib/crm-stage-meta");
  const cleanPrompt = resolveStageAiMeta(stage).mensagem_prompt;

  const mode = stage?.modo_atendimento || "auto";
  const hasFixedRule = Boolean(
    stage?.regua_ativa &&
      stage?.mensagem_tipo !== "sem_mensagem" &&
      (stage?.mensagem_texto?.trim() || (stage?.mensagem_tipo === "ia_leve" && cleanPrompt) || stage?.mensagem_midia_url?.trim()),
  );



  if (mode !== "ia") {
    const regua = await processKanbanReguaForNumero(admin, companyId, numero);
    if (mode === "manual" || hasFixedRule) {
      await triggerBackgroundLeadAudit();
      return { engine: "regua", result: regua };
    }
  }

  if (mode === "manual") {
    await triggerBackgroundLeadAudit();
    return { engine: "none", reason: "manual" };
  }

  await processAiResponse(companyId, numero, texto, inboundMessageId, {
    responderEmAudio: !!params.responderEmAudio,
    channel: params.channel || null,
    provider: params.provider || null,
    instanceId: params.instanceId || null,
    externalConversationId: params.externalConversationId || numero,
  });

  // Se ejecuta DESPUÉS de processAiResponse para evitar condición de carrera en stage_id
  await triggerBackgroundLeadAudit();
  return { engine: "ia" };
}
