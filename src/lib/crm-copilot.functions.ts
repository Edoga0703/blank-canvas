// src/lib/crm-copilot.functions.ts
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveCompanyIdCached } from "@/lib/company-cache";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  getCrmCopilotContext,
  buildCrmCopilotSystemPrompt,
  parseCrmCopilotOutput,
  type CrmCopilotActionProposal,
  type CrmCopilotTurnResult,
} from "./crm-copilot.server";
import { lovableAiChat, type ChatMsg } from "./lovable-ai.server";
import { moveCardToStage, pickLeadOwner } from "./crm-engine.server";
import { extractCleanStageName, resolveStageAiMeta } from "./crm-stage-meta";

export interface CrmCopilotChatMessage {
  role: "user" | "assistant";
  content: string;
  proposals?: CrmCopilotActionProposal[];
}

async function requireAdminCompany(supabase: any, userId: string): Promise<string> {
  const companyId = await resolveCompanyIdCached(supabase, userId);
  const { data: isSuper } = await supabase.rpc("is_super_admin");
  if (!isSuper) {
    const { data: cu } = await supabase
      .from("company_user")
      .select("role")
      .eq("company_id", companyId)
      .eq("user_id", userId)
      .eq("ativo", true)
      .maybeSingle();
    if (!cu || (cu.role !== "owner" && cu.role !== "admin")) {
      throw new Error("Solo el dueño o los administradores pueden editar la arquitectura del CRM.");
    }
  }
  return companyId as string;
}

/**
 * Ejecución interna y directa de una acción de gestión del CRM Kanban.
 * Utilizada tanto por la API manual (1 clic) como por la ejecución autónoma de la IA.
 */
