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
 * Consulta interactiva con el Copilot del Embudo CRM y Analista de Leads
 */
export const askCrmCopilot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: {
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
    return parsed;
  });

/**
 * Ejecuta con 1 clic una acción estructurada propuesta por el Copilot del Embudo
 */
export const executeCrmCopilotAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: {
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
    const { action } = data;

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
        const { data: stById } = await supabaseAdmin
          .from("crm_stage")
          .select("id, nome, company_id, mensagem_prompt")
          .eq("id", rawStageId)
          .eq("company_id", companyId)
          .maybeSingle();
        stage = stById;
      }

      if (!stage && (stageNameFallback || rawStageId)) {
        const queryName = stageNameFallback || rawStageId;
        const { data: stByName } = await supabaseAdmin
          .from("crm_stage")
          .select("id, nome, company_id, mensagem_prompt")
          .eq("company_id", companyId)
          .ilike("nome", queryName)
          .maybeSingle();
        stage = stByName;
      }

      if (!stage) throw new Error(`Etapa no encontrada en esta empresa (ID: ${rawStageId || stageNameFallback}).`);

      const { resolveStageAiMeta } = await import("./crm-stage-meta");
      const currentMeta = resolveStageAiMeta(stage);

      const packedPrompt = JSON.stringify({
        criterio_ia: criterioIa || "",
        bloqueada_para_ia: bloqueadaParaIa,
        mensagem_prompt: currentMeta.mensagem_prompt || "",
      });

      const { error: upErr } = await supabaseAdmin
        .from("crm_stage")
        .update({
          mensagem_prompt: packedPrompt,
        })
        .eq("id", stage.id);

      if (upErr) throw new Error(`Error al actualizar criterios: ${upErr.message}`);

      await supabaseAdmin.from("audit_log").insert({
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

    // 2. Crear nueva etapa en el embudo
    if (action.type === "create_stage") {
      const { extractCleanStageName } = await import("./crm-stage-meta");

      let pipelineId = String(
        action.payload?.pipelineId || action.payload?.pipeline_id || data.pipelineId || ""
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
        const { data: defaultPipe } = await supabaseAdmin
          .from("crm_pipeline")
          .select("id")
          .eq("company_id", companyId)
          .order("ordem", { ascending: true })
          .limit(1)
          .maybeSingle();
        if (defaultPipe?.id) pipelineId = defaultPipe.id;
      }

      if (!pipelineId) throw new Error("ID del embudo no proporcionado.");

      const { data: stagesCount } = await supabaseAdmin
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

      const { data: newStage, error: insErr } = await supabaseAdmin
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

      await supabaseAdmin.from("audit_log").insert({
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
        action.payload?.pipelineId || action.payload?.pipeline_id || data.pipelineId || ""
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
        const { data: defaultPipe } = await supabaseAdmin
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

      const { data: pipe, error: pipeErr } = await supabaseAdmin
        .from("crm_pipeline")
        .select("id, nome, agent_id")
        .eq("id", pipelineId)
        .eq("company_id", companyId)
        .maybeSingle();

      if (pipeErr || !pipe) throw new Error("Embudo no encontrado.");

      // Si el embudo tiene un agente vinculado, registrar en el agente, o actualizar el agente de la empresa
      if (pipe.agent_id) {
        await supabaseAdmin
          .from("agent_config")
          .update({
            como_vender: crmMasterPrompt,
          })
          .eq("id", pipe.agent_id);
      } else {
        await supabaseAdmin
          .from("agent_config")
          .update({
            como_vender: crmMasterPrompt,
          })
          .eq("company_id", companyId);
      }

      await supabaseAdmin.from("audit_log").insert({
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
        const { data: stById } = await supabaseAdmin
          .from("crm_stage")
          .select("id, nome")
          .eq("id", rawStageId)
          .eq("company_id", companyId)
          .maybeSingle();
        stage = stById;
      }
      if (!stage && (stageNameFallback || rawStageId)) {
        const queryName = stageNameFallback || rawStageId;
        const { data: stByName } = await supabaseAdmin
          .from("crm_stage")
          .select("id, nome")
          .eq("company_id", companyId)
          .ilike("nome", queryName)
          .maybeSingle();
        stage = stByName;
      }

      if (!stage) throw new Error(`Etapa no encontrada (ID: ${rawStageId || stageNameFallback}).`);

      const { error: upErr } = await supabaseAdmin
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
      const cardId = String(action.payload?.cardId || data.cardId || "").trim();
      const targetStageId = String(action.payload?.targetStageId || "").trim();

      if (!cardId || !targetStageId) {
        throw new Error("Se requiere cardId y targetStageId para mover el lead.");
      }

      const { data: card } = await supabaseAdmin
        .from("crm_cards")
        .select("id, nome, numero, stage_id, owner_id")
        .eq("id", cardId)
        .eq("company_id", companyId)
        .maybeSingle();

      if (!card) throw new Error("Lead no encontrado.");

      const { data: destStage } = await supabaseAdmin
        .from("crm_stage")
        .select("id, nome, modo_atendimento")
        .eq("id", targetStageId)
        .eq("company_id", companyId)
        .maybeSingle();

      if (!destStage) throw new Error("Etapa de destino no encontrada.");

      const extra: Record<string, any> = {};
      if (!card.owner_id && destStage.modo_atendimento === "manual") {
        const assignedOwner = await pickLeadOwner(supabaseAdmin, companyId, destStage.id);
        if (assignedOwner) extra.owner_id = assignedOwner;
      }

      await moveCardToStage(supabaseAdmin, card.id, destStage.id, extra);

      await supabaseAdmin.from("lead_evento").insert({
        company_id: companyId,
        card_id: card.id,
        tipo: "mudanca_etapa",
        descricao: `Movido a "${destStage.nome}" mediante acción ejecutada desde CRM Copilot por el usuario.`,
      });

      return {
        ok: true,
        message: `Lead "${card.nome || card.numero}" movido exitosamente a la etapa "${destStage.nome}".`,
      };
    }

    throw new Error(`Tipo de acción "${action.type}" no soportado.`);
  });
