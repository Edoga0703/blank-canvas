import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { isGenericLeadName } from "@/lib/lead-name";

export interface AgendarBrief { inicio: string; fim: string; titulo: string; }
export interface StageBrief {
  id: string;
  nome: string;
  pipeline_id: string;
  tipo: string;
  criterio_ia?: string;
  bloqueada_para_ia?: boolean;
}

/** Empresa configurada para triagem 100% manual (sem rodízio automático). */
export async function isManualDistribution(admin: any, companyId: string): Promise<boolean> {
  try {
    const { data } = await admin
      .from("company")
      .select("distribuicao_manual")
      .eq("id", companyId)
      .maybeSingle();
    return !!data?.distribuicao_manual;
  } catch {
    return false;
  }
}

/**
 * Cria ou atualiza um card no CRM com base na última mensagem/contato.
 */
export async function upsertCard(
  admin: any,
  companyId: string,
  userId: string | null,
  numero: string,
  pushName: string | null,
  text: string,
  stages: StageBrief[],
  canal: "whatsapp" | "instagram" | "messenger" | "telegram" | "formulario" | "ads_meta" = "whatsapp"
): Promise<any> {
  console.log("[upsertCard] Start for", numero, "company:", companyId);
  const cleanNumero = numero.replace(/\D/g, "");
  
  // 1. Busca card existente (garantindo que não buscamos cards sem número)
  if (!cleanNumero) {
    console.error("[upsertCard] Invalid number:", numero);
    return null;
  }

  let { data: existing } = await admin
    .from("crm_cards")
    .select("*")
    .eq("company_id", companyId)
    .eq("numero", cleanNumero)
    .order("updated_at", { ascending: false }).limit(1).maybeSingle();

  // Mesmo contato gravado na outra forma do celular BR (com/sem o 9º dígito):
  // a mensagem recebida traz o número real do WhatsApp, então migramos a
  // conversa antiga para ele em vez de abrir uma segunda conversa.
  if (!existing) {
    try {
      const { phoneVariants } = await import("@/lib/br-phone");
      const alt = phoneVariants(cleanNumero).filter((v) => v !== cleanNumero);
      if (alt.length) {
        const { data: altCard } = await admin
          .from("crm_cards").select("*")
          .eq("company_id", companyId).in("numero", alt)
          .order("ultima_em", { ascending: false, nullsFirst: false })
          .limit(1).maybeSingle();
        const altNums = altCard ? [altCard.numero] : alt;
        await admin.from("mensagens").update({ numero: cleanNumero })
          .eq("company_id", companyId).in("numero", altNums);
        if (altCard) {
          const { data: moved } = await admin
            .from("crm_cards").update({ numero: cleanNumero })
            .eq("id", altCard.id).select("*").maybeSingle();
          existing = moved ?? { ...altCard, numero: cleanNumero };
          console.log("[upsertCard] Conversa unificada:", altCard.numero, "->", cleanNumero);
        }
      }
    } catch (e) {
      console.warn("[upsertCard] merge de variantes falhou:", e);
    }
  }


  // Nunca gravar o nome da própria empresa como nome do lead
  const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const { data: companyRow } = await admin.from("company").select("nome").eq("id", companyId).maybeSingle();
  const companyName = companyRow?.nome ? norm(companyRow.nome) : "";
  if (pushName && companyName && norm(pushName) === companyName) {
    console.warn("[upsertCard] pushName igual ao nome da empresa, ignorando:", pushName);
    pushName = null;
  }
  // pushName inútil (número, "Contato 1234", vazio) nunca vira nome do lead
  if (pushName && isGenericLeadName(pushName, cleanNumero)) pushName = null;
  if (pushName) pushName = pushName.trim().slice(0, 120);

  const now = new Date().toISOString();
  const firstStage = Array.isArray(stages) && stages.length > 0 ? stages[0] : null;
  console.log("[upsertCard] existing:", !!existing, "firstStage:", firstStage?.nome);

  const existingIsGeneric = isGenericLeadName(existing?.nome, cleanNumero);
  const payload: any = {
    company_id: companyId,
    numero: cleanNumero,
    nome: existingIsGeneric
      ? (pushName || existing?.nome || `Contato ${cleanNumero.slice(-4)}`)
      : existing?.nome,
    ultima_mensagem: text.slice(0, 240),
    ultima_em: now,
    canal_entrada: canal,
    canal_chat: canal,
  };

  if (!existing) {
    payload.primeiro_contato_em = now;
    if (firstStage) {
      payload.pipeline_id = firstStage.pipeline_id;
      payload.stage_id = firstStage.id;
      payload.status = firstStage.nome;
      payload.entrou_stage_em = now;
    }
    payload.user_id = userId;
    
    // Se a etapa estiver em modo manual, atribuímos o dono imediatamente via rodízio.
    // Caso contrário (IA ativa), deixamos sem dono para o motor de IA atuar.
    const { data: stageCfg } = await admin
      .from("crm_stage")
      .select("modo_atendimento, distribution_queue_id")
      .eq("id", payload.stage_id)
      .maybeSingle();
      
    if (stageCfg?.modo_atendimento === 'manual') {
      const ownerId = await pickLeadOwner(admin, companyId, payload.stage_id);
      if (ownerId) payload.owner_id = ownerId;
    }


    let { data: inserted, error } = await admin
      .from("crm_cards")
      .insert(payload)
      .select("*")
      .maybeSingle();

    // Corrida entre duas mensagens simultâneas do mesmo contato: o card já foi
    // criado por outra requisição — relê em vez de abortar o webhook.
    if (error && (error as any).code === "23505") {
      const { data: existingCard } = await admin
        .from("crm_cards")
        .select("*")
        .eq("company_id", companyId)
        .eq("numero", cleanNumero)
        .maybeSingle();
      if (existingCard) {
        await admin
          .from("crm_cards")
          .update({ ultima_mensagem: payload.ultima_mensagem, ultima_em: payload.ultima_em })
          .eq("id", existingCard.id);
        return { ...existingCard, ultima_mensagem: payload.ultima_mensagem, ultima_em: payload.ultima_em };
      }
      inserted = null as any;
      error = null as any;
    }

    
    if (error) throw error;
    try {
      const { emitWebhook } = await import("./webhooks.server");
      await emitWebhook(companyId, "lead.created", {
        id: inserted?.id, nome: inserted?.nome, numero: cleanNumero, canal, ultima_mensagem: text.slice(0, 240),
      });
    } catch (e) { console.warn("[upsertCard] webhook lead.created", e); }
    return inserted;
  } else {
    // Atualiza card existente
    const updatePayload: any = {
      ultima_mensagem: payload.ultima_mensagem,
      ultima_em: payload.ultima_em,
    };

    if (canal && (!existing.canal_chat || (existing.canal_chat === "whatsapp" && canal !== "whatsapp"))) {
      updatePayload.canal_chat = canal;
    }

    // Só atualiza o nome se o atual for genérico ou estiver vazio
    if (existingIsGeneric && pushName) {
      updatePayload.nome = pushName;
    }

    // PERSISTÊNCIA DE DONO: Se o card já tem dono, não sobrescreve.
    // Se o card NÃO tem dono, verificamos se a etapa atual é manual para atribuir via rodízio.
    if (!existing.owner_id) {
      const { data: currentStage } = await admin
        .from("crm_stage")
        .select("modo_atendimento")
        .eq("id", existing.stage_id)
        .maybeSingle();

      if (currentStage?.modo_atendimento === 'manual') {
        const ownerId = await pickLeadOwner(admin, companyId, existing.stage_id);
        if (ownerId) updatePayload.owner_id = ownerId;
      }
    }

    const { data: updated, error } = await admin
      .from("crm_cards")
      .update(updatePayload)
      .eq("id", existing.id)
      .select("*")
      .maybeSingle();

    if (error) throw error;
    return updated;
  }
}

