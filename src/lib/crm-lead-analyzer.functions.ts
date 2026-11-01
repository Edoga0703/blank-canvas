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


export const syncPendingLeadsAnalysis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d?: { limit?: number }) => ({ limit: d?.limit ?? 6 }))
  .handler(async ({ context, data }) => {
    const companyId = await resolveCompanyIdCached(context.supabase, context.userId);
    const { analyzePendingCompanyLeads } = await import("./crm-lead-analyzer.server");
    return await analyzePendingCompanyLeads(companyId, data?.limit ?? 6);
  });


export const getStageCardsForBulkFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { stageId?: string | null; pipelineId?: string | null; forceAll?: boolean }) => ({
    stageId: d?.stageId ? String(d.stageId).trim() : null,
    pipelineId: d?.pipelineId ? String(d.pipelineId).trim() : null,
    forceAll: Boolean(d?.forceAll),
  }))
  .handler(async ({ context, data }) => {
    const companyId = await resolveCompanyIdCached(context.supabase, context.userId);
    const { getCardsForBulkAnalysis } = await import("./crm-lead-analyzer.server");
    return getCardsForBulkAnalysis(companyId, data);
  });

export const processBulkAnalyzeChunkFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    cardIds: string[];
    sendMetaEvents?: boolean;
    autoMove?: boolean;
    includeProductNames?: boolean;
    includeValues?: boolean;
    includeCustomerNames?: boolean;
    allowedMetaEvents?: string[];
  }) => ({
    cardIds: Array.isArray(d?.cardIds) ? d.cardIds.map(String) : [],
    sendMetaEvents: d?.sendMetaEvents !== false,
    autoMove: d?.autoMove !== false,
    includeProductNames: Boolean(d?.includeProductNames),
    includeValues: d?.includeValues !== false,
    includeCustomerNames: d?.includeCustomerNames !== false,
    allowedMetaEvents: Array.isArray(d?.allowedMetaEvents) ? d.allowedMetaEvents.map(String) : ["QualifiedLead", "Purchase"],
  }))
  .handler(async ({ context, data }) => {
    const companyId = await resolveCompanyIdCached(context.supabase, context.userId);
    const { executeBulkAnalyzeChunk } = await import("./crm-lead-analyzer.server");
    return executeBulkAnalyzeChunk(companyId, data.cardIds, {
      sendMetaEvents: data.sendMetaEvents,
      autoMove: data.autoMove,
      includeProductNames: data.includeProductNames,
      includeValues: data.includeValues,
      includeCustomerNames: data.includeCustomerNames,
      allowedMetaEvents: data.allowedMetaEvents,
    });
  });
