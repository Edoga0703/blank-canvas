import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { dispatchDomainEvent } from "./events.server";
import { enqueueInboundFallback, processInboundFallbackJobs } from "./fallback.server";
import type { DomainEvent } from "./types";

export async function recordInboundAutomationEvent(input: {
  companyId: string;
  messageId: string;
  source: string;
  instanceId: string;
  occurredAt?: string;
  payload: Record<string, any>;
}): Promise<{ triggered: number; duplicate: boolean }> {
  const key = "inbound_" + input.instanceId + "_" + input.messageId;
  const { data: row, error: insertErr } = await (supabaseAdmin as any)
    .from("automation_events")
    .insert({
      company_id: input.companyId,
      event_name: "messaging.inbound_received.v1",
      entity_type: "message",
      entity_id: input.messageId,
      source: input.source,
      idempotency_key: key,
      payload: input.payload,
      processing_state: "pending",
    })
    .select("id").single();
  if (insertErr?.code === "23505") return { triggered: 0, duplicate: true };
  if (insertErr || !row?.id) throw insertErr || new Error("No se pudo persistir evento inbound");

  const owner = randomUUID();
  const { data: claimed, error: claimErr } = await (supabaseAdmin as any)
    .from("automation_events")
    .update({
      processing_state: "processing", lease_owner: owner,
      lease_until: new Date(Date.now() + 60_000).toISOString(),
      attempts: 1,
    })
    .eq("id", row.id).eq("processing_state", "pending")
    .select("id").maybeSingle();
  if (claimErr || !claimed) throw claimErr || new Error("No se pudo reclamar evento inbound");

  const event: DomainEvent = {
    id: row.id,
    companyId: input.companyId,
    name: "messaging.inbound_received.v1",
    occurredAt: input.occurredAt || new Date().toISOString(),
    entity: { type: "message", id: input.messageId },
    source: input.source,
    idempotencyKey: key,
    payload: input.payload,
  };
  try {
    const result = await dispatchDomainEvent(event);
    if (result.triggered === 0) await enqueueInboundFallback(event);
    const { data: closed, error: closeErr } = await (supabaseAdmin as any)
      .from("automation_events")
      .update({ processing_state: "processed", lease_owner: null, lease_until: null })
      .eq("id", row.id).eq("lease_owner", owner).select("id").maybeSingle();
    if (closeErr || !closed) throw closeErr || new Error("Lease inbound perdido");
    if (result.triggered === 0) {
      // Acelera la respuesta en procesos persistentes; el cron recupera si serverless termina.
      void processInboundFallbackJobs(1).catch((err) =>
        console.error("[inbound-event] Fallback inmediato:", err?.message));
    }
    return { triggered: result.triggered, duplicate: false };
  } catch (err: any) {
    const { error: releaseErr } = await (supabaseAdmin as any)
      .from("automation_events")
      .update({
        processing_state: "pending", lease_owner: null, lease_until: null,
        last_error: String(err?.message || err).slice(0, 500),
      })
      .eq("id", row.id).eq("lease_owner", owner);
    if (releaseErr) console.error("[inbound-event] No se pudo liberar:", releaseErr.message);
    throw err;
  }
}