/**
 * Busca lista resumida de etapas para o motor de IA.
 */
export async function getStagesBrief(
  admin: any,
  companyId: string,
  preferredPipelineId?: string | null,
): Promise<StageBrief[]> {
  let pipelineId = preferredPipelineId || null;

  if (!pipelineId) {
    const { data: entrada } = await admin
      .from("crm_pipeline")
      .select("id")
      .eq("company_id", companyId)
      .eq("entrada", true)
      .limit(1);
    pipelineId = entrada?.[0]?.id ?? null;
  }

  if (!pipelineId) {
    const { data: pipelines } = await admin
      .from("crm_pipeline")
      .select("id")
      .eq("company_id", companyId)
      .eq("tipo", "comercial")
      .limit(1);
    pipelineId = pipelines?.[0]?.id ?? null;
  }

  if (!pipelineId) return [];

  const { data: stages } = await admin
    .from("crm_stage")
    .select("id, nome, pipeline_id, tipo, mensagem_prompt")
    .eq("pipeline_id", pipelineId)
    .order("ordem", { ascending: true });

  const { resolveStageAiMeta } = await import("./crm-stage-meta");
  return (stages || []).map((s: any) => {
    const meta = resolveStageAiMeta(s);
    return {
      id: s.id,
      nome: s.nome,
      pipeline_id: s.pipeline_id,
      tipo: s.tipo,
      criterio_ia: meta.criterio_ia,
      bloqueada_para_ia: meta.bloqueada_para_ia,
    };
  });
}

