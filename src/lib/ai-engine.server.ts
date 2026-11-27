
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { isWithinBusinessHours } from "@/lib/business-hours";
import { getStagesBrief } from "@/lib/crm-engine.server";
import { buildSystemPrompt, parseAiOutput } from "@/lib/ai-prompt";
import { lovableAiChat, type ChatMsg } from "@/lib/lovable-ai.server";
import { waSendText, waPresenceTyping, getActiveInstance, getActiveInstanceForContact } from "@/lib/wa-dispatch.server";

export async function processAiResponse(
  companyId: string,
  number: string,
  incomingText: string,
  inboundMessageId: string,
  opts: {
    responderEmAudio?: boolean;
    channel?: string | null;
    provider?: string | null;
    instanceId?: string | null;
    externalConversationId?: string | null;
    skipDebounce?: boolean;
    existingProcessingId?: string | null;
  } = {},
) {
  console.log(`[ai-engine] EXECUTING for ${number} (Company: ${companyId}) at ${new Date().toISOString()}`);
  const turnStartedAt = Date.now();
  let traceAgentId: string | null = null;
  let traceInstId: string | null = opts.instanceId ?? null;
  let traceProvider: string | null = opts.provider ?? null;
  let traceModel: string | null = null;
  let traceRoute = "general";
  let traceChunksUsed: Array<{ id: string; source_name: string }> = [];
  const traceToolsUsed: any[] = [];
  let tracePromptChars: number | null = null;
  let traceHandoff = false;

  const logDetails = {
    number,
    companyId,
    instanceId: opts.instanceId ?? null,
    channel: opts.channel ?? null,
    incomingText: incomingText.slice(0, 50),
  };

  let processingRow: { id: string; created_at: string } | null = null;
  if (opts.existingProcessingId) {
    const { data: existingProc, error: existingErr } = await (supabaseAdmin as any)
      .from("ai_message_processing")
      .select("id, created_at")
      .eq("id", opts.existingProcessingId)
      .eq("company_id", companyId)
      .maybeSingle();
    if (existingErr || !existingProc?.id) {
      throw existingErr || new Error("Registro de processamento do debounce não encontrado");
    }
    processingRow = existingProc;
  } else {
    const { data: insertedProc, error: processingError } = await (supabaseAdmin as any)
      .from("ai_message_processing")
      .insert({
        company_id: companyId,
        inbound_message_id: inboundMessageId,
        numero: number,
        instance_id: opts.instanceId ?? null,
        channel: opts.channel ?? null,
        provider: opts.provider ?? null,
        external_conversation_id: opts.externalConversationId ?? number,
        responder_em_audio: !!opts.responderEmAudio,
        incoming_text: incomingText,
        status: "processing",
      })
      .select("id, created_at")
      .maybeSingle();

    if (processingError?.code === "23505") {
      console.log(`[ai-engine] Duplicate inbound message ignored: ${inboundMessageId}`);
      return;
    }
    if (processingError || !insertedProc?.id) {
      throw processingError || new Error("Não foi possível registrar o processamento da mensagem");
    }
    processingRow = insertedProc;
  }
  if (!processingRow) {
    throw new Error("Registro de processamento ausente");
  }
  const processing: { id: string; created_at: string } = processingRow;

  // Se a mensagem recebida for áudio, a IA não deve responder ou alucinar.
  // Pausa a IA para este contato e encaminha para atenção humana.
  const upperIncoming = (incomingText || "").trim().toUpperCase();
  if (
    upperIncoming === "[ÁUDIO]" ||
    upperIncoming.startsWith("[ÁUDIO]") ||
    upperIncoming === "[AUDIO]" ||
    upperIncoming.startsWith("[AUDIO]")
  ) {
    console.log(`[ai-engine] Mensagem de áudio recebida para ${number}. IA ignorando áudio e marcando para atenção humana.`);
    try {
      await supabaseAdmin.from("contact_pause").upsert(
        {
          company_id: companyId,
          numero: number,
          pausado: true,
          pausado_por: "audio_inbound",
          pausado_em: new Date().toISOString(),
        } as any,
        { onConflict: "company_id,numero" },
      );
    } catch (e: any) {
      console.warn("[ai-engine] erro ao pausar contato para áudio:", e?.message);
    }
    await (supabaseAdmin as any)
      .from("ai_message_processing")
      .update({ status: "completed", error_message: "Audio inbound skipped for human attention" })
      .eq("id", processing.id);
    return;
  }
  
  try {
    // Tenta logar o início, mas não trava se falhar
    await (supabaseAdmin as any).from("audit_log").insert({
      company_id: companyId,
      acao: "ai_start",
      detalhes: logDetails
    });
  } catch (e) {
    console.error("[ai-engine] Failed to insert ai_start log:", e);
  }

  try {
    async function resolveRequiredInstance(targetUserId?: string | null) {
      try {
        const resolved = await getActiveInstanceForContact(
          companyId,
          number,
          targetUserId || undefined,
          opts.instanceId ?? null,
        );
        if (!resolved) {
          if (opts.instanceId) {
            await (supabaseAdmin as any)
              .from("ai_message_processing")
              .update({ status: "skipped", error_message: "connection_changed_or_disconnected" })
              .eq("id", processing!.id);
          }
          return null;
        }
        if (opts.instanceId) {
          const isUp = (resolved.status === "connected" || resolved.status === "open") && !resolved.paused;
          if (resolved.id !== opts.instanceId || !isUp) {
            await (supabaseAdmin as any)
              .from("ai_message_processing")
              .update({ status: "skipped", error_message: "connection_changed_or_disconnected" })
              .eq("id", processing!.id);
            return null;
          }
        }
        return resolved;
      } catch (instErr: any) {
        if (opts.instanceId) {
          console.warn("[ai-engine] Instance constraint rejected reply:", instErr?.message);
          await (supabaseAdmin as any)
            .from("ai_message_processing")
            .update({ status: "skipped", error_message: "connection_changed_or_disconnected" })
            .eq("id", processing!.id);
          return null;
        }
        throw instErr;
      }
    }

    // B-02: Resolve o agente dinamicamente pelo estágio/pipeline ou default
    const { data: cardRowsPre } = await (supabaseAdmin as any)
      .from("crm_cards")
      .select("stage_id")
      .eq("company_id", companyId)
      .eq("numero", number)
      .not("stage_id", "is", null)
      .order("updated_at", { ascending: false })
      .limit(1);
    const preStageId = cardRowsPre?.[0]?.stage_id;

    let targetAgentId: string | null = null;
    if (preStageId) {
      const { data: stRow } = await supabaseAdmin
        .from("crm_stage")
        .select("agent_id, pipeline_id")
        .eq("id", preStageId)
        .maybeSingle();
      targetAgentId = stRow?.agent_id || null;
      if (!targetAgentId && stRow?.pipeline_id) {
        const { data: plRow } = await (supabaseAdmin as any)
          .from("crm_pipeline")
          .select("agent_id")
          .eq("id", stRow.pipeline_id)
          .maybeSingle();
        targetAgentId = plRow?.agent_id || null;
      }
    }

    let agentQuery = supabaseAdmin.from("agent_config").select("*").eq("company_id", companyId);
    if (targetAgentId) {
      agentQuery = agentQuery.eq("id", targetAgentId);
    } else {
      agentQuery = agentQuery.order("is_default", { ascending: false }).order("updated_at", { ascending: true });
    }

    const [{ data: cfgRows }, { data: company }] = await Promise.all([
      agentQuery.limit(1),
      supabaseAdmin
        .from("company")
        .select("creditos_saldo, status_cobranca")
        .eq("id", companyId)
        .maybeSingle()
    ]);

    const cfg = cfgRows?.[0] || null;

    if (!cfg) {
      console.warn(`[ai-engine] No agent config for company ${companyId}`);
      await supabaseAdmin.from("audit_log").insert({
        company_id: companyId,
        acao: "ai_error",
        detalhes: { error: "Configuração do agente de IA não encontrada para esta empresa." }
      } as any);
      await (supabaseAdmin as any)
        .from("ai_message_processing")
        .update({ status: "skipped", error_message: "no_agent_config" })
        .eq("id", processing.id);
      return;
    }

    // B-10: Avaliação de palavra_pausar e palavra_despausar
    const textTrim = incomingText.trim().toLowerCase();
    const pPausar = (cfg.palavra_pausar || "/pausar").trim().toLowerCase();
    const pDespausar = (cfg.palavra_despausar || "/despausar").trim().toLowerCase();

    if (textTrim === pPausar || textTrim.startsWith(pPausar + " ")) {
      console.log(`[ai-engine] Comando de pausa '${pPausar}' recebido de ${number}`);
      await supabaseAdmin.from("contact_pause").upsert(
        {
          company_id: companyId,
          numero: number,
          pausado: true,
          pausado_por: "comando_palavra_pausar",
          pausado_em: new Date().toISOString(),
        } as any,
        { onConflict: "company_id,numero" }
      );
      await (supabaseAdmin as any)
        .from("ai_message_processing")
        .update({ status: "completed", error_message: "chat_paused_by_keyword" })
        .eq("id", processing.id);
      return;
    }

    if (textTrim === pDespausar || textTrim.startsWith(pDespausar + " ")) {
      console.log(`[ai-engine] Comando de despausa '${pDespausar}' recebido de ${number}`);
      await supabaseAdmin
        .from("contact_pause")
        .update({ pausado: false, pausado_por: null } as any)
        .eq("company_id", companyId)
        .eq("numero", number);
    }

    if (!company || (company.creditos_saldo ?? 0) <= 0) {
      console.warn(`[ai-engine] Insufficient credits for ${companyId}: ${company?.creditos_saldo}`);
      await supabaseAdmin.from("audit_log").insert({
        company_id: companyId,
        acao: "ai_error",
        detalhes: { error: "Saldo de créditos insuficiente ou empresa não encontrada.", creditos: company?.creditos_saldo }
      } as any);
      await (supabaseAdmin as any)
        .from("ai_message_processing")
        .update({ status: "skipped", error_message: "insufficient_credits" })
        .eq("id", processing.id);
      return;
    }

    console.log(`[ai-engine] Using provider=${cfg.ai_provider}, model=${cfg.ai_model} for contact ${number}`);

    // Fase A: Buffer / Debounce de Mensagens
    // Se o agente tem segundos_buffer configurado (> 0), aguarda para agrupar mensagens sucessivas
    // enviadas pelo cliente em rajada (burst), respondendo a todas de uma só vez de forma coerente.
    const bufferSec = Math.max(0, Math.min(60, Number(cfg.segundos_buffer ?? 0)));
    if (bufferSec > 0 && !opts.skipDebounce) {
      let useDurableQueue = false;
      try {
        const { data: hb } = await (supabaseAdmin as any)
          .from("master_settings")
          .select("value")
          .eq("key", "ai_debounce_dispatcher_heartbeat")
          .maybeSingle();
        const lastSeenStr = (hb?.value as any)?.last_seen_at;
        if (lastSeenStr) {
          const ageMs = Date.now() - new Date(lastSeenStr).getTime();
          if (Number.isFinite(ageMs) && ageMs >= 0 && ageMs < 45_000) {
            useDurableQueue = true;
          }
        }
      } catch {}

      if (useDurableQueue) {
        const debounceUntil = new Date(Date.now() + bufferSec * 1000).toISOString();
        await (supabaseAdmin as any)
          .from("ai_message_processing")
          .update({
            status: "debouncing",
            debounce_until: debounceUntil,
            instance_id: opts.instanceId ?? null,
            channel: opts.channel ?? null,
            provider: opts.provider ?? null,
            external_conversation_id: opts.externalConversationId ?? number,
            responder_em_audio: !!opts.responderEmAudio,
            incoming_text: incomingText,
            updated_at: new Date().toISOString(),
          })
          .eq("id", processing.id);
        console.log(`[ai-engine] Enqueued durable debounce for ${number} until ${debounceUntil}`);
        return;
      }

      const inlineWaitSec = Math.min(bufferSec, 5);
      console.log(`[ai-engine] Buffering inline for ${number} (${inlineWaitSec}s capped from ${bufferSec}s) at ${new Date().toISOString()}`);
      await new Promise((resolve) => setTimeout(resolve, inlineWaitSec * 1000));

      // Verifica se uma mensagem mais recente foi recebida para este contato durante a espera
      const { data: latestRows } = await (supabaseAdmin as any)
        .from("ai_message_processing")
        .select("id, created_at")
        .eq("company_id", companyId)
        .eq("numero", number)
        .order("created_at", { ascending: false })
        .limit(1);

      const latestRow = latestRows?.[0];
      const isSuperseded = Boolean(
        latestRow &&
        latestRow.id !== processing.id &&
        new Date(latestRow.created_at).getTime() >= new Date(processing.created_at).getTime()
      );

      if (isSuperseded) {
        console.log(`[ai-engine] Debounce: newer message arrived for ${number} (${latestRow?.id} supersedes ${processing.id}). Skipping.`);
        await (supabaseAdmin as any)
          .from("ai_message_processing")
          .update({ status: "skipped", error_message: "superseded_by_newer_message" })
          .eq("id", processing.id);
        return;
      }
    }

    // Consolidação de mensagens não respondidas (Fase A)
    // Busca o horário da última resposta de saída para este contato
    const { data: lastOutgoing } = await (supabaseAdmin as any)
      .from("mensagens")
      .select("created_at")
      .eq("company_id", companyId)
      .eq("numero", number)
      .eq("direcao", "saida")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const lastReplyTime = lastOutgoing?.created_at || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // Busca todas as mensagens de entrada do cliente desde a última resposta
    const { data: unrepliedMsgs } = await (supabaseAdmin as any)
      .from("mensagens")
      .select("id, texto, created_at, midia_tipo, midia_url, midia_mime, raw_payload")
      .eq("company_id", companyId)
      .eq("numero", number)
      .eq("direcao", "entrada")
      .gt("created_at", lastReplyTime)
      .order("created_at", { ascending: true });

    const { getOrAnalyzeMessageMedia } = await import("@/lib/media-understanding.server");
    const unrepliedRawList = unrepliedMsgs ?? [];
    const unrepliedTextParts: string[] = [];
    for (const m of unrepliedRawList) {
      let t = (m.texto || "").trim();
      if (m.midia_tipo === "image" || m.midia_tipo === "document") {
        const desc = await getOrAnalyzeMessageMedia(supabaseAdmin, m, companyId, { provider: cfg.ai_provider, model: cfg.ai_model });
        if (desc) {
          t = t ? `${t} [Archivo adjunto: ${desc}]` : `[Archivo adjunto: ${desc}]`;
        }
      }
      if (t) unrepliedTextParts.push(t);
    }
    const unrepliedList = unrepliedRawList.filter((m: any) => (m.texto && m.texto.trim().length > 0) || m.midia_url);
    const effectiveIncomingText = unrepliedTextParts.length > 0
      ? unrepliedTextParts.join("\n")
      : incomingText;

    const unrepliedIdSet = new Set(unrepliedList.map((m: any) => m.id));
    console.log(`[ai-engine] Consolidated incoming text for ${number} (${unrepliedList.length} msgs): "${effectiveIncomingText.slice(0, 80)}..."`);


    const horarios = cfg.horarios_atendimento as any;
    if (horarios && horarios.enabled) {
      const dentro = isWithinBusinessHours(horarios);
      if (!dentro) {
        console.log(`[ai-engine] Fora do horário de atendimento. IA silenciada.`);
        
        // Opcional: Enviar mensagem de "estamos fechados" se configurada
        const msgFora = (cfg as any).mensagem_fora_horario;
        if (msgFora) {
           // Só envia se não enviou recentemente (ex: última hora) para não floodar
           const { data: lastMsg } = await supabaseAdmin
             .from("mensagens")
             .select("created_at")
             .eq("company_id", companyId)
             .eq("numero", number)
             .eq("texto", msgFora)
             .order("created_at", { ascending: false })
             .limit(1)
             .maybeSingle();
           
           const umaHoraAtras = new Date(Date.now() - 60 * 60 * 1000).toISOString();
           if (!lastMsg || lastMsg.created_at < umaHoraAtras) {
              const inst = await resolveRequiredInstance();
              if (!inst) return;
              await waSendText(inst, number, msgFora);
              const { data: cardFora } = await supabaseAdmin
                .from("crm_cards")
                .select("owner_id, user_id")
                .eq("company_id", companyId)
                .eq("numero", number)
                .limit(1)
                .maybeSingle();
              const { error: foraErr } = await supabaseAdmin.from("mensagens").insert({
                company_id: companyId,
                user_id: (cardFora as any)?.owner_id || (cardFora as any)?.user_id || null,
                numero: number,
                texto: msgFora,
                direcao: "saida",
                autor: "ia",
                instance_id: inst.id ?? null,
                provider: inst.provider,
                status_envio: "enviado",
                created_at: new Date().toISOString()
              } as any);
              if (foraErr) console.warn("[ai-engine] falha ao registrar mensagem fora de horário:", foraErr);
           }
        }
        await (supabaseAdmin as any)
          .from("ai_message_processing")
          .update({ status: "skipped", error_message: "outside_business_hours" })
          .eq("id", processing.id);
        return;
      }
    }

    // 2. Verificar se a IA está pausada para este contato ou desativada na etapa atual
    // Pode haver mais de um card para o mesmo número (pipelines diferentes):
    // usamos o mais recente. maybeSingle() aqui retornava erro e travava a IA.
    const { data: cardRows } = await (supabaseAdmin as any)
      .from("crm_cards")
      .select("user_id, owner_id, id, stage_id, pipeline_id, updated_at, nome, canal_entrada, canal_chat, origem, utm_source, utm_medium, utm_campaign, utm_content, utm_term, gclid, fbclid, ctwa_clid, campos_extras, tags, valor, item_nome, client_memory, active_task")
      .eq("company_id", companyId)
      .eq("numero", number)
      .not("stage_id", "is", null)
      .order("updated_at", { ascending: false })
      .limit(1);
    const card = (cardRows ?? [])[0] ?? null;

    const [{ data: pause }, { data: stageCfg }] = await Promise.all([
      supabaseAdmin
        .from("contact_pause")
        .select("pausado, pausado_por, pausado_em")
        .eq("company_id", companyId)
        .eq("numero", number)
        .maybeSingle(),
      card?.stage_id 
        ? supabaseAdmin
            .from("crm_stage")
            .select("modo_atendimento, regua_ativa, mensagem_tipo, mensagem_texto, mensagem_prompt, mensagem_midia_url")
            .eq("id", card.stage_id)
            .maybeSingle()
        : Promise.resolve({ data: null })
    ]);

    if (pause?.pausado) {
      const pausedByHuman = (pause as any).pausado_por === "humano";
      const pausedByAudio = (pause as any).pausado_por === "audio_inbound";
      const pausedAt = (pause as any).pausado_em ? new Date((pause as any).pausado_em).getTime() : 0;
      const hoursSincePause = (Date.now() - pausedAt) / (3600 * 1000);

      // 1. Si la pausa fue por audio anterior y el cliente ahora escribe texto legible, reactivar automáticamente
      const isNowTextMessage = Boolean(effectiveIncomingText && !/^\[(ÁUDIO|AUDIO)\]/i.test(effectiveIncomingText.trim()));
      const shouldClearAudioPause = pausedByAudio && isNowTextMessage;

      // 2. Si la etapa está configurada explícitamente en modo "ia" (y no fue pausada por humano), tiene prioridad
      const isExplicitIaStage = !pausedByHuman && stageCfg?.modo_atendimento === "ia";

      // 3. Si la pausa humana ocurrió hace más de 4 horas de inactividad, reactivar para no desatender al cliente
      // Solo si el lead NO tiene un operador humano asignado (si tiene dueño humano, se respeta la atención humana)
      const hasHumanOwner = Boolean(card?.owner_id);
      const isStaleHumanPause = pausedByHuman && !hasHumanOwner && hoursSincePause > 4;

      if (shouldClearAudioPause || isExplicitIaStage || isStaleHumanPause) {
        console.log(`[ai-engine] Clearing pause for ${number} (audioRecover=${shouldClearAudioPause}, explicitIa=${isExplicitIaStage}, staleHuman=${isStaleHumanPause})`);
        await supabaseAdmin
          .from("contact_pause")
          .update({ pausado: false, pausado_por: null } as any)
          .eq("company_id", companyId)
          .eq("numero", number);
      } else {
        console.log(`[ai-engine] AI is paused for ${number} (por=${(pause as any).pausado_por ?? "?"})`);
        await (supabaseAdmin as any).from("ai_message_processing").update({ status: "skipped", error_message: "contact_paused" }).eq("id", processing.id);
        return;
      }
    }


    const { resolveStageAiMeta } = await import("./crm-stage-meta");
    const cleanStageCfgPrompt = resolveStageAiMeta(stageCfg).mensagem_prompt;
    const stageHasFixedRule = Boolean(
      stageCfg?.regua_ativa &&
        stageCfg?.mensagem_tipo !== "sem_mensagem" &&
        (stageCfg?.mensagem_texto?.trim() || (stageCfg?.mensagem_tipo === "ia_leve" && cleanStageCfgPrompt) || stageCfg?.mensagem_midia_url?.trim()),
    );
    const aiAllowed = stageCfg?.modo_atendimento === "ia" ||
      (stageCfg?.modo_atendimento === "auto" && !stageHasFixedRule);
    if (stageCfg && !aiAllowed) {
      console.log(`[ai-engine] AI is disabled for stage ${card?.stage_id} (mode=${stageCfg.modo_atendimento})`);
      await (supabaseAdmin as any).from("ai_message_processing").update({ status: "skipped", error_message: "stage_ai_disabled" }).eq("id", processing.id);
      return;
    }
    // Sem etapa configurada = sem agente designado. Nunca ativar a IA por padrão.
    if (!stageCfg) {
      console.log(`[ai-engine] No stage for ${number} — AI not allowed`);
      await (supabaseAdmin as any).from("ai_message_processing").update({ status: "skipped", error_message: "no_stage" }).eq("id", processing.id);
      return;
    }
    // Um humano atendeu recentemente (inclusive após encerrar o ticket): a IA não assume sozinha,
    // exceto em etapas explicitamente configuradas como "IA".
    if (stageCfg.modo_atendimento !== "ia") {
      const desde = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
      const { data: humano } = await (supabaseAdmin as any)
        .from("mensagens")
        .select("id")
        .eq("company_id", companyId)
        .eq("numero", number)
        .eq("direcao", "saida")
        .eq("autor", "humano")
        .gte("created_at", desde)
        .limit(1);
      if ((humano ?? []).length > 0) {
        console.log(`[ai-engine] Human handled ${number} in last 24h — AI stays off (mode=${stageCfg.modo_atendimento})`);
        await (supabaseAdmin as any).from("ai_message_processing").update({ status: "skipped", error_message: "human_handled_recently" }).eq("id", processing.id);
        return;
      }
    }


    // Regra determinística imediata (Turno 1+): se o cliente pede explicitamente falar com uma pessoa/humano,
    // transfere na hora sem esperar 3 trocas nem chamar o LLM.
    const EXPLICIT_HUMAN_HANDOFF_RE =
      /\b(hablar con (un |una )?(humano|persona|asesor|agente real|alguien)|falar com (um |uma )?(humano|atendente|pessoa|vendedor)|quero atendimento humano|atendente humano)\b/i;
    if (EXPLICIT_HUMAN_HANDOFF_RE.test(effectiveIncomingText)) {
      const handoffInst = await resolveRequiredInstance(card?.owner_id || card?.user_id);
      if (!handoffInst) return;

      const { data: handoffInstRow } = await supabaseAdmin
        .from("whatsapp_instances")
        .select("user_id")
        .eq("instance_name", handoffInst.instance_name)
        .maybeSingle();
      let resolvedOwnerId: string | null = card?.owner_id || card?.user_id || handoffInstRow?.user_id || null;

      if (card?.id && card?.stage_id) {
        try {
          const { data: stgHandoff } = await (supabaseAdmin as any)
            .from("crm_stage")
            .select("ia_handoff_stage_id")
            .eq("id", card.stage_id)
            .maybeSingle();
          const targetStageId = stgHandoff?.ia_handoff_stage_id;
          if (targetStageId && targetStageId !== card.stage_id) {
            const { data: targetStageCfg } = await supabaseAdmin
              .from("crm_stage")
              .select("id, nome, modo_atendimento, mensagem_prompt")
              .eq("id", targetStageId)
              .eq("company_id", companyId)
              .maybeSingle();
            if (targetStageCfg) {
              const { resolveStageAiMeta } = await import("./crm-stage-meta");
              const stageMeta = resolveStageAiMeta(targetStageCfg);
              if (!stageMeta.bloqueada_para_ia) {
                let nextOwner = card.owner_id;
                if (targetStageCfg.modo_atendimento === "manual") {
                  const { pickLeadOwner } = await import("./crm-engine.server");
                  nextOwner = (await pickLeadOwner(supabaseAdmin, companyId, targetStageCfg.id)) || nextOwner || null;
                }
                const { moveCardToStage } = await import("./crm-engine.server");
                await moveCardToStage(supabaseAdmin, card.id, targetStageCfg.id, { owner_id: nextOwner });
                if (nextOwner) resolvedOwnerId = nextOwner;
              }
            }
          }
        } catch (moveErr: any) {
          console.warn("[ai-engine] Erro ao mover etapa no handoff determinístico:", moveErr?.message);
        }
      }

      const lang = String((cfg as any).idioma || "pt-BR").toLowerCase();
      const handoffReply = lang.startsWith("es")
        ? "Perfecto, te transfiero ahora mismo con un asesor de nuestro equipo. En un momento te atenderán por aquí."
        : lang.startsWith("en")
          ? "Of course! I'm connecting you with a member of our team now. Someone will reply shortly."
          : "Claro! Já estou te transferindo para um atendente da nossa equipe. Em instantes alguém te responde por aqui.";

      const handoffSend = await waSendText(handoffInst, number, handoffReply);
      const { extractWhatsappMessageId } = await import("@/lib/whatsapp-helpers");
      const handoffMsgId = extractWhatsappMessageId(handoffSend) || null;
      await supabaseAdmin.from("mensagens").insert({
        company_id: companyId,
        user_id: resolvedOwnerId,
        numero: number,
        texto: handoffReply,
        direcao: "saida",
        autor: "ia",
        instance_id: handoffInst.id ?? null,
        provider: handoffInst.provider,
        whatsapp_message_id: handoffMsgId,
        status_envio: "enviado",
        created_at: new Date().toISOString(),
      } as any);

      await supabaseAdmin.from("contact_pause").upsert(
        {
          company_id: companyId,
          user_id: resolvedOwnerId,
          numero: number,
          pausado: true,
          pausado_por: "ia",
          pausado_em: new Date().toISOString(),
        } as any,
        { onConflict: "company_id,numero" },
      );

      await (supabaseAdmin as any)
        .from("ai_message_processing")
        .update({ status: "completed", error_message: "deterministic_human_handoff" })
        .eq("id", processing.id);
      return;
    }

    // A abertura é um texto fixo, não um pedido para a IA. No primeiro contato,
    // enviamos o conteúdo exatamente como foi salvo para preservar linhas,
    // listas, espaços e emojis. A IA assume a conversa apenas na próxima entrada.
    const initialMessage = typeof cfg.apresentacao === "string" ? cfg.apresentacao : "";
    if (initialMessage.length > 0) {
      const { data: previousOutgoing } = await supabaseAdmin
        .from("mensagens")
        .select("id")
        .eq("company_id", companyId)
        .eq("numero", number)
        .eq("direcao", "saida")
        .limit(1);

      if (!previousOutgoing?.length) {
        const inst = await resolveRequiredInstance(card?.owner_id || card?.user_id);
        if (!inst) return;
        const initRes = await waSendText(inst, number, initialMessage);
        const { extractWhatsappMessageId } = await import("@/lib/whatsapp-helpers");
        const initMsgId = extractWhatsappMessageId(initRes) || null;
        const { error: initialInsertError } = await supabaseAdmin.from("mensagens").insert({
          company_id: companyId,
          user_id: card?.owner_id || card?.user_id || null,
          numero: number,
          texto: initialMessage,
          direcao: "saida",
          autor: "ia",
          instance_id: inst.id ?? null,
          provider: inst.provider,
          whatsapp_message_id: initMsgId,
          status_envio: "enviado",
          created_at: new Date().toISOString(),
        } as any);
        if (initialInsertError) throw initialInsertError;
        // A IA continua o fluxo para responder também a pergunta desta primeira mensagem.
      }

    }

    traceAgentId = cfg.id ?? null;
    traceProvider = cfg.ai_provider || traceProvider;
    traceModel = cfg.ai_model || null;

    // 3. Pre-Router determinista antes de cargar historial, catálogo y RAG
    const [{ count: catalogCount }, { count: indexedChunksCount }] = await Promise.all([
      (supabaseAdmin as any)
        .from("produto")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .eq("ativo", true),
      cfg.id
        ? (supabaseAdmin as any)
            .from("agent_knowledge_chunks")
            .select("id", { count: "exact", head: true })
            .eq("company_id", companyId)
            .eq("agent_id", cfg.id)
            .eq("active", true)
        : Promise.resolve({ count: 0 }),
    ]);

    const hasIndexedRagChunks = Number(indexedChunksCount ?? 0) > 0;
    const { planTurnContext } = await import("@/lib/ai-router.server");
    const turnPlan = planTurnContext({
      text: effectiveIncomingText,
      activeTask: card?.active_task ?? null,
      catalogCount: typeof catalogCount === "number" ? catalogCount : null,
    });
    traceRoute = turnPlan.route;

    // Carregar histórico recente para contexto (limitado pelo Pre-Router)
    const umaHoraAtras = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: historyMsgs } = await supabaseAdmin
      .from("mensagens")
      .select("id, autor, texto, midia_tipo, midia_url, midia_mime, raw_payload")
      .eq("company_id", companyId)
      .eq("numero", number)
      .gt("created_at", umaHoraAtras)
      .order("created_at", { ascending: false })
      .limit(turnPlan.historyLimit);

    const rawHistoryItems = (historyMsgs ?? []).filter((m: any) => !unrepliedIdSet.has(m.id)).reverse();
    const history: ChatMsg[] = [];
    for (const m of rawHistoryItems) {
      let content = m.texto || "";
      if (m.midia_tipo === "image" || m.midia_tipo === "document") {
        const desc = await getOrAnalyzeMessageMedia(supabaseAdmin, m, companyId, { provider: cfg.ai_provider, model: cfg.ai_model });
        if (desc) {
          content = content ? `${content}\n[Archivo adjunto: ${desc}]` : `[Archivo adjunto: ${desc}]`;
        } else if (!content) {
          content = `[Archivo adjunto: ${m.midia_tipo}]`;
        }
      }
      history.push({
        role: m.autor === "contato" ? "user" : "assistant",
        content: content || "",
      });
    }

    // 4. Buscar estágios do CRM, catálogo sob demanda e RAG Nivel 1
    let productQuery = (supabaseAdmin as any)
      .from("produto")
      .select("nome, preco, descricao, sku, foto_url, tipo, duracao_min, agendavel")
      .eq("company_id", companyId)
      .eq("ativo", true);
    if (turnPlan.route === "scheduling") {
      productQuery = productQuery.order("agendavel", { ascending: false }).order("ordem", { ascending: true });
    } else {
      productQuery = productQuery.order("ordem", { ascending: true });
    }

    const [stages, catResult, ragChunks, verifiedTools] = await Promise.all([
      getStagesBrief(supabaseAdmin, companyId, card?.pipeline_id),
      turnPlan.loadCatalog
        ? productQuery.limit(80)
        : Promise.resolve({ data: [] as any[] }),
      turnPlan.loadRag && hasIndexedRagChunks && cfg.id
        ? (await import("@/lib/knowledge-rag.server")).retrieveKnowledgeChunks(supabaseAdmin, {
            companyId,
            agentId: cfg.id,
            query: effectiveIncomingText,
            limit: 5,
          })
        : Promise.resolve([]),
      cfg.id
        ? (await import("@/lib/agent-tools.server")).listVerifiedToolsForAgent(supabaseAdmin, companyId, cfg.id)
        : Promise.resolve([]),
    ]);
    const hasWebhookOutTools = verifiedTools.some((t) => t.kind === "webhook_out");

    const catRows = (catResult as any)?.data ?? [];
    traceChunksUsed = (ragChunks || []).map((ch) => ({ id: ch.id, source_name: ch.source_name }));
    if (traceChunksUsed.length > 0) traceToolsUsed.push("rag");

    const produtos = (catRows ?? []).map((p: any) => ({
      nome: p.nome,
      preco: p.preco,
      descricao: p.descricao,
      sku: p.sku,
      foto_url: p.foto_url,
      tipo: p.tipo === "servico" ? "servico" : "produto",
      duracao_min: p.duracao_min,
      agendavel: p.agendavel,
    }));

    // 4b. Catálogo ao vivo do ERP Olist (preço + estoque reais), quando habilitado e rota pedir catálogo
    let olistCatalogo = "";
    let olistPedidoAtivo = false;
    try {
      const anyCfg = cfg as any;
      if (anyCfg.olist_catalogo || anyCfg.olist_pedido_auto) {
        const { capacidadeAtiva } = await import("@/lib/plugin-gate.server");
        if (await capacidadeAtiva(supabaseAdmin, companyId, "olist")) {
          olistPedidoAtivo = Boolean(anyCfg.olist_pedido_auto);
          if (anyCfg.olist_catalogo && turnPlan.loadCatalog) {
            const { blocoCatalogoOlist } = await import("@/lib/olist-ai.server");
            olistCatalogo = await blocoCatalogoOlist(
              supabaseAdmin,
              companyId,
              effectiveIncomingText,
            );
            if (olistCatalogo) traceToolsUsed.push("olist_catalog");
          }
        }
      }
    } catch (e: any) {
      console.warn("[ai-engine] Olist indisponível para o prompt:", e?.message);
    }

    // B-06: Consulta feedback humano prévio e integração do Google Calendar
    const [{ data: feedbackRows }, { data: googleIntegration }] = await Promise.all([
      supabaseAdmin
        .from("agent_feedback")
        .select("rating, mensagem_texto, nota")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(8),
      supabaseAdmin
        .from("google_integration")
        .select("company_id, conectado")
        .eq("company_id", companyId)
        .eq("conectado", true)
        .maybeSingle()
    ]);

    const feedbackHints = (feedbackRows ?? []).map((f: any) => ({
      rating: (f.rating === "up" ? "up" : "down") as "up" | "down",
      texto: f.mensagem_texto || "",
      nota: f.nota || null,
    }));
    const googleConectado = Boolean(googleIntegration && googleIntegration.conectado);

    // 5. Resolver instância ativa antes de montar o prompt (evita TDZ e chamadas desnecessárias à IA)
    console.log(`[ai-engine] Loading active instance for contact ${number} (company ${companyId}, instanceOverride=${opts.instanceId ?? "none"})...`);
    const inst = await resolveRequiredInstance(card?.owner_id || card?.user_id);
    if (!inst) {
      if (!opts.instanceId) {
        console.error("[ai-engine] No active instance found to reply");
        await (supabaseAdmin as any).from("audit_log").insert({
          company_id: companyId,
          acao: "ai_error",
          detalhes: { error: "Nenhuma instância ativa encontrada para responder.", number }
        });
        await (supabaseAdmin as any).from("ai_message_processing").update({ status: "skipped", error_message: "no_active_instance" }).eq("id", processing.id);
      }
      return;
    }
    traceInstId = inst.id ?? traceInstId;
    console.log(`[ai-engine] Found instance: ${inst.instance_name} (${inst.provider})`);

    const system = buildSystemPrompt(cfg as any, {
      responderEmPartes: cfg.responder_em_partes ?? true,
      stages: stages as any,
      produtos: produtos as any,
      feedback: feedbackHints,
      feedbackHints,
      googleConectado,
      canal: inst.provider === "meta_instagram" ? "Instagram Direct" : inst.provider === "meta_messenger" ? "Messenger" : inst.provider === "telegram" ? "Telegram" : "WhatsApp",
      olistCatalogo,
      olistPedido: olistPedidoAtivo,
      ragChunks,
      hasIndexedRagChunks,
      clientMemory: card?.client_memory ?? null,
      activeTask: card?.active_task ?? null,
      receiptDetected: turnPlan.receiptDetected,
      verifiedTools: verifiedTools.map((t) => ({
        name: t.name,
        display_name: t.display_name,
        description: t.description,
        kind: t.kind,
        permission_level: t.permission_level,
        input_schema: t.input_schema,
      })),
    });


    // Inyección dinámica externa de cliente (ej. SMP / Cerebro / API de gestión) si está activa
    let dynamicCustomerPrompt = "";
    const customerLookupConfig = (cfg as any)?.canais_ativos?.integrations?.customerLookup || (cfg as any)?.canais_ativos?.customerLookup || (cfg as any)?.knowledge_files?.integrations?.customerLookup;
    if (customerLookupConfig?.enabled && customerLookupConfig?.url) {
      try {
        const { queryCustomerLookup } = await import("./customer-lookup.server");
        dynamicCustomerPrompt = await queryCustomerLookup(customerLookupConfig, number);
        if (dynamicCustomerPrompt) {
          traceToolsUsed.push("customer_lookup");
          console.log(`[ai-engine] Customer lookup injected for contact ${number}`);
        }
      } catch (lookupErr) {
        console.warn("[ai-engine] Customer lookup error:", lookupErr);
      }
    }

    let metaCapiConfig: any = null;
    try {
      const { getMetaCapiConfig } = await import("./meta-capi.server");
      metaCapiConfig = await getMetaCapiConfig(companyId);
    } catch (e) {
      console.warn("[ai-engine] Failed to load Meta CAPI config:", e);
    }

    const { buildStructuredContextBlock } = await import("./ai-prompt");
    const structuredContextBlock = buildStructuredContextBlock({
      canal: inst.provider === "meta_instagram" ? "Instagram Direct" : inst.provider === "meta_messenger" ? "Messenger" : inst.provider === "telegram" ? "Telegram" : "WhatsApp",
      instanciaNome: inst.instance_name,
      contatoNumero: number,
      card,
      metaCapiConfig,
      hasWebhookOutTools,
      externalData: dynamicCustomerPrompt ? { smp: "datos_reales_smp_disponibles" } : undefined,
    });

    const fullSystemPrompt = [
      system,
      dynamicCustomerPrompt,
      structuredContextBlock,
    ].filter(Boolean).join("\n\n");
    tracePromptChars = fullSystemPrompt.length;

    // 6. Chamar a IA com o provedor configurado
    const response = await lovableAiChat(
      [
        { role: "system", content: fullSystemPrompt },
        ...history,
        { role: "user", content: effectiveIncomingText }
      ],
      {
        provider: cfg.ai_provider || "gemini",
        model: cfg.ai_model || undefined,
        jsonMode: true,
        telemetry: {
          companyId,
          userId: card?.owner_id || card?.user_id || null,
          agentId: cfg.id || null,
          feature: "chat_agent",
        },
      }
    );

    console.log(`[ai-engine] AI RAW RESPONSE for ${number}:`, response);

    let finalResponse = response;
    let parsed = parseAiOutput(finalResponse, stages as any);
    let pendingOwnerToolApproval: Record<string, any> | null = null;

    if (parsed.toolCall?.nombre && cfg.id) {
      const requestedToolName = parsed.toolCall.nombre;
      const matchedTool = verifiedTools.find(
        (t) => t.name === requestedToolName && t.kind === "http",
      );

      if (matchedTool) {
        if (matchedTool.permission_level === "write_require_owner_approval") {
          traceToolsUsed.push({
            name: matchedTool.name,
            ok: false,
            status: "awaiting_owner_approval",
            requiresApproval: true,
          });
          pendingOwnerToolApproval = {
            tipo: "tool_approval",
            estado: "awaiting_owner_approval",
            tool: matchedTool.name,
            args: parsed.toolCall.argumentos || {},
            updated_at: new Date().toISOString(),
          };
        } else {
          try {
            const { executeVerifiedTool } = await import("@/lib/agent-tools.server");
            const toolRes = await executeVerifiedTool(supabaseAdmin, {
              companyId,
              agentId: cfg.id,
              toolName: matchedTool.name,
              args: parsed.toolCall.argumentos || {},
              context: {
                phone: number,
                numero: number,
                cardId: card?.id ?? null,
                companyId,
                channel: opts.channel ?? null,
                name: card?.nome ?? null,
              },
            });

            traceToolsUsed.push({
              name: matchedTool.name,
              ok: toolRes.ok,
              status: toolRes.status ?? (toolRes.requiresConfirmation ? 409 : null),
              latencyMs: toolRes.latencyMs ?? 0,
            });

            const safeToolPayload = JSON.stringify({
              tool: matchedTool.name,
              ok: toolRes.ok,
              status: toolRes.status ?? null,
              requiresConfirmation: Boolean(toolRes.requiresConfirmation),
              reason: toolRes.reason ?? null,
              data: toolRes.data ?? null,
              error: toolRes.error ?? null,
            }).slice(0, 4200);

            const followUpResponse = await lovableAiChat(
              [
                { role: "system", content: fullSystemPrompt },
                ...history,
                { role: "user", content: effectiveIncomingText },
                { role: "assistant", content: response },
                {
                  role: "user",
                  content: `Resultado real de la herramienta "${matchedTool.name}": ${safeToolPayload}\n\nRedacta ahora la respuesta final para el cliente usando exactamente el mismo protocolo JSON canónico (con "usar_herramienta": null). Nunca reveles credenciales ni URLs internas.`,
                },
              ],
              {
                provider: cfg.ai_provider || "gemini",
                model: cfg.ai_model || undefined,
                jsonMode: true,
                telemetry: {
                  companyId,
                  userId: card?.owner_id || card?.user_id || null,
                  agentId: cfg.id || null,
                  feature: "chat_agent_tool_followup",
                },
              },
            );

            if (followUpResponse) {
              const secondParsed = parseAiOutput(followUpResponse, stages as any);
              if (secondParsed.parts.length > 0) {
                finalResponse = followUpResponse;
                parsed = {
                  ...secondParsed,
                  stage: secondParsed.stage ?? parsed.stage,
                  intent: secondParsed.intent ?? parsed.intent,
                  qualified: secondParsed.qualified || parsed.qualified,
                  handoff: secondParsed.handoff || parsed.handoff,
                  webhookSaliente: secondParsed.webhookSaliente ?? parsed.webhookSaliente,
                  clientMemoryUpdate: secondParsed.clientMemoryUpdate ?? parsed.clientMemoryUpdate,
                  activeTaskUpdate: secondParsed.activeTaskUpdate ?? parsed.activeTaskUpdate,
                };
              }
            }
          } catch (toolErr: any) {
            traceToolsUsed.push({
              name: matchedTool.name,
              ok: false,
              status: 500,
              latencyMs: 0,
            });
            console.warn(`[ai-engine] Verified tool execution error (${matchedTool.name}):`, toolErr?.message);
          }
        }
      }
    }

    try {
      await supabaseAdmin.from("audit_log").insert({
        company_id: companyId,
        acao: "ai_response",
        detalhes: { response: finalResponse.slice(0, 500), number }
      } as any);
    } catch (e) {
      console.error("[ai-engine] Failed to insert ai_response log:", e);
    }

    const replyParts = parsed.parts.map((part) => part.trim()).filter(Boolean);
    const replyText = replyParts.join("\n\n");
    console.log(`[ai-engine] Parsed intent: ${parsed.intent}, parts count: ${replyParts.length}, qualified: ${parsed.qualified}, sugestao: ${Boolean(parsed.sugestao)}`);

    const stage = parsed.stage;
    const intent = parsed.intent;
    const handoff = parsed.handoff;
    const qualified = parsed.qualified;
    traceHandoff = Boolean(handoff);

    // 7. Re-validação final ANTES de efeitos colaterais e envio de mensagens
    console.log(`[ai-engine] Preparing dispatch via instance: ${inst.instance_name} (${inst.provider})`);

    const { data: instRow } = await supabaseAdmin
      .from("whatsapp_instances")
      .select("user_id")
      .eq("instance_name", inst.instance_name)
      .maybeSingle();

    const targetUserId = card?.owner_id || card?.user_id || instRow?.user_id || null;

    const { data: latestCard } = card?.id
      ? await (supabaseAdmin as any)
          .from("crm_cards")
          .select("stage_id")
          .eq("id", card.id)
          .maybeSingle()
      : { data: null };
    const { data: latestStage } = latestCard?.stage_id
      ? await (supabaseAdmin as any)
          .from("crm_stage")
          .select("modo_atendimento, regua_ativa, mensagem_tipo, mensagem_texto, mensagem_prompt, mensagem_midia_url")
          .eq("id", latestCard.stage_id)
          .maybeSingle()
      : { data: null };

    const latestHasFixedRule = Boolean(
      latestStage?.regua_ativa &&
        latestStage?.mensagem_tipo !== "sem_mensagem" &&
        (latestStage?.mensagem_texto?.trim() || latestStage?.mensagem_prompt?.trim() || latestStage?.mensagem_midia_url?.trim()),
    );
    const latestAiAllowed = latestStage?.modo_atendimento === "ia" ||
      (latestStage?.modo_atendimento === "auto" && !latestHasFixedRule);
    // Só cancela se o card existe E a etapa atual passou a proibir a IA.
    // Sem card (contato fora do Kanban) a IA responde normalmente.
    if (card?.id && latestStage && !latestAiAllowed) {
      console.log(`[ai-engine] Reply cancelled because stage mode changed for ${number}`);
      await (supabaseAdmin as any).from("ai_message_processing").update({ status: "skipped", error_message: "stage_mode_changed_during_generation" }).eq("id", processing.id);
      return;
    }

    // Re-checagem antes de enviar: se um atendente assumiu enquanto a IA gerava
    // a resposta, cancelamos o envio (evita IA + humano respondendo juntos).
    const { data: pauseNow } = await supabaseAdmin
      .from("contact_pause")
      .select("pausado, pausado_por")
      .eq("company_id", companyId)
      .eq("numero", number)
      .maybeSingle();
    if ((pauseNow as any)?.pausado && (pauseNow as any)?.pausado_por === "humano") {
      console.log(`[ai-engine] Reply cancelled: atendente assumiu a conversa de ${number}`);
      await (supabaseAdmin as any).from("ai_message_processing").update({ status: "skipped", error_message: "human_took_over_during_generation" }).eq("id", processing.id);
      return;
    }

    // Re-checagem de concorrência: se entrou mensagem mais nova para este contato durante a geração do LLM, cancela envio
    const { data: latestProcCheck } = await (supabaseAdmin as any)
      .from("ai_message_processing")
      .select("id, created_at")
      .eq("company_id", companyId)
      .eq("numero", number)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (
      latestProcCheck &&
      latestProcCheck.id !== processing.id &&
      new Date(latestProcCheck.created_at).getTime() >= new Date(processing.created_at).getTime()
    ) {
      console.log(`[ai-engine] Reply cancelled: newer message arrived during generation for ${number} (${latestProcCheck.id} supersedes ${processing.id})`);
      await (supabaseAdmin as any)
        .from("ai_message_processing")
        .update({ status: "skipped", error_message: "superseded_during_generation" })
        .eq("id", processing.id);
      return;
    }

    // Efeitos colaterais seguros (SOMENTE após re-validação e com idempotência por inboundMessageId)
    const hasSideEffects = Boolean(
      (parsed.pixelTracking?.evento && card?.id) ||
      (parsed.webhookSaliente?.disparar && parsed.webhookSaliente?.evento) ||
      parsed.agendar ||
      parsed.sugestao ||
      turnPlan.receiptDetected ||
      pendingOwnerToolApproval
    );
    let sideEffectsAlreadyRan = false;
    if (hasSideEffects) {
      try {
        const { data: existingSideEffect } = await (supabaseAdmin as any)
          .from("audit_log")
          .select("id")
          .eq("company_id", companyId)
          .eq("acao", "ai_side_effects_done")
          .eq("recurso", inboundMessageId)
          .limit(1)
          .maybeSingle();
        if (existingSideEffect?.id) {
          sideEffectsAlreadyRan = true;
        } else {
          await (supabaseAdmin as any).from("audit_log").insert({
            company_id: companyId,
            acao: "ai_side_effects_done",
            recurso: inboundMessageId,
            detalhes: { number, inbound_message_id: inboundMessageId },
          });
        }
      } catch (idemErr: any) {
        console.warn("[ai-engine] Idempotency check warning:", idemErr?.message);
      }
    }

    if (!sideEffectsAlreadyRan) {
      // Disparo de evento Meta CAPI / Pixel si fue solicitado en la salida estructurada
      if (parsed.pixelTracking?.evento && card?.id) {
        try {
          const { sendMetaConversionForLead } = await import("./meta-capi.server");
          const VALID_PIXEL_EVENTS: Record<string, any> = {
            leadsubmitted: "LeadSubmitted",
            lead: "LeadSubmitted",
            contact: "LeadSubmitted",
            contacto: "LeadSubmitted",
            qualifiedlead: "QualifiedLead",
            qualified_lead: "QualifiedLead",
            viewcontent: "ViewContent",
            view_content: "ViewContent",
            addtocart: "AddToCart",
            add_to_cart: "AddToCart",
            initiatecheckout: "InitiateCheckout",
            initiate_checkout: "InitiateCheckout",
            appointmentbooked: "AppointmentBooked",
            appointment_booked: "AppointmentBooked",
            appointment: "AppointmentBooked",
            schedule: "AppointmentBooked",
            agendamiento: "AppointmentBooked",
            ordercreated: "OrderCreated",
            order_created: "OrderCreated",
            purchase: "Purchase",
            compra: "Purchase",
          };
          const rawEvt = String(parsed.pixelTracking.evento || "").trim();
          const mappedEvt = VALID_PIXEL_EVENTS[rawEvt.toLowerCase()] || VALID_PIXEL_EVENTS[rawEvt] || null;
          if (mappedEvt) {
            await sendMetaConversionForLead({
              companyId,
              cardId: card.id,
              eventName: mappedEvt,
              dedupKey: `ai_${inboundMessageId}_${mappedEvt}`,
              value: parsed.pixelTracking.valor != null ? Number(parsed.pixelTracking.valor) : undefined,
              currency: parsed.pixelTracking.moneda || undefined,
            });
            traceToolsUsed.push(`meta_capi:${mappedEvt}`);
            console.log(`[ai-engine] Meta CAPI Pixel event emitted: ${mappedEvt} (from ${rawEvt})`);
          } else {
            console.warn(`[ai-engine] Evento Pixel ignorado por no estar en lista blanca: "${rawEvt}"`);
          }
        } catch (pixErr: any) {
          console.warn("[ai-engine] Pixel event emit error:", pixErr?.message);
        }
      }

      // Despacho real de webhook saliente hacia tool webhook_out verificada vía agent_webhook_outbox
      if (parsed.webhookSaliente?.disparar && parsed.webhookSaliente?.evento) {
        const reqEvent = String(parsed.webhookSaliente.evento || "").trim();
        const webhookOutTools = verifiedTools.filter((t) => t.kind === "webhook_out");
        const matchedOutTool =
          webhookOutTools.find(
            (t) =>
              t.name.toLowerCase() === reqEvent.toLowerCase() ||
              t.display_name.toLowerCase() === reqEvent.toLowerCase(),
          ) || (webhookOutTools.length === 1 ? webhookOutTools[0] : undefined);

        if (matchedOutTool) {
          try {
            const { enqueueAndDispatchAgentWebhook } = await import("@/lib/agent-tools.server");
            const outboxRes = await enqueueAndDispatchAgentWebhook(supabaseAdmin, {
              companyId,
              agentId: cfg.id ?? null,
              toolId: matchedOutTool.id,
              numero: number,
              inboundMessageId,
              eventName: reqEvent || matchedOutTool.name,
              url: matchedOutTool.url,
              method: matchedOutTool.method,
              headers: matchedOutTool.headers,
              payload: {
                evento: reqEvent,
                numero: number,
                card_id: card?.id ?? null,
                ...(parsed.webhookSaliente.payload && typeof parsed.webhookSaliente.payload === "object"
                  ? parsed.webhookSaliente.payload
                  : { data: parsed.webhookSaliente.payload ?? null }),
              },
            });
            traceToolsUsed.push({
              name: matchedOutTool.name,
              kind: "webhook_out",
              outboxId: outboxRes.outboxId,
              ok: outboxRes.ok,
              status: outboxRes.httpStatus,
            });
            console.log(
              `[ai-engine] Outbox webhook ${matchedOutTool.name} (${reqEvent}): status=${outboxRes.status} http=${outboxRes.httpStatus}`,
            );
          } catch (hookErr: any) {
            traceToolsUsed.push({
              name: matchedOutTool.name,
              kind: "webhook_out",
              ok: false,
              status: 500,
            });
            console.warn("[ai-engine] Outbox webhook error:", hookErr?.message);
          }
        }
      }

      // Agendamento automático quando a IA confirma horário com o cliente
      if (parsed.agendar) {
        try {
          const inicioIso = parsed.agendar.inicio || new Date().toISOString();
          const fimIso = parsed.agendar.fim || new Date(new Date(inicioIso).getTime() + 30 * 60_000).toISOString();
          const tituloAgenda = parsed.agendar.titulo || `Agendamento - ${number}`;
          const mensagemAgenda =
            parsed.agendar.titulo ||
            replyText.slice(0, 500) ||
            "Agendamento confirmado pela IA";
          const { error: agInsertErr } = await supabaseAdmin.from("mensagem_agendada").insert({
            company_id: companyId,
            card_id: card?.id ?? null,
            numero: number,
            nome_lead: card?.nome ?? null,
            titulo: tituloAgenda,
            mensagem: mensagemAgenda,
            agendado_para: inicioIso,
            fim_em: fimIso,
            status: "agendado",
            tipo: "compromisso",
            origem: "ia",
          } as any);
          if (agInsertErr) {
            console.warn("[ai-engine] Falha ao registrar agendamento automático:", agInsertErr.message);
          } else {
            traceToolsUsed.push("schedule_appointment");
            console.log(`[ai-engine] Agendamento registrado para ${number} às ${inicioIso} em mensagem_agendada`);
          }
        } catch (agErr: any) {
          console.warn("[ai-engine] Falha ao registrar agendamento automático:", agErr?.message);
        }
      }

      // Fase B: Registrar sugestão de treinamento / melhoria de prompt se gerada pela IA
      if (parsed.sugestao) {
        console.log(`[ai-engine] 💡 AI prompt suggestion detected for ${number}:`, parsed.sugestao);
        try {
          await (supabaseAdmin as any).from("audit_log").insert({
            company_id: companyId,
            acao: "ai_prompt_suggestion",
            recurso: inboundMessageId,
            detalhes: {
              numero: number,
              inbound_text: effectiveIncomingText.slice(0, 500),
              previous_reply: replyText.slice(0, 500),
              history: history.slice(-6),
              intent: parsed.intent || "NEUTRA",
              duda: parsed.sugestao.duda,
              regra_sugerida: parsed.sugestao.regra,
              status: "pending",
              created_at: new Date().toISOString(),
            }
          });

          await (supabaseAdmin as any).rpc("push_notificacao", {
            _company_id: companyId,
            _tipo: "geral",
            _titulo: "💡 Sugerencia de entrenamiento para tu Agente IA",
            _descricao: parsed.sugestao.duda.slice(0, 180),
            _link: "/app/agente",
            _ref_id: `sugestao:${processing.id}`,
          });
        } catch (sugErr: any) {
          console.warn("[ai-engine] Falha ao gravar sugestão de treinamento:", sugErr?.message);
        }
      }

      // Disparo proactivo Human-in-the-Loop (HITL) hacia teléfonos autorizados del Secretario
      const hasSecretaryTargets = Boolean(
        (cfg as any)?.secretary_enabled &&
        Array.isArray((cfg as any)?.secretary_phones) &&
        (cfg as any).secretary_phones.length > 0,
      );

      if (hasSecretaryTargets && turnPlan.receiptDetected) {
        try {
          const { createAndNotifyApprovalRequest } = await import("@/lib/ai-secretary.server");
          await createAndNotifyApprovalRequest(supabaseAdmin, {
            companyId,
            agentId: cfg.id ?? null,
            agent: cfg,
            kind: "payment_receipt",
            leadNumero: number,
            leadNome: card?.nome ?? null,
            summary: `Posible comprobante de pago recibido: "${effectiveIncomingText.slice(0, 180)}"`,
            payload: {
              receiptText: effectiveIncomingText.slice(0, 500),
              messageId: inboundMessageId,
            },
            requestedByInstanceId: inst.id ?? opts.instanceId ?? null,
            dedupKey: inboundMessageId,
          });
        } catch (hitlErr: any) {
          console.warn("[ai-engine] HITL payment_receipt error:", hitlErr?.message);
        }
      }

      if (hasSecretaryTargets && pendingOwnerToolApproval) {
        try {
          const { createAndNotifyApprovalRequest } = await import("@/lib/ai-secretary.server");
          await createAndNotifyApprovalRequest(supabaseAdmin, {
            companyId,
            agentId: cfg.id ?? null,
            agent: cfg,
            kind: "tool_write",
            leadNumero: number,
            leadNome: card?.nome ?? null,
            summary: `Ejecutar herramienta protegida "${pendingOwnerToolApproval.tool}"`,
            payload: {
              toolName: pendingOwnerToolApproval.tool,
              args: pendingOwnerToolApproval.args || {},
            },
            requestedByInstanceId: inst.id ?? opts.instanceId ?? null,
            dedupKey: inboundMessageId,
          });
        } catch (hitlErr: any) {
          console.warn("[ai-engine] HITL tool_write error:", hitlErr?.message);
        }
      }
    }

    // Persistir Memoria Aguda (client_memory) y Tarea Activa (active_task) en crm_cards después de re-validación
    if (card?.id && (parsed.clientMemoryUpdate || turnPlan.receiptDetected || pendingOwnerToolApproval || parsed.activeTaskUpdate)) {
      try {
        const cardPatch: Record<string, any> = {};
        if (parsed.clientMemoryUpdate && typeof parsed.clientMemoryUpdate === "object") {
          const prevMem =
            card.client_memory && typeof card.client_memory === "object" && !Array.isArray(card.client_memory)
              ? { ...(card.client_memory as Record<string, any>) }
              : {};
          for (const [k, v] of Object.entries(parsed.clientMemoryUpdate)) {
            const cleanKey = String(k || "").trim().slice(0, 60);
            if (!cleanKey || v === null || v === undefined) continue;
            if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
              const val = typeof v === "string" ? v.trim().slice(0, 240) : v;
              if (val !== "") prevMem[cleanKey] = val;
            }
          }
          const cappedEntries = Object.entries(prevMem).slice(-20);
          cardPatch.client_memory = Object.fromEntries(cappedEntries);
          card.client_memory = cardPatch.client_memory;
        }

        if (turnPlan.receiptDetected) {
          cardPatch.active_task = {
            tipo: "verify_payment",
            estado: "pending_review",
            updated_at: new Date().toISOString(),
            ...(parsed.activeTaskUpdate?.datos ? { datos: parsed.activeTaskUpdate.datos } : {}),
          };
          card.active_task = cardPatch.active_task;
        } else if (pendingOwnerToolApproval) {
          cardPatch.active_task = pendingOwnerToolApproval;
          card.active_task = cardPatch.active_task;
        } else if (parsed.activeTaskUpdate && typeof parsed.activeTaskUpdate === "object") {
          cardPatch.active_task = {
            ...parsed.activeTaskUpdate,
            updated_at: new Date().toISOString(),
          };
          card.active_task = cardPatch.active_task;
        }

        if (Object.keys(cardPatch).length > 0) {
          await (supabaseAdmin as any)
            .from("crm_cards")
            .update(cardPatch)
            .eq("id", card.id);
        }
      } catch (memErr: any) {
        console.warn("[ai-engine] Falha ao persistir memória/tarefa do cliente:", memErr?.message);
      }
    }

    if (replyText) {
      console.log(`[ai-engine] Sending consolidated reply to ${number}: "${replyText.slice(0, 30)}..."`);
      const typingMs = Math.min(Math.max(replyText.length * 30, 1000), 5000);
      try {
        await waPresenceTyping(inst, number, typingMs);
      } catch (e) {
        console.warn("[ai-engine] Presence error (ignoring):", e);
      }
      
      const { extractWhatsappMessageId } = await import("@/lib/whatsapp-helpers");

      // Enviar mensagem (em áudio quando o cliente mandou áudio)
      try {
        let enviouAudio = false;
        if (opts.responderEmAudio) {
          try {
            const { textToSpeechBase64 } = await import("@/lib/media-understanding.server");
            const audioB64 = await textToSpeechBase64(replyText);
            if (audioB64) {
              const cleanB64 = audioB64.includes(",") ? audioB64.split(",")[1] : audioB64;
              const audioBuffer = Buffer.from(cleanB64, "base64");
              const fileName = `tts_${Date.now()}.mp3`;
              let audioUrlToSend = `data:audio/mp3;base64,${cleanB64}`;
              let storedKey: string | null = null;

              try {
                const { isR2Configured, storeMediaObject, createR2DownloadUrl } = await import("@/lib/storage/r2.server");
                if (!isR2Configured || isR2Configured()) {
                  const storedObj = await storeMediaObject({
                    companyId,
                    bytes: audioBuffer,
                    fileName,
                    mimeType: "audio/mpeg",
                  });
                  storedKey = storedObj.storageKey;
                  const signedUrl = await createR2DownloadUrl(storedKey, 86400);
                  if (signedUrl) {
                    audioUrlToSend = signedUrl;
                  }
                }
              } catch (r2Err: any) {
                storedKey = null;
                console.warn("[ai-engine] Falha ao persistir áudio TTS no R2, enviando data URI:", r2Err?.message);
              }

              const { waSendAudio } = await import("@/lib/wa-dispatch.server");
              const audioRes = await waSendAudio(inst, number, audioUrlToSend);
              const audioMsgId = extractWhatsappMessageId(audioRes) || null;

              const { data: insertedMsg } = await supabaseAdmin.from("mensagens").insert({
                company_id: companyId,
                user_id: targetUserId,
                numero: number,
                texto: replyText,
                direcao: "saida",
                autor: "ia",
                instance_id: inst.id ?? null,
                provider: inst.provider,
                whatsapp_message_id: audioMsgId,
                status_envio: "enviado",
                midia_tipo: "audio",
                midia_url: audioUrlToSend.startsWith("http") ? audioUrlToSend : null,
                midia_mime: "audio/mpeg",
                midia_nome: fileName,
                created_at: new Date().toISOString(),
              } as any).select("id").maybeSingle();

              if (insertedMsg?.id && storedKey) {
                try {
                  await (supabaseAdmin as any).from("message_attachments").insert({
                    company_id: companyId,
                    mensagem_id: insertedMsg.id,
                    attachment_key: storedKey,
                    kind: "audio",
                    storage_key: storedKey,
                    mime_type: "audio/mpeg",
                    file_name: fileName,
                    size_bytes: audioBuffer.length,
                    provider_url: audioUrlToSend.startsWith("http") ? audioUrlToSend : null,
                  });
                } catch (attErr) {
                  console.warn("[ai-engine] Falha ao registrar anexo de áudio TTS:", attErr);
                }
              }

              enviouAudio = true;
              console.log(`[ai-engine] Resposta enviada em áudio para ${number}`);
            }
          } catch (ttsErr: any) {
            console.warn("[ai-engine] Falha ao responder em áudio, usando texto:", ttsErr?.message);
          }
        }
        if (!enviouAudio) {
          const messagesToSend = cfg.responder_em_partes === false ? [replyText] : replyParts;
          for (const message of messagesToSend) {
            const sendResult = await waSendText(inst, number, message);
            const partMsgId = extractWhatsappMessageId(sendResult) || null;
            await supabaseAdmin.from("mensagens").insert({
              company_id: companyId,
              user_id: targetUserId,
              numero: number,
              texto: message,
              direcao: "saida",
              autor: "ia",
              instance_id: inst.id ?? null,
              provider: inst.provider,
              whatsapp_message_id: partMsgId,
              status_envio: "enviado",
              created_at: new Date().toISOString()
            } as any);
            console.log(`[ai-engine] waSendText part success for ${number}: id=${partMsgId}`);
          }
        }
      } catch (sendErr: any) {
        console.error(`[ai-engine] waSendText FATAL for ${number}:`, sendErr);
        throw sendErr;
      }

      // Envio de produtos e serviços solicitados no prompt [PRODUTO:sku]
      const requestedSkus = parsed.produtosSku || (parsed as any).productSkus || [];
      if (requestedSkus.length > 0) {
        const { waSendMedia } = await import("@/lib/wa-dispatch.server");
        const skusToSend = requestedSkus.slice(0, 3);
        for (const sku of skusToSend) {
          const prod = (produtos as any[]).find(
            (p: any) => String(p.sku || p.id || "").trim().toLowerCase() === String(sku).trim().toLowerCase()
          );
          if (prod) {
            const precoFmt = prod.preco ? `$ ${prod.preco}` : (prod.preco_cents ? `$ ${(prod.preco_cents / 100).toFixed(2)}` : "");
            const cardCaption = `📦 *${prod.nome}*${precoFmt ? ` — ${precoFmt}` : ""}\n${prod.descricao || ""}`.trim();
            const prodImg = prod.foto_url || prod.imagem_url || null;
            try {
              let prodSendRes: any;
              if (prodImg) {
                prodSendRes = await waSendMedia(inst, number, {
                  url: prodImg,
                  type: "image",
                  caption: cardCaption,
                });
              } else {
                prodSendRes = await waSendText(inst, number, cardCaption);
              }
              const prodMsgId = extractWhatsappMessageId(prodSendRes) || prodSendRes?.id || prodSendRes?.messageId || null;
              await (supabaseAdmin as any).from("mensagens").insert({
                company_id: companyId,
                user_id: targetUserId,
                numero: number,
                contato_nome: card?.nome ?? null,
                direcao: "saida",
                autor: "ia",
                texto: cardCaption,
                midia_url: prodImg,
                midia_tipo: prodImg ? "image" : null,
                instance_id: inst.id ?? null,
                provider: inst.provider,
                whatsapp_message_id: prodMsgId,
                status_envio: "enviado",
                created_at: new Date().toISOString()
              });
              console.log(`[ai-engine] Produto enviado e gravado: SKU ${sku} (${prod.nome}) para ${number}, waId=${prodMsgId}`);
              traceToolsUsed.push(`send_product:${sku}`);
            } catch (prodErr: any) {
              console.warn(`[ai-engine] Falha ao enviar produto SKU ${sku}:`, prodErr?.message);
            }
          }
        }
      }

      // Débito de 1 crédito de IA por resposta enviada (alimenta o monitoramento).
      try {
        const { debitAiCredits } = await import("@/lib/credits.server");
        await debitAiCredits(supabaseAdmin, companyId, 1, "ai_message", number);
      } catch (e: any) {
        console.warn("[ai-engine] Falha ao debitar crédito:", e?.message);
      }
    }

    // 7b. Fechamento do pedido no ERP Olist (só com confirmação do cliente)
    if (parsed.pedido && olistPedidoAtivo) {
      try {
        const { getOlistConfig } = await import("@/lib/olist.server");
        const { criarPedidoIaOlist } = await import("@/lib/olist-ai.server");
        const olistCfg = await getOlistConfig(supabaseAdmin, companyId);
        if (olistCfg?.token) {
          const { data: contatoRow } = await (supabaseAdmin as any)
            .from("crm_cards")
            .select("nome")
            .eq("company_id", companyId)
            .eq("numero", number)
            .limit(1)
            .maybeSingle();

          const itens = parsed.pedido.itens;
          const totalCents = Math.round(
            itens.reduce((acc, i) => acc + i.qtd * i.valor, 0) * 100,
          );

          const r = await criarPedidoIaOlist(olistCfg.token, {
            clienteNome: contatoRow?.nome || "Cliente WhatsApp",
            clienteFone: number,
            itens: itens.map((i) => ({
              descricao: i.nome,
              quantidade: i.qtd,
              valorUnitario: i.valor,
              codigo: i.cod,
            })),
            entrega: parsed.pedido.entrega,
            pagamento: parsed.pedido.pagamento,
          });

          const descricao = itens
            .map((i) => `${i.qtd}x ${i.nome}`)
            .join(", ")
            .slice(0, 200);

          await (supabaseAdmin as any).from("crm_venda").insert({
            company_id: companyId,
            card_id: card?.id ?? null,
            owner_id: targetUserId,
            contato_numero: number,
            contato_nome: contatoRow?.nome || "Cliente WhatsApp",
            descricao,
            valor_cents: totalCents,
            vendido_em: new Date().toISOString().slice(0, 10),
            stage_id: card?.stage_id ?? null,
            canal: "ia_whatsapp",
            metodo_pagamento: parsed.pedido.pagamento,
            item_nome: itens[0]?.nome ?? null,
            olist_pedido_id: r.id || r.numero,
            olist_situacao: "aberto",
          });

          await (supabaseAdmin as any).from("audit_log").insert({
            company_id: companyId,
            acao: "ia_pedido_olist",
            detalhes: { numero: number, pedido: r, total_cents: totalCents },
          });

          traceToolsUsed.push("olist_order");
          console.log(`[ai-engine] Pedido Olist #${r.numero} criado pela IA para ${number}`);
        }
      } catch (e: any) {
        console.error("[ai-engine] Falha ao lançar pedido na Olist:", e?.message);
        await (supabaseAdmin as any).from("audit_log").insert({
          company_id: companyId,
          acao: "ai_error",
          detalhes: { error: "Falha ao lançar pedido na Olist: " + (e?.message ?? ""), number },
        });
      }
    }


    // Helper unificado para mover card respetando bloqueada_para_ia y asignación a humano
    async function tryAutoMoveCard(targetStageId: string, reasonLog: string): Promise<string | null> {
      if (!card || !targetStageId || targetStageId === card.stage_id) return null;

      const { data: targetStageCfg } = await supabaseAdmin
        .from("crm_stage")
        .select("id, nome, pipeline_id, modo_atendimento, mensagem_prompt")
        .eq("id", targetStageId)
        .eq("company_id", companyId)
        .maybeSingle();

      if (!targetStageCfg) return null;

      const { resolveStageAiMeta } = await import("./crm-stage-meta");
      const stageMeta = resolveStageAiMeta(targetStageCfg);
      if (stageMeta.bloqueada_para_ia) {
        console.log(`[ai-engine] Stage '${targetStageCfg.nome}' (${targetStageCfg.id}) is locked (bloqueada_para_ia=true). Skipping auto move (${reasonLog}).`);
        return null;
      }

      let newOwnerId = card.owner_id;
      if (targetStageCfg.modo_atendimento === "manual") {
        const { pickLeadOwner } = await import("./crm-engine.server");
        const queueOwnerId = await pickLeadOwner(supabaseAdmin, companyId, targetStageCfg.id);
        newOwnerId = queueOwnerId || newOwnerId || null;
      }

      const { moveCardToStage } = await import("./crm-engine.server");
      await moveCardToStage(supabaseAdmin, card.id, targetStageCfg.id, { owner_id: newOwnerId });
      card.stage_id = targetStageCfg.id;
      card.owner_id = newOwnerId;
      console.log(`[ai-engine] Card ${card.id} moved to ${targetStageCfg.nome} (${reasonLog})`);
      return newOwnerId || null;
    }

    // 8. Lógica de Intenção e Movimentação Automática
    if (intent && card) {
      console.log(`[ai-engine] Intent detected for ${number}: ${intent}`);
      
      const { data: stgFull } = await (supabaseAdmin as any)
        .from("crm_stage")
        .select("move_se_negativo_para, move_se_positivo_para, intent_handling_enabled")
        .eq("id", card.stage_id)
        .maybeSingle();

      if (stgFull?.intent_handling_enabled) {
        const targetId =
          intent === "NEGATIVA"
            ? stgFull.move_se_negativo_para
            : intent === "POSITIVA"
              ? stgFull.move_se_positivo_para
              : null;
        if (targetId) {
          await tryAutoMoveCard(targetId, `intent:${intent}`);
        }
      }
    }

    let resolvedHandoffUserId = targetUserId;

    // 9. Se a IA sugerir mudança de estágio ou qualificação completa
    if ((stage || handoff || qualified) && card) {
      const { data: currentStg } = await (supabaseAdmin as any)
        .from("crm_stage")
        .select("move_apos_qualificar_para, ia_handoff_stage_id")
        .eq("id", card.stage_id)
        .maybeSingle();

      const configuredTargetId =
        qualified && currentStg?.move_apos_qualificar_para
          ? currentStg.move_apos_qualificar_para
          : handoff && currentStg?.ia_handoff_stage_id
            ? currentStg.ia_handoff_stage_id
            : null;

      const resolvedStageId =
        configuredTargetId ||
        (stage
          ? (stages as any[]).find((s) => s.nome.toLowerCase() === stage.toLowerCase())?.id ?? null
          : null);

      if (resolvedStageId && resolvedStageId !== card.stage_id) {
        const assignedOwner = await tryAutoMoveCard(
          resolvedStageId,
          `qualified=${qualified},handoff=${handoff},stage=${stage}`,
        );
        if (assignedOwner) resolvedHandoffUserId = assignedOwner;
      }
    }

    // 10. Se a IA solicitar Handoff (humano)
    if (handoff) {
      console.log(`[ai-engine] Handoff requested for ${number}`);
      await supabaseAdmin
        .from("contact_pause")
        .upsert(
          { company_id: companyId, user_id: resolvedHandoffUserId, numero: number, pausado: true, pausado_por: "ia", pausado_em: new Date().toISOString() } as any,
          { onConflict: "company_id,numero" }
        );
    }

    try {
      await (supabaseAdmin as any).from("ai_turn_traces").insert({
        company_id: companyId,
        agent_id: traceAgentId,
        numero: number,
        instance_id: traceInstId,
        channel: opts.channel ?? null,
        provider: traceProvider,
        model: traceModel,
        route: traceRoute,
        chunks_used: traceChunksUsed,
        tools_used: traceToolsUsed,
        latency_ms: Math.max(0, Date.now() - turnStartedAt),
        prompt_chars: tracePromptChars,
        handoff: traceHandoff,
        error: null,
      });
    } catch (traceErr: any) {
      console.warn("[ai-engine] Failed to persist ai_turn_trace:", traceErr?.message);
    }

    await (supabaseAdmin as any)
      .from("ai_message_processing")
      .update({ status: "completed", error_message: null })
      .eq("id", processing.id);

  } catch (error: any) {
    console.error("[ai-engine] FATAL ERROR in processAiResponse:", error);
    try {
      await (supabaseAdmin as any).from("ai_turn_traces").insert({
        company_id: companyId,
        agent_id: traceAgentId,
        numero: number,
        instance_id: traceInstId,
        channel: opts.channel ?? null,
        provider: traceProvider,
        model: traceModel,
        route: traceRoute,
        chunks_used: traceChunksUsed,
        tools_used: traceToolsUsed,
        latency_ms: Math.max(0, Date.now() - turnStartedAt),
        prompt_chars: tracePromptChars,
        handoff: traceHandoff,
        error: String(error?.message || error).slice(0, 500),
      });
    } catch {}
    try {
      await supabaseAdmin.from("audit_log").insert({
        company_id: companyId,
        acao: "ai_error",
        detalhes: { 
          error: error.message || "Erro desconhecido no motor de IA", 
          stack: error.stack?.slice(0, 500),
          number 
        }
      } as any);
    } catch (e) {
      console.error("[ai-engine] Failed to insert ai_error log:", e);
    }
    await (supabaseAdmin as any)
      .from("ai_message_processing")
      .update({ status: "failed", error_message: String(error?.message || error).slice(0, 500) })
      .eq("id", processing.id);
  }

}
