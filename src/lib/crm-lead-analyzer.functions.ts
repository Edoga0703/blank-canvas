// src/lib/crm-lead-analyzer.functions.ts
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveCompanyIdCached } from "./company-cache";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { analyzeLeadInternal } from "./crm-lead-analyzer.server";
import { moveCardToStage, pickLeadOwner } from "./crm-engine.server";
import { processKanbanReguaForNumero } from "./kanban-engine.server";

export const analyzeLeadNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { cardId: string }) => {
    if (!d?.cardId) throw new Error("cardId requerido");
    return { cardId: d.cardId };
  })
  .handler(async ({ context, data }) => {
    const companyId = await resolveCompanyIdCached(context.supabase, context.userId);
    return analyzeLeadInternal(companyId, data.cardId);
  });

export const applyStageMovement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { cardId: string; stageId?: string; targetStageId?: string; reason?: string }) => {
    const resolvedCardId = String(d?.cardId || "").trim();
    const resolvedStageId = String(d?.stageId || d?.targetStageId || "").trim();
    if (!resolvedCardId || !resolvedStageId) throw new Error("cardId y stageId son requeridos");
    return { cardId: resolvedCardId, stageId: resolvedStageId, reason: d.reason };
  })
  .handler(async ({ context, data }) => {
    const companyId = await resolveCompanyIdCached(context.supabase, context.userId);

    const [{ data: card }, { data: targetStage }] = await Promise.all([
      supabaseAdmin
        .from("crm_cards")
        .select("id, numero, owner_id, campos_extras")
        .eq("id", data.cardId)
        .eq("company_id", companyId)
        .maybeSingle(),
      supabaseAdmin
        .from("crm_stage")
        .select("id, nome, pipeline_id, modo_atendimento")
        .eq("id", data.stageId)
        .eq("company_id", companyId)
        .maybeSingle(),
    ]);

    if (!card || !targetStage) {
      throw new Error("Lead o etapa de destino no encontrada");
    }

    const extra: Record<string, any> = {};
    if (!card.owner_id && targetStage.modo_atendimento === "manual") {
      const assignedOwner = await pickLeadOwner(supabaseAdmin, companyId, targetStage.id);
      if (assignedOwner) extra.owner_id = assignedOwner;
    }

    await moveCardToStage(supabaseAdmin, data.cardId, data.stageId, extra);

    try {
      await supabaseAdmin.from("lead_evento").insert({
        company_id: companyId,
        card_id: data.cardId,
        tipo: "mudanca_etapa",
        descricao: data.reason || `Movido a "${targetStage.nome}" (confirmado en CRM)`,
      });
    } catch {
      // best-effort
    }

    if (card.numero) {
      try {
        await processKanbanReguaForNumero(supabaseAdmin, companyId, card.numero);
      } catch (e) {
        console.warn("[applyStageMovement] Error al procesar régua inmediata:", e);
      }
    }

    return {
      ok: true,
      stageId: targetStage.id,
      stageName: targetStage.nome,
      pipelineId: targetStage.pipeline_id,
      ownerId: extra.owner_id ?? card.owner_id ?? null,
    };
  });
