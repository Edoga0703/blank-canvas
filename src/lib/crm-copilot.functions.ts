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
    if (!d?.action?.type) throw new Error("Acción inválida.");
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

    // 1. Modificar criterios de etapa
    if (action.type === "stage_criteria") {
      const stageId = String(action.payload?.stageId || "").trim();
      const criterioIa = String(action.payload?.criterio_ia || "").trim();
      const bloqueadaParaIa = Boolean(action.payload?.bloqueada_para_ia);

      if (!stageId) throw new Error("ID de etapa no proporcionado.");

      const { data: stage, error: findErr } = await supabaseAdmin
        .from("crm_stage")
        .select("id, nome, company_id")
        .eq("id", stageId)
        .eq("company_id", companyId)
        .maybeSingle();

      if (findErr || !stage) throw new Error("Etapa no encontrada en esta empresa.");

      const { error: upErr } = await supabaseAdmin
        .from("crm_stage")
        .update({
          criterio_ia: criterioIa || null,
          bloqueada_para_ia: bloqueadaParaIa,
        } as any)
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
      const pipelineId = String(action.payload?.pipelineId || data.pipelineId || "").trim();
      const nome = String(action.payload?.nome || "").trim();
      const cor = String(action.payload?.cor || "#60A5FA").trim();
      const tipo = String(action.payload?.tipo || "normal").trim();
      const criterioIa = String(action.payload?.criterio_ia || "").trim();
      const bloqueadaParaIa = Boolean(action.payload?.bloqueada_para_ia);

      if (!pipelineId) throw new Error("ID del embudo no proporcionado.");
      if (!nome) throw new Error("El nombre de la etapa no puede estar vacío.");

      const { data: stagesCount } = await supabaseAdmin
        .from("crm_stage")
        .select("id, ordem")
        .eq("pipeline_id", pipelineId)
        .order("ordem", { ascending: false })
        .limit(1);

      const nextOrder = (stagesCount?.[0]?.ordem ?? 0) + 1;

      const { data: newStage, error: insErr } = await supabaseAdmin
        .from("crm_stage")
        .insert({
          company_id: companyId,
          pipeline_id: pipelineId,
          nome,
          cor,
          tipo,
          ordem: nextOrder,
          criterio_ia: criterioIa || null,
          bloqueada_para_ia: bloqueadaParaIa,
          modo_atendimento: "auto",
        } as any)
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
      const pipelineId = String(action.payload?.pipelineId || data.pipelineId || "").trim();
      const crmMasterPrompt = String(action.payload?.crm_master_prompt || "").trim();

      if (!pipelineId) throw new Error("ID del embudo no proporcionado.");
      if (!crmMasterPrompt) throw new Error("El texto del prompt no puede estar vacío.");

      const { data: pipe, error: pipeErr } = await supabaseAdmin
        .from("crm_pipeline")
        .select("id, nome")
        .eq("id", pipelineId)
        .eq("company_id", companyId)
        .maybeSingle();

      if (pipeErr || !pipe) throw new Error("Embudo no encontrado.");

      const { error: upErr } = await supabaseAdmin
        .from("crm_pipeline")
        .update({
          crm_master_prompt: crmMasterPrompt,
        } as any)
        .eq("id", pipe.id);

      if (upErr) throw new Error(`Error al actualizar el prompt del embudo: ${upErr.message}`);

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
        message: `Prompt Maestro del embudo "${pipe.nome}" actualizado correctamente.`,
      };
    }

    // 4. Actualizar configuración / automatización de etapa
    if (action.type === "stage_automation") {
      const stageId = String(action.payload?.stageId || "").trim();
      const modoAtendimento = action.payload?.modo_atendimento;
      const moveAposQualificar = action.payload?.move_apos_qualificar_para;
      const handoffStage = action.payload?.ia_handoff_stage_id;

      if (!stageId) throw new Error("ID de etapa no proporcionado.");

      const patch: Record<string, any> = {};
      if (modoAtendimento) patch.modo_atendimento = modoAtendimento;
      if (moveAposQualificar !== undefined) patch.move_apos_qualificar_para = moveAposQualificar || null;
      if (handoffStage !== undefined) patch.ia_handoff_stage_id = handoffStage || null;

      const { data: stage, error: stageErr } = await supabaseAdmin
        .from("crm_stage")
        .select("id, nome")
        .eq("id", stageId)
        .eq("company_id", companyId)
        .maybeSingle();

      if (stageErr || !stage) throw new Error("Etapa no encontrada.");

      const { error: upErr } = await supabaseAdmin
        .from("crm_stage")
        .update(patch)
        .eq("id", stage.id);

      if (upErr) throw new Error(`Error al actualizar automatización: ${upErr.message}`);

      return {
        ok: true,
        message: `Automatización de la etapa "${stage.nome}" actualizada correctamente.`,
      };
    }

    // 5. Mover lead a una etapa
    if (action.type === "move_lead") {
      const cardId = String(action.payload?.cardId || data.cardId || "").trim();
      const stageId = String(action.payload?.stageId || "").trim();
      const reason = String(action.payload?.reason || "Movido por recomendación del Copilot CRM").trim();

      if (!cardId || !stageId) throw new Error("Card ID o Stage ID no proporcionado.");

      const [{ data: card }, { data: targetStage }] = await Promise.all([
        supabaseAdmin
          .from("crm_cards")
          .select("id, numero, owner_id")
          .eq("id", cardId)
          .eq("company_id", companyId)
          .maybeSingle(),
        supabaseAdmin
          .from("crm_stage")
          .select("id, nome, modo_atendimento")
          .eq("id", stageId)
          .eq("company_id", companyId)
          .maybeSingle(),
      ]);

      if (!card || !targetStage) throw new Error("Lead o etapa no encontrada.");

      const extra: Record<string, any> = {};
      if (!card.owner_id && targetStage.modo_atendimento === "manual") {
        const assignedOwner = await pickLeadOwner(supabaseAdmin, companyId, targetStage.id);
        if (assignedOwner) extra.owner_id = assignedOwner;
      }

      await moveCardToStage(supabaseAdmin, card.id, targetStage.id, extra);

      await supabaseAdmin.from("lead_evento").insert({
        company_id: companyId,
        card_id: card.id,
        tipo: "mudanca_etapa",
        descricao: reason,
      });

      return {
        ok: true,
        message: `Lead movido a "${targetStage.nome}" correctamente.`,
      };
    }

    throw new Error(`Tipo de acción desconocido: ${action.type}`);
  });
