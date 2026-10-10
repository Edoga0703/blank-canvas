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
  },
) {
  const { companyId, numero, texto, inboundMessageId } = params;

  // 0) Se a mensagem recebida for áudio, a IA não deve responder ou alucinar.
  // Pausa a IA para este contato e encaminha para atenção humana.
  if (params.isAudioMessage || texto === "[ÁUDIO]") {
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
    return { engine: "none", reason: "audio_inbound_human_attention" };
  }

  // 0b) Pesquisa de satisfação respondida no próprio chat (quando ativa para este contato).
  try {
    const csat = await processCsatChatReply(admin, { companyId, numero, texto, inboundMessageId });
    if (csat?.handled) return { engine: "csat_chat", result: csat };
  } catch (e) {
    console.warn("[inbound] csat chat falhou:", e);
  }

  const departmentMenu = await processDepartmentMenu(admin, { companyId, numero, texto, inboundMessageId });
  if (departmentMenu?.handled) return { engine: "department_menu", result: departmentMenu };

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

  const mode = stage?.modo_atendimento || "auto";
  const hasFixedRule = Boolean(
    stage?.regua_ativa &&
      stage?.mensagem_tipo !== "sem_mensagem" &&
      (stage?.mensagem_texto?.trim() || stage?.mensagem_prompt?.trim() || stage?.mensagem_midia_url?.trim()),
  );

  if (mode !== "ia") {
    const regua = await processKanbanReguaForNumero(admin, companyId, numero);
    if (mode === "manual" || hasFixedRule) {
      return { engine: "regua", result: regua };
    }
  }

  if (mode === "manual") {
    return { engine: "none", reason: "manual" };
  }

  await processAiResponse(companyId, numero, texto, inboundMessageId, {
    responderEmAudio: !!params.responderEmAudio,
  });
  return { engine: "ia" };
}