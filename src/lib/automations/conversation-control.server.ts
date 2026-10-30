// src/lib/automations/conversation-control.server.ts
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type ConversationOwnerKind = "human" | "workflow" | "ai" | "none";

export interface ConversationControlState {
  ownerKind: ConversationOwnerKind;
  ownerExecutionId: string | null;
  leaseUntil: Date | null;
  reason?: string | null;
}

// Sentinel UUID para cuando la conversación no tiene una instancia fijada (evita duplicados NULL en PostgreSQL)
export const GLOBAL_INSTANCE_SENTINEL = "00000000-0000-0000-0000-000000000000";

export function resolveInstanceScope(instanceId?: string | null): string {
  return instanceId && instanceId.trim().length > 0 ? instanceId.trim() : GLOBAL_INSTANCE_SENTINEL;
}

/**
 * Consulta el árbitro de la conversación para determinar quién tiene el turno de responder.
 * Prioridad 1: Humano (si un asesor intervino o pausó el contacto)
 * Prioridad 2: Workflow (si una automatización tiene el control activo y no ha expirado su lease)
 * Prioridad 3: IA conversacional o nada
 */
export async function getConversationControl(params: {
  companyId: string;
  externalConversationId: string;
  instanceId?: string | null;
}): Promise<ConversationControlState> {
  const { companyId, externalConversationId, instanceId } = params;
  const scopedInstanceId = resolveInstanceScope(instanceId);

  // 1. Buscar primero por la instancia específica
  const { data: specificRow, error: specificErr } = await (supabaseAdmin as any)
    .from("automation_conversation_control")
    .select("owner_kind, owner_execution_id, lease_until, reason")
    .eq("company_id", companyId)
    .eq("instance_id", scopedInstanceId)
    .eq("external_conversation_id", externalConversationId)
    .maybeSingle();

  if (specificErr) throw specificErr;
  let target = specificRow;

  // 2. Verificar el control global incluso si ya existe una fila específica.
  if (scopedInstanceId !== GLOBAL_INSTANCE_SENTINEL) {
    const { data: globalRow, error: globalErr } = await (supabaseAdmin as any)
      .from("automation_conversation_control")
      .select("owner_kind, owner_execution_id, lease_until, reason")
      .eq("company_id", companyId)
      .eq("instance_id", GLOBAL_INSTANCE_SENTINEL)
      .eq("external_conversation_id", externalConversationId)
      .maybeSingle();
    if (globalErr) throw globalErr;
    if (globalRow?.owner_kind === "human" || !target) target = globalRow;
  }

  if (!target) {
    return { ownerKind: "none", ownerExecutionId: null, leaseUntil: null };
  }

  const leaseUntil = target.lease_until ? new Date(target.lease_until) : null;
  const isLeaseActive = leaseUntil ? leaseUntil.getTime() > Date.now() : false;

  if (target.owner_kind === "workflow" && !isLeaseActive) {
    return { ownerKind: "none", ownerExecutionId: null, leaseUntil: null };
  }

  return {
    ownerKind: (target.owner_kind as ConversationOwnerKind) || "none",
    ownerExecutionId: target.owner_execution_id,
    leaseUntil,
    reason: target.reason,
  };
}

/**
 * Adquiere el control de la conversación para un workflow activo con un tiempo límite (lease).
 * Respeta rigurosamente si un humano ya tiene el control.
 */
export async function acquireWorkflowControl(params: {
  companyId: string;
  externalConversationId: string;
  executionId: string;
  instanceId?: string | null;
  cardId?: string | null;
  leaseMinutes?: number;
}): Promise<boolean> {
  const {
    companyId,
    externalConversationId,
    executionId,
    instanceId,
    cardId,
    leaseMinutes = 60,
  } = params;

  const { data, error } = await (supabaseAdmin as any)
    .rpc("automation_claim_conversation", {
      p_company_id: companyId,
      p_instance_id: instanceId || null,
      p_conversation_id: externalConversationId,
      p_execution_id: executionId,
      p_card_id: cardId || null,
      p_lease_minutes: leaseMinutes,
    });
  if (error) throw error;
  return data === true;
}

/**
 * Libera el control de la conversación al finalizar el workflow.
 */
export async function releaseWorkflowControl(params: {
  companyId: string;
  externalConversationId: string;
  executionId: string;
  instanceId?: string | null;
}): Promise<void> {
  const { companyId, externalConversationId, executionId, instanceId } = params;
  const scopedInstanceId = resolveInstanceScope(instanceId);

  await (supabaseAdmin as any)
    .from("automation_conversation_control")
    .update({
      owner_kind: "none",
      owner_execution_id: null,
      lease_until: null,
      reason: "Workflow finalizado",
      updated_at: new Date().toISOString(),
    })
    .eq("company_id", companyId)
    .eq("instance_id", scopedInstanceId)
    .eq("external_conversation_id", externalConversationId)
    .eq("owner_execution_id", executionId);
}

/**
 * Handoff explícito hacia asesor humano.
 */
export async function handoffToHuman(params: {
  companyId: string;
  externalConversationId: string;
  instanceId?: string | null;
  reason?: string;
}): Promise<void> {
  const { companyId, externalConversationId, instanceId, reason } = params;
  const scopedInstanceId = resolveInstanceScope(instanceId);

  const { error } = await (supabaseAdmin as any)
    .from("automation_conversation_control")
    .upsert(
      {
        company_id: companyId,
        instance_id: scopedInstanceId,
        external_conversation_id: externalConversationId,
        owner_kind: "human",
        owner_execution_id: null,
        lease_until: null,
        changed_by: "workflow_handoff",
        reason: reason || "Derivado a humano por automatización",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "company_id,instance_id,external_conversation_id" }
    );
  if (error) throw error;
}

/**
 * Handoff explícito hacia el Agente de IA Conversacional.
 */
export async function handoffToAi(params: {
  companyId: string;
  externalConversationId: string;
  instanceId?: string | null;
}): Promise<void> {
  const { companyId, externalConversationId, instanceId } = params;
  const scopedInstanceId = resolveInstanceScope(instanceId);

  const { error } = await (supabaseAdmin as any)
    .from("automation_conversation_control")
    .upsert(
      {
        company_id: companyId,
        instance_id: scopedInstanceId,
        external_conversation_id: externalConversationId,
        owner_kind: "ai",
        owner_execution_id: null,
        lease_until: null,
        changed_by: "workflow_handoff",
        reason: "Derivado a IA conversacional",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "company_id,instance_id,external_conversation_id" }
    );
  if (error) throw error;
}