export async function executeCrmCopilotActionInternal(
  adminSupabase: any,
  companyId: string,
  userId: string,
  action: CrmCopilotActionProposal,
  pipelineIdParam?: string | null,
  cardIdParam?: string | null
): Promise<{ ok: boolean; message: string }> {
  // 1. Modificar criterios de etapa (serializado en mensagem_prompt)
  if (action.type === "stage_criteria") {
    const rawStageId = String(
      action.payload?.stageId || action.payload?.stage_id || action.payload?.id || ""
    ).trim();
    const stageNameFallback = String(
      action.payload?.stageName || action.payload?.stage_name || action.payload?.nome || ""
    ).trim();

    const criterioIa = String(
      action.payload?.criterio_ia ??
      action.payload?.criterio ??
      action.payload?.criteria ??
      action.payload?.ai_criteria ??
      ""
    ).trim();

    const bloqueadaParaIa = Boolean(
      action.payload?.bloqueada_para_ia ??
      action.payload?.bloqueadaParaIa ??
      action.payload?.is_locked ??
      action.payload?.locked ??
      false
    );

    let stage: any = null;
    if (rawStageId) {
      const { data: stById } = await adminSupabase
        .from("crm_stage")
        .select("id, nome, company_id, mensagem_prompt, criterio_ia, bloqueada_para_ia")
        .eq("id", rawStageId)
        .eq("company_id", companyId)
        .maybeSingle();
      stage = stById;
    }

    if (!stage && (stageNameFallback || rawStageId)) {
      const queryName = stageNameFallback || rawStageId;
      const { data: stByName } = await adminSupabase
        .from("crm_stage")
        .select("id, nome, company_id, mensagem_prompt, criterio_ia, bloqueada_para_ia")
        .eq("company_id", companyId)
        .ilike("nome", queryName)
        .order("ordem", { ascending: true })
        .limit(1)
        .maybeSingle();
      stage = stByName;
    }

    if (!stage) throw new Error(`Etapa no encontrada en esta empresa (ID/Nombre: ${rawStageId || stageNameFallback}).`);

    const currentMeta = resolveStageAiMeta(stage);

    const packedPrompt = JSON.stringify({
      criterio_ia: criterioIa || "",
      bloqueada_para_ia: bloqueadaParaIa,
      mensagem_prompt: currentMeta.mensagem_prompt || "",
    });

    const { error: upErr } = await adminSupabase
      .from("crm_stage")
      .update({
        mensagem_prompt: packedPrompt,
      })
      .eq("id", stage.id);

    if (upErr) throw new Error(`Error al actualizar criterios: ${upErr.message}`);

    await adminSupabase.from("audit_log").insert({
      company_id: companyId,
      user_id: userId,
      acao: "crm_copilot_stage_criteria",
      detalhes: {
        stage_id: stage.id,
        stage_name: stage.nome,
        criterio_ia: criterioIa,
        bloqueada_para_ia: bloqueadaParaIa,
        applied_at: new Date().toISOString(),
      },
    });

    return {
      ok: true,
      message: `Criterio de la etapa "${stage.nome}" actualizado correctamente.`,
    };
  }

  // 2. Crear nueva etapa en el embudo (con deduplicación inteligente)
  if (action.type === "create_stage") {
    let pipelineId = String(
      action.payload?.pipelineId || action.payload?.pipeline_id || pipelineIdParam || ""
    ).trim();

    const nome = extractCleanStageName(action);

    const cor = String(action.payload?.cor || action.payload?.color || "#60A5FA").trim();
    let tipo = String(action.payload?.tipo || action.payload?.type || "normal").toLowerCase().trim();
    if (tipo === "ganado" || tipo === "won") tipo = "ganho";
    if (tipo === "perdido" || tipo === "lost") tipo = "perda";
    if (!["normal", "ganho", "perda"].includes(tipo)) tipo = "normal";

    const criterioIa = String(
      action.payload?.criterio_ia ??
      action.payload?.criterio ??
      action.payload?.criteria ??
      action.payload?.ai_criteria ??
      ""
    ).trim();
    const bloqueadaParaIa = Boolean(
      action.payload?.bloqueada_para_ia ??
      action.payload?.bloqueadaParaIa ??
      action.payload?.is_locked ??
      action.payload?.locked ??
      false
    );

    if (!pipelineId || pipelineId.includes("ID_")) {
      const { data: defaultPipe } = await adminSupabase
        .from("crm_pipeline")
        .select("id")
        .eq("company_id", companyId)
        .order("ordem", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (defaultPipe?.id) pipelineId = defaultPipe.id;
    }

    if (!pipelineId) throw new Error("ID del embudo no proporcionado.");

    // Verificar si ya existe una etapa con el mismo nombre en este embudo
    const { data: existingStage } = await adminSupabase
      .from("crm_stage")
      .select("id, nome, mensagem_prompt, criterio_ia, bloqueada_para_ia")
      .eq("company_id", companyId)
      .eq("pipeline_id", pipelineId)
      .ilike("nome", nome)
        .order("ordem", { ascending: true })
        .limit(1)
        .maybeSingle();

    if (existingStage) {
      // Actualizar la existente en vez de duplicarla
      const currentMeta = resolveStageAiMeta(existingStage);
      const packedPrompt = JSON.stringify({
        criterio_ia: criterioIa || currentMeta.criterio_ia || "",
        bloqueada_para_ia: bloqueadaParaIa,
        mensagem_prompt: currentMeta.mensagem_prompt || "",
      });

      await adminSupabase
        .from("crm_stage")
        .update({
          mensagem_prompt: packedPrompt,
          cor,
          tipo,
        })
        .eq("id", existingStage.id);

      return {
        ok: true,
        message: `La etapa "${nome}" ya existía en el embudo y sus criterios fueron actualizados exitosamente.`,
      };
    }

    const { data: stagesCount } = await adminSupabase
      .from("crm_stage")
      .select("id, ordem")
      .eq("pipeline_id", pipelineId)
      .order("ordem", { ascending: false })
      .limit(1);

    const nextOrder = (stagesCount?.[0]?.ordem ?? 0) + 1;

    const packedPrompt = JSON.stringify({
      criterio_ia: criterioIa || "",
      bloqueada_para_ia: bloqueadaParaIa,
      mensagem_prompt: "",
    });

    const { data: newStage, error: insErr } = await adminSupabase
      .from("crm_stage")
      .insert({
        company_id: companyId,
        pipeline_id: pipelineId,
        nome,
        cor,
        tipo,
        ordem: nextOrder,
        mensagem_prompt: packedPrompt,
        modo_atendimento: "auto",
      })
      .select("id, nome")
      .maybeSingle();

    if (insErr || !newStage) throw new Error(`Error al crear la etapa: ${insErr?.message || "Desconocido"}`);

    await adminSupabase.from("audit_log").insert({
      company_id: companyId,
      user_id: userId,
      acao: "crm_copilot_create_stage",
      detalhes: {
        stage_id: newStage.id,
        stage_name: newStage.nome,
        pipeline_id: pipelineId,
        applied_at: new Date().toISOString(),
      },
    });

    return {
      ok: true,
      message: `Nueva etapa "${newStage.nome}" creada exitosamente en el embudo.`,
    };
  }

  // 3. Actualizar Prompt Maestro del Embudo
  if (action.type === "pipeline_prompt") {
    let pipelineId = String(
      action.payload?.pipelineId || action.payload?.pipeline_id || pipelineIdParam || ""
    ).trim();

    const crmMasterPrompt = String(
      action.payload?.crm_master_prompt ||
      action.payload?.master_prompt ||
      action.payload?.prompt ||
      action.payload?.crmMasterPrompt ||
      action.payload?.content ||
      ""
    ).trim();

    if (!crmMasterPrompt) throw new Error("El texto del prompt no puede estar vacío.");

    if (!pipelineId) {
      const { data: defaultPipe } = await adminSupabase
        .from("crm_pipeline")
        .select("id, nome, agent_id")
        .eq("company_id", companyId)
        .order("ordem", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (defaultPipe) {
        pipelineId = defaultPipe.id;
      }
    }

    const { data: pipe, error: pipeErr } = await adminSupabase
      .from("crm_pipeline")
      .select("id, nome, agent_id")
      .eq("id", pipelineId)
      .eq("company_id", companyId)
      .maybeSingle();

    if (pipeErr || !pipe) throw new Error("Embudo no encontrado.");

    await adminSupabase
      .from("crm_pipeline")
      .update({
        crm_master_prompt: crmMasterPrompt || null,
      } as any)
      .eq("id", pipe.id);

    await adminSupabase.from("audit_log").insert({
      company_id: companyId,
      user_id: userId,
      acao: "crm_copilot_pipeline_prompt",
      detalhes: {
        pipeline_id: pipe.id,
        pipeline_name: pipe.nome,
        applied_at: new Date().toISOString(),
      },
    });

    return {
      ok: true,
      message: `Prompt maestro del embudo "${pipe.nome}" actualizado correctamente.`,
    };
  }

  // 4. Cambiar automatización de la etapa
  if (action.type === "stage_automation") {
    const rawStageId = String(
      action.payload?.stageId || action.payload?.stage_id || action.payload?.id || ""
    ).trim();
    const stageNameFallback = String(
      action.payload?.stageName || action.payload?.stage_name || action.payload?.nome || ""
    ).trim();
    const modoAtendimento = String(
      action.payload?.modo_atendimento || action.payload?.modo || action.payload?.mode || "auto"
    ).trim();

    let stage: any = null;
    if (rawStageId) {
      const { data: stById } = await adminSupabase
        .from("crm_stage")
        .select("id, nome")
        .eq("id", rawStageId)
        .eq("company_id", companyId)
        .maybeSingle();
      stage = stById;
    }
    if (!stage && (stageNameFallback || rawStageId)) {
      const queryName = stageNameFallback || rawStageId;
      const { data: stByName } = await adminSupabase
        .from("crm_stage")
        .select("id, nome")
        .eq("company_id", companyId)
        .ilike("nome", queryName)
        .order("ordem", { ascending: true })
        .limit(1)
        .maybeSingle();
      stage = stByName;
    }

    if (!stage) throw new Error(`Etapa no encontrada (ID: ${rawStageId || stageNameFallback}).`);

    const { error: upErr } = await adminSupabase
      .from("crm_stage")
      .update({
        modo_atendimento: modoAtendimento,
      })
      .eq("id", stage.id);

    if (upErr) throw new Error(`Error al cambiar modo de atención: ${upErr.message}`);

    return {
      ok: true,
      message: `Modo de atención de la etapa "${stage.nome}" actualizado a "${modoAtendimento}".`,
    };
  }

  // 5. Mover un lead a una etapa sugerida
  if (action.type === "move_lead") {
    const targetCardId = String(action.payload?.cardId || cardIdParam || "").trim();
    const targetStageId = String(action.payload?.targetStageId || action.payload?.stageId || "").trim();
    const targetStageName = String(action.payload?.targetStageName || action.payload?.stageName || "").trim();

    if (!targetCardId) {
      throw new Error("Se requiere cardId para mover el lead.");
    }

    const { data: card } = await adminSupabase
      .from("crm_cards")
      .select("id, nome, numero, stage_id, owner_id")
      .eq("id", targetCardId)
      .eq("company_id", companyId)
      .maybeSingle();

    if (!card) throw new Error("Lead no encontrado.");

    let destStage: any = null;
    if (targetStageId) {
      const { data: st } = await adminSupabase
        .from("crm_stage")
        .select("id, nome, modo_atendimento")
        .eq("id", targetStageId)
        .eq("company_id", companyId)
        .maybeSingle();
      destStage = st;
    }

    if (!destStage && targetStageName) {
      const { data: stByName } = await adminSupabase
        .from("crm_stage")
        .select("id, nome, modo_atendimento")
        .eq("company_id", companyId)
        .ilike("nome", targetStageName)
        .order("ordem", { ascending: true })
        .limit(1)
        .maybeSingle();
      destStage = stByName;
    }

    if (!destStage) throw new Error(`Etapa de destino no encontrada (${targetStageId || targetStageName}).`);

    const extra: Record<string, any> = {};
    if (!card.owner_id && destStage.modo_atendimento === "manual") {
      const assignedOwner = await pickLeadOwner(adminSupabase, companyId, destStage.id);
      if (assignedOwner) extra.owner_id = assignedOwner;
    }

    await moveCardToStage(adminSupabase, card.id, destStage.id, extra);

    await adminSupabase.from("lead_evento").insert({
      company_id: companyId,
      card_id: card.id,
      tipo: "mudanca_etapa",
      descricao: `Movido a "${destStage.nome}" mediante gestión autónoma de CRM Copilot.`,
    });

    return {
      ok: true,
      message: `Lead "${card.nome || card.numero}" movido exitosamente a la etapa "${destStage.nome}".`,
    };
  }

  // 6. Renombrar una etapa
  if (action.type === "rename_stage") {
    const rawStageId = String(action.payload?.stageId || action.payload?.id || "").trim();
    const oldName = String(action.payload?.oldName || action.payload?.old_name || "").trim();
    const newName = String(action.payload?.newName || action.payload?.new_name || action.payload?.nome || "").trim();

    if (!newName) throw new Error("El nuevo nombre de la etapa no puede estar vacío.");

    let stage: any = null;
    if (rawStageId) {
      const { data: s } = await adminSupabase
        .from("crm_stage")
        .select("id, nome")
        .eq("id", rawStageId)
        .eq("company_id", companyId)
        .maybeSingle();
      stage = s;
    }
    if (!stage && oldName) {
      const { data: sByName } = await adminSupabase
        .from("crm_stage")
        .select("id, nome")
        .eq("company_id", companyId)
        .ilike("nome", oldName)
        .order("ordem", { ascending: true })
        .limit(1)
        .maybeSingle();
      stage = sByName;
    }

    if (!stage) throw new Error(`Etapa a renombrar no encontrada (${rawStageId || oldName}).`);

    await adminSupabase
      .from("crm_stage")
      .update({ nome: newName })
      .eq("id", stage.id);

    await adminSupabase.from("audit_log").insert({
      company_id: companyId,
      user_id: userId,
      acao: "crm_copilot_rename_stage",
      detalhes: {
        stage_id: stage.id,
        old_name: stage.nome,
        new_name: newName,
        applied_at: new Date().toISOString(),
      },
    });

    return {
      ok: true,
      message: `Etapa "${stage.nome}" renombrada a "${newName}" exitosamente.`,
    };
  }

  // 7. Eliminar una etapa de forma segura
  if (action.type === "delete_stage") {
    const rawStageId = String(action.payload?.stageId || action.payload?.id || "").trim();
    const stageName = String(action.payload?.stageName || action.payload?.nome || "").trim();

    let stage: any = null;
    if (rawStageId) {
      const { data: s } = await adminSupabase
        .from("crm_stage")
        .select("id, nome, pipeline_id")
        .eq("id", rawStageId)
        .eq("company_id", companyId)
        .maybeSingle();
      stage = s;
    }
    if (!stage && stageName) {
      const { data: sByName } = await adminSupabase
        .from("crm_stage")
        .select("id, nome, pipeline_id")
        .eq("company_id", companyId)
        .ilike("nome", stageName)
        .order("ordem", { ascending: true })
        .limit(1)
        .maybeSingle();
      stage = sByName;
    }

    if (!stage) throw new Error(`Etapa a eliminar no encontrada (${rawStageId || stageName}).`);

    // Comprobar si hay leads en esa etapa y reubicarlos a la primera etapa disponible
    const { data: cardsOnStage } = await adminSupabase
      .from("crm_cards")
      .select("id")
      .eq("stage_id", stage.id)
      .eq("company_id", companyId);

    if (cardsOnStage && cardsOnStage.length > 0) {
      const { data: fallbackStage } = await adminSupabase
        .from("crm_stage")
        .select("id, nome")
        .eq("company_id", companyId)
        .neq("id", stage.id)
        .order("ordem", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (fallbackStage) {
        await adminSupabase
          .from("crm_cards")
          .update({ stage_id: fallbackStage.id, status: fallbackStage.nome })
          .eq("stage_id", stage.id)
          .eq("company_id", companyId);
      }
    }

    const { error: delErr } = await adminSupabase
      .from("crm_stage")
      .delete()
      .eq("id", stage.id);

    if (delErr) throw new Error(`Error al eliminar etapa: ${delErr.message}`);

    await adminSupabase.from("audit_log").insert({
      company_id: companyId,
      user_id: userId,
      acao: "crm_copilot_delete_stage",
      detalhes: {
        stage_id: stage.id,
        stage_name: stage.nome,
        applied_at: new Date().toISOString(),
      },
    });

    return {
      ok: true,
      message: `Etapa "${stage.nome}" eliminada del embudo exitosamente.`,
    };
  }

  throw new Error(`Tipo de acción "${action.type}" no soportado.`);
}

/**
 * Consulta interactiva con el Copilot del Embudo CRM y Gerente Autónomo de Leads.
 * Si el usuario expresa intención de ejecución o autoApply es verdadero, aplica
 * directamente las acciones en la base de datos y confirma el resultado.
 */
export const askCrmCopilot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    messages: CrmCopilotChatMessage[];
    pipelineId?: string | null;
    cardId?: string | null;
  }) => {
    if (!Array.isArray(d?.messages) || d.messages.length === 0) {
      throw new Error("Mensaje inválido.");
    }
    return {
      messages: d.messages,
      pipelineId: d.pipelineId || null,
      cardId: d.cardId || null,
    };
  })
  .handler(async ({ context, data }): Promise<CrmCopilotTurnResult> => {
    const { supabase, userId } = context;
    const companyId = await requireAdminCompany(supabase, userId);

    const crmCtx = await getCrmCopilotContext(supabaseAdmin, companyId, data.pipelineId, data.cardId);
    const systemPrompt = buildCrmCopilotSystemPrompt(crmCtx);

    const historyMsgs: ChatMsg[] = data.messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    // Resolver proveedor/modelo del agente o por defecto Gemini 2.5 Flash
    let provider = "gemini";
    let model = "google/gemini-2.5-flash";
    if (crmCtx.pipeline?.agent_id) {
      const { data: agent } = await supabaseAdmin
        .from("agent_config")
        .select("ai_provider, ai_model")
        .eq("id", crmCtx.pipeline.agent_id)
        .maybeSingle();
      if (agent?.ai_provider) provider = agent.ai_provider;
      if (agent?.ai_model) model = agent.ai_model;
    }

    const rawOutput = await lovableAiChat(
      [
        { role: "system", content: systemPrompt },
        ...historyMsgs,
      ],
      { provider, model }
    );

    const parsed = parseCrmCopilotOutput(rawOutput);

    // Las propuestas se devuelven en estado "pending" para que el usuario las revise y confirme con 1 clic (individual o "Aplicar todas")
    return parsed;
  });

