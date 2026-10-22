
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
  opts: { responderEmAudio?: boolean } = {},
) {
  console.log(`[ai-engine] EXECUTING for ${number} (Company: ${companyId}) at ${new Date().toISOString()}`);
  const logDetails = { number, companyId, incomingText: incomingText.slice(0, 50) };

  const { data: processing, error: processingError } = await (supabaseAdmin as any)
    .from("ai_message_processing")
    .insert({
      company_id: companyId,
      inbound_message_id: inboundMessageId,
      numero: number,
      status: "processing",
    })
    .select("id, created_at")
    .maybeSingle();

  if (processingError?.code === "23505") {
    console.log(`[ai-engine] Duplicate inbound message ignored: ${inboundMessageId}`);
    return;
  }
  if (processingError || !processing?.id) {
    throw processingError || new Error("Não foi possível registrar o processamento da mensagem");
  }

  // Se a mensagem recebida for áudio, a IA não deve responder ou alucinar.
  // Pausa a IA para este contato e encaminha para atenção humana.
  if (incomingText === "[ÁUDIO]" || incomingText.startsWith("[ÁUDIO]")) {
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

    // 1. Carregar configuração do agente e saldo
    const [{ data: cfg }, { data: company }] = await Promise.all([
      supabaseAdmin
        .from("agent_config")
        .select("*")
        .eq("company_id", companyId)
        .eq("tipo", "qualificacao")
        .maybeSingle(),
      supabaseAdmin
        .from("company")
        .select("creditos_saldo, status_cobranca")
        .eq("id", companyId)
        .maybeSingle()
    ]);

    if (!cfg) {
      console.warn(`[ai-engine] No agent config for company ${companyId}`);
      await supabaseAdmin.from("audit_log").insert({
        company_id: companyId,
        acao: "ai_error",
        detalhes: { error: "Configuração do agente de IA não encontrada para esta empresa." }
      } as any);
      return;
    }

    if (!company || (company.creditos_saldo ?? 0) <= 0) {
      console.warn(`[ai-engine] Insufficient credits for ${companyId}: ${company?.creditos_saldo}`);
      await supabaseAdmin.from("audit_log").insert({
        company_id: companyId,
        acao: "ai_error",
        detalhes: { error: "Saldo de créditos insuficiente ou empresa não encontrada.", creditos: company?.creditos_saldo }
      } as any);
      return;
    }

    console.log(`[ai-engine] Using provider=${cfg.ai_provider}, model=${cfg.ai_model} for contact ${number}`);

    // Fase A: Buffer / Debounce de Mensagens
    // Se o agente tem segundos_buffer configurado (> 0), aguarda para agrupar mensagens sucessivas
    // enviadas pelo cliente em rajada (burst), respondendo a todas de uma só vez de forma coerente.
    const bufferSec = Math.max(0, Math.min(60, Number(cfg.segundos_buffer ?? 0)));
    if (bufferSec > 0) {
      console.log(`[ai-engine] Buffering message for ${number} (${bufferSec}s) at ${new Date().toISOString()}`);
      await new Promise((resolve) => setTimeout(resolve, bufferSec * 1000));

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
      .select("id, texto, created_at")
      .eq("company_id", companyId)
      .eq("numero", number)
      .eq("direcao", "entrada")
      .gt("created_at", lastReplyTime)
      .order("created_at", { ascending: true });

    const unrepliedList = (unrepliedMsgs ?? []).filter((m: any) => m.texto && m.texto.trim().length > 0);
    const effectiveIncomingText = unrepliedList.length > 0
      ? unrepliedList.map((m: any) => m.texto.trim()).join("\n")
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
              const inst = await getActiveInstanceForContact(companyId, number);
              if (inst) {
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
                  created_at: new Date().toISOString()
                } as any);
                if (foraErr) console.warn("[ai-engine] falha ao registrar mensagem fora de horário:", foraErr);
              }
           }
        }
        return;
      }
    }

    // 2. Verificar se a IA está pausada para este contato ou desativada na etapa atual
    // Pode haver mais de um card para o mesmo número (pipelines diferentes):
    // usamos o mais recente. maybeSingle() aqui retornava erro e travava a IA.
    const { data: cardRows } = await (supabaseAdmin as any)
      .from("crm_cards")
      .select("user_id, owner_id, id, stage_id, updated_at")
      .eq("company_id", companyId)
      .eq("numero", number)
      .not("stage_id", "is", null)
      .order("updated_at", { ascending: false })
      .limit(1);
    const card = (cardRows ?? [])[0] ?? null;

    const [{ data: pause }, { data: stageCfg }] = await Promise.all([
      supabaseAdmin
        .from("contact_pause")
        .select("pausado, pausado_por")
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
      // Pausa feita por um atendente (assumiu a conversa / respondeu) NUNCA é limpa
      // automaticamente — o humano está no comando até reativar a IA manualmente.
      const pausedByHuman = (pause as any).pausado_por === "humano";
      if (!pausedByHuman && stageCfg?.modo_atendimento === "ia") {
        console.log(`[ai-engine] Clearing stale pause for ${number} (stage is IA)`);
        await supabaseAdmin
          .from("contact_pause")
          .update({ pausado: false } as any)
          .eq("company_id", companyId)
          .eq("numero", number);
      } else {
        console.log(`[ai-engine] AI is paused for ${number} (por=${(pause as any).pausado_por ?? "?"})`);
        return;
      }
    }


    const stageHasFixedRule = Boolean(
      stageCfg?.regua_ativa &&
        stageCfg?.mensagem_tipo !== "sem_mensagem" &&
        (stageCfg?.mensagem_texto?.trim() || stageCfg?.mensagem_prompt?.trim() || stageCfg?.mensagem_midia_url?.trim()),
    );
    const aiAllowed = stageCfg?.modo_atendimento === "ia" ||
      (stageCfg?.modo_atendimento === "auto" && !stageHasFixedRule);
    if (stageCfg && !aiAllowed) {
      console.log(`[ai-engine] AI is disabled for stage ${card?.stage_id} (mode=${stageCfg.modo_atendimento})`);
      return;
    }
    // Sem etapa configurada = sem agente designado. Nunca ativar a IA por padrão.
    if (!stageCfg) {
      console.log(`[ai-engine] No stage for ${number} — AI not allowed`);
      return;
    }
    // Um humano atendeu recentemente (inclusive após encerrar o ticket): a IA não assume sozinha,
    // exceto em etapas explicitamente configuradas como "IA".
    if (stageCfg.modo_atendimento !== "ia") {
      const desde = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
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
        return;
      }
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
        const inst = await getActiveInstanceForContact(companyId, number, card?.owner_id || card?.user_id);
        if (!inst) {
          throw new Error("Nenhuma instância ativa encontrada para enviar a mensagem inicial.");
        }
        await waSendText(inst, number, initialMessage);
        const { error: initialInsertError } = await supabaseAdmin.from("mensagens").insert({
          company_id: companyId,
          user_id: card?.owner_id || card?.user_id || null,
          numero: number,
          texto: initialMessage,
          direcao: "saida",
          autor: "ia",
          created_at: new Date().toISOString(),
        } as any);
        if (initialInsertError) throw initialInsertError;
        // A IA continua o fluxo para responder também a pergunta desta primeira mensagem.
      }

    }

    // 3. Carregar histórico recente para contexto (somente últimas 24h para evitar ruído de conversas antigas)
    const umaHoraAtras = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: historyMsgs } = await supabaseAdmin
      .from("mensagens")
      .select("id, autor, texto")
      .eq("company_id", companyId)
      .eq("numero", number)
      .gt("created_at", umaHoraAtras)
      .order("created_at", { ascending: false })
      .limit(20); 


    const history: ChatMsg[] = (historyMsgs ?? [])
      .filter((m: any) => !unrepliedIdSet.has(m.id))
      .reverse()
      .map(m => ({
        role: m.autor === "contato" ? "user" : "assistant",
        content: m.texto || ""
      }));

    // 4. Buscar estágios do CRM e o catálogo (produtos + serviços) para o prompt
    const [stages, { data: catRows }] = await Promise.all([
      getStagesBrief(supabaseAdmin, companyId),
      (supabaseAdmin as any)
        .from("produto")
        .select("nome, preco, descricao, sku, foto_url, tipo, duracao_min, agendavel")
        .eq("company_id", companyId)
        .eq("ativo", true)
        .order("ordem", { ascending: true })
        .limit(80),
    ]);

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

    // 4b. Catálogo ao vivo do ERP Olist (preço + estoque reais), quando habilitado
    let olistCatalogo = "";
    let olistPedidoAtivo = false;
    try {
      const anyCfg = cfg as any;
      if (anyCfg.olist_catalogo || anyCfg.olist_pedido_auto) {
        const { capacidadeAtiva } = await import("@/lib/plugin-gate.server");
        if (await capacidadeAtiva(supabaseAdmin, companyId, "olist")) {
          olistPedidoAtivo = Boolean(anyCfg.olist_pedido_auto);
          if (anyCfg.olist_catalogo) {
            const { blocoCatalogoOlist } = await import("@/lib/olist-ai.server");
            olistCatalogo = await blocoCatalogoOlist(
              supabaseAdmin,
              companyId,
              effectiveIncomingText,
            );
          }
        }
      }
    } catch (e: any) {
      console.warn("[ai-engine] Olist indisponível para o prompt:", e?.message);
    }

    // 5. Montar System Prompt
    const system = buildSystemPrompt(cfg as any, {
      responderEmPartes: cfg.responder_em_partes ?? true,
      stages: stages as any,
      produtos: produtos as any,
      olistCatalogo,
      olistPedido: olistPedidoAtivo,
    });


    // 6. Chamar a IA com o provedor configurado
    const response = await lovableAiChat(
      [
        { role: "system", content: system },
        ...history,
        { role: "user", content: effectiveIncomingText }
      ],
      {
        provider: cfg.ai_provider || "gemini",
        model: cfg.ai_model || undefined,
      }
    );

    console.log(`[ai-engine] AI RAW RESPONSE for ${number}:`, response);
    
    try {
      await supabaseAdmin.from("audit_log").insert({
        company_id: companyId,
        acao: "ai_response",
        detalhes: { response: response.slice(0, 500), number }
      } as any);
    } catch (e) {
      console.error("[ai-engine] Failed to insert ai_response log:", e);
    }

    const parsed = parseAiOutput(response, stages as any);
    console.log(`[ai-engine] Parsed intent: ${parsed.intent}, parts count: ${parsed.parts.length}, qualified: ${parsed.qualified}, sugestao: ${Boolean(parsed.sugestao)}`);

    // Fase B: Registrar sugestão de treinamento / melhoria de prompt se gerada pela IA
    if (parsed.sugestao) {
      console.log(`[ai-engine] 💡 AI prompt suggestion detected for ${number}:`, parsed.sugestao);
      try {
        await (supabaseAdmin as any).from("audit_log").insert({
          company_id: companyId,
          acao: "ai_prompt_suggestion",
          detalhes: {
            numero: number,
            inbound_text: effectiveIncomingText.slice(0, 400),
            intent: parsed.intent || "NEUTRA",
            duda: parsed.sugestao.duda,
            regra_sugerida: parsed.sugestao.regra,
            status: "pending",
            created_at: new Date().toISOString(),
          }
        });

        await (supabaseAdmin as any).rpc("push_notificacao", {
          _company_id: companyId,
          _tipo: "ia_sugestao",
          _titulo: "💡 Sugerencia de entrenamiento para tu Agente IA",
          _descricao: parsed.sugestao.duda.slice(0, 180),
          _link: "/app/agente",
          _ref_id: `sugestao:${processing.id}`,
        });
      } catch (sugErr: any) {
        console.warn("[ai-engine] Falha ao gravar sugestão de treinamento:", sugErr?.message);
      }
    }
    
    const replyParts = parsed.parts.map((part) => part.trim()).filter(Boolean);
    const replyText = replyParts.join("\n\n");
    const stage = parsed.stage;
    const intent = parsed.intent;
    const handoff = parsed.handoff;
    const qualified = parsed.qualified;

    // 7. Enviar resposta(s)
    console.log(`[ai-engine] Loading active instance for contact ${number} (company ${companyId})...`);
    const inst = await getActiveInstanceForContact(companyId, number, card?.owner_id || card?.user_id);
    if (!inst) {
      console.error("[ai-engine] No active instance found to reply");
      await (supabaseAdmin as any).from("audit_log").insert({
        company_id: companyId,
        acao: "ai_error",
        detalhes: { error: "Nenhuma instância ativa encontrada para responder.", number }
      });
      return;
    }
    console.log(`[ai-engine] Found instance: ${inst.instance_name} (${inst.provider})`);

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
      return;
    }

    if (replyText) {
      console.log(`[ai-engine] Sending consolidated reply to ${number}: "${replyText.slice(0, 30)}..."`);
      const typingMs = Math.min(Math.max(replyText.length * 30, 1000), 5000);
      try {
        await waPresenceTyping(inst, number, typingMs);
      } catch (e) {
        console.warn("[ai-engine] Presence error (ignoring):", e);
      }
      
      // Enviar mensagem (em áudio quando o cliente mandou áudio)
      try {
        let enviouAudio = false;
        if (opts.responderEmAudio) {
          try {
            const { textToSpeechBase64 } = await import("@/lib/media-understanding.server");
            const audioB64 = await textToSpeechBase64(replyText);
            if (audioB64) {
              const { waSendAudio } = await import("@/lib/wa-dispatch.server");
              await waSendAudio(inst, number, audioB64);
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
            console.log(`[ai-engine] waSendText success for ${number}:`, JSON.stringify(sendResult));
          }
        }
      } catch (sendErr: any) {
        console.error(`[ai-engine] waSendText FATAL for ${number}:`, sendErr);
        throw sendErr; // Será capturado pelo catch principal
      }

      // Salvar no banco
      const { error: msgInsertErr } = await supabaseAdmin.from("mensagens").insert({
        company_id: companyId,
        user_id: targetUserId,
        numero: number,
        texto: replyText,
        direcao: "saida",
        autor: "ia",
        created_at: new Date().toISOString()
      } as any);

      if (msgInsertErr) {
        console.error("[ai-engine] Error saving AI message to DB:", msgInsertErr);
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


    // 8. Lógica de Intenção e Movimentação Automática
    if (intent && card) {
      console.log(`[ai-engine] Intent detected for ${number}: ${intent}`);
      
      const { data: stgFull } = await (supabaseAdmin as any)
        .from("crm_stage")
        .select("move_se_negativo_para, move_se_positivo_para, intent_handling_enabled")
        .eq("id", card.stage_id)
        .maybeSingle();

      if (stgFull?.intent_handling_enabled) {
        let targetId = null;
        if (intent === "NEGATIVA") targetId = stgFull.move_se_negativo_para;
        if (intent === "POSITIVA") targetId = stgFull.move_se_positivo_para;

        if (targetId) {
          const targetStage = (stages as any[]).find((s: any) => s.id === targetId);
          if (targetStage) {
            console.log(`[ai-engine] ${intent} intent: moving ${number} to stage ${targetStage.nome}`);
            const { moveCardToStage } = await import("./crm-engine.server");
            await moveCardToStage(supabaseAdmin, card.id, targetStage.id);

            
            // Se mover, a automação de estágio atualizada pode disparar novas lógicas no próximo webhook
          }
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

      // Marcadores de automação têm prioridade sobre [ESTAGIO]. A IA normalmente
      // informa a etapa atual junto com [QUALIFICADO], e isso antes impedia a saída dela.
      const configuredTargetId = qualified && currentStg?.move_apos_qualificar_para
        ? currentStg.move_apos_qualificar_para
        : handoff && currentStg?.ia_handoff_stage_id
          ? currentStg.ia_handoff_stage_id
          : null;
      let foundStage = configuredTargetId
        ? (stages as any[]).find(s => s.id === configuredTargetId)
        : stage
          ? (stages as any[]).find(s => s.nome.toLowerCase() === stage.toLowerCase())
          : null;

      console.log(`[ai-engine] Automation target for ${number}: qualified=${qualified}, handoff=${handoff}, configured=${configuredTargetId}, resolved=${foundStage?.id ?? "none"}`);

      if (foundStage && foundStage.id !== card.stage_id) {
        console.log(`[ai-engine] Moving card ${card.id} to stage ${foundStage.nome} (Qualified: ${qualified})`);
        
        const { data: targetStageCfg } = await supabaseAdmin
          .from("crm_stage")
          .select("modo_atendimento")
          .eq("id", foundStage.id)
          .maybeSingle();

        console.log(`[ai-engine] Target stage mode: ${targetStageCfg?.modo_atendimento}`);

        let newOwnerId = card.owner_id;
        if (targetStageCfg?.modo_atendimento === 'manual') {
          // Ao sair da IA para atendimento manual, o dono precisa vir da fila humana.
          const { pickLeadOwner } = await import("./crm-engine.server");
          const queueOwnerId = await pickLeadOwner(supabaseAdmin, companyId, foundStage.id);
          newOwnerId = queueOwnerId || newOwnerId || null;
          console.log(`[ai-engine] Handoff to human in manual stage. Assigned owner: ${newOwnerId}`);
        }

        const updateResult = await (async () => {
          try {
            const { moveCardToStage } = await import("./crm-engine.server");
            await moveCardToStage(supabaseAdmin, card.id, foundStage.id, { owner_id: newOwnerId });
            return { error: null as any };
          } catch (e: any) {
            return { error: e };
          }
        })();

        if (updateResult.error) {
          console.error(`[ai-engine] Error updating card ${card.id} to stage ${foundStage.id}:`, updateResult.error);
        } else {
          resolvedHandoffUserId = newOwnerId || resolvedHandoffUserId;
          console.log(`[ai-engine] Card ${card.id} successfully moved to ${foundStage.nome}`);
        }
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

    await (supabaseAdmin as any)
      .from("ai_message_processing")
      .update({ status: "completed", error_message: null })
      .eq("id", processing.id);

  } catch (error: any) {
    console.error("[ai-engine] FATAL ERROR in processAiResponse:", error);
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