/**
 * Escolhe um dono para o lead com base na fila de distribuição.
 */
export async function pickLeadOwner(admin: any, companyId: string, stageId?: string): Promise<string | null> {
  try {
    // Empresas em triagem manual nunca recebem dono automático.
    if (await isManualDistribution(admin, companyId)) return null;

    const { getNextUserInQueue } = await import("./distribution.functions");

    // Prioriza a fila configurada na etapa de destino; usa a fila padrão como fallback.
    let queue: { id: string; nome: string } | null = null;
    if (stageId) {
      const { data: stage } = await admin
        .from("crm_stage")
        .select("pipeline_id, distribution_queue_id, distribution_user_id")
        .eq("id", stageId)
        .eq("company_id", companyId)
        .maybeSingle();

      // Si la etapa asigna a un usuario específico, retornarlo directamente
      if (stage?.distribution_user_id) {
        return stage.distribution_user_id;
      }

      if (stage?.distribution_queue_id) {
        const { data: configuredQueue } = await admin
          .from("crm_distribution_queues")
          .select("id, nome")
          .eq("id", stage.distribution_queue_id)
          .eq("company_id", companyId)
          .eq("ativo", true)
          .maybeSingle();
        queue = configuredQueue;
      }

      // Fallback a la cola de distribución configurada a nivel de embudo
      if (!queue && stage?.pipeline_id) {
        const { data: pipe } = await admin
          .from("crm_pipeline")
          .select("distribution_queue_id")
          .eq("id", stage.pipeline_id)
          .eq("company_id", companyId)
          .maybeSingle();
        if (pipe?.distribution_queue_id) {
          const { data: pipeQueue } = await admin
            .from("crm_distribution_queues")
            .select("id, nome")
            .eq("id", pipe.distribution_queue_id)
            .eq("company_id", companyId)
            .eq("ativo", true)
            .maybeSingle();
          queue = pipeQueue;
        }
      }
    }

    if (!queue) {
      const { data: defaultQueue } = await admin
        .from("crm_distribution_queues")
        .select("id, nome")
        .eq("company_id", companyId)
        .eq("ativo", true)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      queue = defaultQueue;
    }

    if (!queue) {
      console.warn("[pickLeadOwner] Nenhuma fila ativa encontrada para empresa", companyId);
      return null;
    }

    console.log(`[pickLeadOwner] Usando fila: ${queue.nome} (${queue.id})`);

    // 2. Usa a lógica centralizada de distribuição (que já trata Round Robin vs Sequencial)
    const nextUserId = await getNextUserInQueue(admin, queue.id);
    
    if (!nextUserId) {
      console.warn("[pickLeadOwner] Fila retornou null - Verifique se há membros ativos na fila.");
    }

    return nextUserId;
  } catch (e) {
    console.error("[pickLeadOwner] Error:", e);
    return null;
  }
}