export const executeCrmCopilotAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    action: CrmCopilotActionProposal;
    pipelineId?: string | null;
    cardId?: string | null;
  }) => {
    if (!d?.action || !d.action.type) {
      throw new Error("Acción inválida.");
    }
    return {
      action: d.action,
      pipelineId: d.pipelineId || null,
      cardId: d.cardId || null,
    };
  })
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const companyId = await requireAdminCompany(supabase, userId);
    return await executeCrmCopilotActionInternal(
      supabaseAdmin,
      companyId,
      userId,
      data.action,
      data.pipelineId,
      data.cardId
    );
  });

/**
 * Ejecuta en lote todas las acciones estructuradas pendientes generadas por el Copilot
 */
export const executeAllCrmCopilotActions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    actions: CrmCopilotActionProposal[];
    pipelineId?: string | null;
    cardId?: string | null;
  }) => {
    if (!Array.isArray(d?.actions) || d.actions.length === 0) {
      throw new Error("No hay acciones para ejecutar.");
    }
    return {
      actions: d.actions,
      pipelineId: d.pipelineId || null,
      cardId: d.cardId || null,
    };
  })
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const companyId = await requireAdminCompany(supabase, userId);
    const results: { ok: boolean; message: string }[] = [];

    for (const action of data.actions) {
      try {
        const res = await executeCrmCopilotActionInternal(
          supabaseAdmin,
          companyId,
          userId,
          action,
          data.pipelineId,
          data.cardId
        );
        action.status = "applied";
        results.push({ ok: true, message: res.message });
      } catch (err: any) {
        results.push({ ok: false, message: err.message });
      }
    }

    return {
      ok: results.every((r) => r.ok),
      results,
      appliedCount: results.filter((r) => r.ok).length,
    };
  });