/**
 * Move um card para uma etapa, ajustando também o funil (pipeline_id) e o status.
 * Sem isso, mover para uma etapa de OUTRO funil (ex.: follow up) deixava o card
 * preso visualmente no funil antigo.
 */
export async function moveCardToStage(
  admin: any,
  cardId: string,
  stageId: string,
  extra: Record<string, any> = {},
): Promise<void> {
  const { data: stage } = await admin
    .from("crm_stage")
    .select("id, nome, pipeline_id, tipo, trigger_pipeline_destino, mensagem_prompt")
    .eq("id", stageId)
    .maybeSingle();

  const { data: cardInfo } = await admin
    .from("crm_cards")
    .select("id, company_id, numero, nome, valor, owner_id")
    .eq("id", cardId)
    .maybeSingle();

  const patch: any = {
    stage_id: stageId,
    entrou_stage_em: new Date().toISOString(),
    regua_ultimo_disparo_em: null,
    ...extra,
  };
  if (stage?.pipeline_id) patch.pipeline_id = stage.pipeline_id;
  if (stage?.nome) patch.status = stage.nome;

  // Si la etapa tiene configurado un disparador hacia otro embudo (trigger_pipeline_destino)
  if (stage?.trigger_pipeline_destino) {
    const { data: firstStageDest } = await admin
      .from("crm_stage")
      .select("id, nome, pipeline_id")
      .eq("pipeline_id", stage.trigger_pipeline_destino)
      .order("ordem", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (firstStageDest) {
      patch.pipeline_id = firstStageDest.pipeline_id;
      patch.stage_id = firstStageDest.id;
      patch.status = firstStageDest.nome;
      if (cardInfo?.company_id) {
        try {
          await admin.from("lead_evento").insert({
            company_id: cardInfo.company_id,
            card_id: cardId,
            tipo: "mudanca_etapa",
            descricao: `Transferido automáticamente al embudo destino por la etapa "${stage.nome}"`,
          });
        } catch {
          // best-effort
        }
      }
    }
  }

  // Entrando em etapa de Perda: encerra o ciclo (régua parada) e marca a data,
  // que é a base da janela de reativação por retorno do lead.
  if (stage?.tipo === "perda") {
    patch.perdido_em = new Date().toISOString();
    if (patch.regua_status === undefined) patch.regua_status = "pausada";
  }

  const { data: updatedCard, error: updateErr } = await admin
    .from("crm_cards")
    .update(patch)
    .eq("id", cardId)
    .select("id, stage_id, company_id")
    .single();

  if (updateErr || !updatedCard) {
    throw updateErr ?? new Error(`No se pudo actualizar la tarjeta ${cardId}`);
  }

  // Webhooks de saída: venda ganha / lead perdido.
  if (cardInfo?.company_id && (stage?.tipo === "ganho" || stage?.tipo === "perda")) {
    try {
      const { emitWebhook } = await import("./webhooks.server");
      await emitWebhook(cardInfo.company_id, stage.tipo === "ganho" ? "lead.won" : "lead.lost", {
        id: cardInfo.id,
        nome: cardInfo.nome,
        numero: cardInfo.numero,
        valor: cardInfo.valor,
        owner_id: cardInfo.owner_id,
        stage_id: stageId,
        stage_nome: stage?.nome,
      });
    } catch (e) {
      console.warn("[moveCardToStage] webhook ganho/perda", e);
    }
  }

  // Meta Conversions API (CAPI) automático ao mudar de etapa
  if (cardInfo?.company_id) {
    try {
      const { resolveStageAiMeta } = await import("./crm-stage-meta");
      const meta = resolveStageAiMeta(stage);
      const metaEvent = (stage as any)?.meta_conversion_event || (meta as any)?.meta_conversion_event || (stage?.tipo === "ganho" ? "Purchase" : null);
      if (metaEvent) {
        const { sendMetaConversionForLead } = await import("./meta-capi.server");
        void sendMetaConversionForLead({
          companyId: cardInfo.company_id,
          cardId,
          eventName: metaEvent,
          value: cardInfo.valor ? Number(cardInfo.valor) : undefined,
          dedupKey: `${cardId}_${stageId}_${metaEvent}`,
        }).catch((e) => console.warn("[moveCardToStage.metaCapi] Error:", e?.message));
      }
    } catch (e: any) {
      console.warn("[moveCardToStage.metaCapi] Best-effort error:", e?.message);
    }
  }
}

/**
 * Lead perdido voltou a falar: devolve o card para a "rota de retorno"
 * configurada na etapa de Perda (ou a rota específica gravada no card).
 * Retorna true quando o card foi reativado.
 */
export async function reactivateLostCard(
  admin: any,
  card: { id: string; company_id: string; numero?: string | null; stage_id: string | null; perdido_em?: string | null; retorno_stage_id?: string | null; owner_id?: string | null },
): Promise<boolean> {
  if (!card.stage_id) return false;

  const { data: stage } = await admin
    .from("crm_stage")
    .select("id, tipo, retorno_ativo, retorno_pipeline_id, retorno_stage_id, retorno_responsavel_modo, retorno_user_id, retorno_modo_atendimento, retorno_janela_dias")
    .eq("id", card.stage_id)
    .maybeSingle();
  if (!stage || stage.tipo !== "perda") return false;

  const override = card.retorno_stage_id ?? null;
  if (!override && !stage.retorno_ativo) return false;

  // Janela: 0 = sempre reativa.
  const janela = Number(stage.retorno_janela_dias || 0);
  if (janela > 0 && card.perdido_em) {
    const limite = new Date(card.perdido_em).getTime() + janela * 86400000;
    if (Date.now() > limite) return false;
  }

  // Destino: override do card > etapa configurada > 1ª etapa do funil de retorno.
  let destinoId: string | null = override || stage.retorno_stage_id || null;
  if (destinoId) {
    const { data: exists } = await admin.from("crm_stage").select("id").eq("id", destinoId).maybeSingle();
    if (!exists) destinoId = null;
  }
  if (!destinoId && stage.retorno_pipeline_id) {
    const { data: first } = await admin
      .from("crm_stage")
      .select("id")
      .eq("pipeline_id", stage.retorno_pipeline_id)
      .order("ordem", { ascending: true })
      .limit(1)
      .maybeSingle();
    destinoId = first?.id ?? null;
  }
  if (!destinoId) return false;

  const extra: any = {
    regua_status: "ativa",
    reativado_em: new Date().toISOString(),
    perdido_em: null,
    retorno_stage_id: null,
  };

  if (stage.retorno_responsavel_modo === "fixo" && stage.retorno_user_id) {
    extra.owner_id = stage.retorno_user_id;
  } else if (stage.retorno_responsavel_modo === "fila") {
    const ownerId = await pickLeadOwner(admin, card.company_id, destinoId);
    if (ownerId) extra.owner_id = ownerId;
  }

  await moveCardToStage(admin, card.id, destinoId, extra);

  // Quem atende no retorno: IA volta a responder ou humano assume.
  if (card.numero) {
    const humano = stage.retorno_modo_atendimento !== "ia";
    await admin.from("contact_pause").upsert(
      {
        company_id: card.company_id,
        numero: card.numero,
        pausado: humano,
        pausado_por: humano ? "humano" : "sistema",
        pausado_em: new Date().toISOString(),
      },
      { onConflict: "company_id,numero" },
    );
  }

  try {
    await admin.from("lead_evento").insert({
      company_id: card.company_id,
      card_id: card.id,
      tipo: "mudanca_etapa",
      descricao: "Reativado por retorno do lead (saiu da etapa de Perda)",
    });
  } catch { /* histórico é best-effort */ }

  try {
    const { data: dest } = await admin.from("crm_stage").select("nome").eq("id", destinoId).maybeSingle();
    await admin.rpc("push_notificacao", {
      _company_id: card.company_id,
      _tipo: "lead_novo",
      _titulo: "Lead perdido voltou a falar",
      _descricao: `O lead retornou e foi movido para ${dest?.nome ?? "a etapa de retorno"}.`,
      _link: "/app/crm",
      _ref_id: card.id,
    });
  } catch { /* notificação é best-effort */ }

  return true;
}


