import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { DomainEvent } from "./types";

export async function enqueueInboundFallback(event: DomainEvent): Promise<void> {
  if (event.name !== "messaging.inbound_received.v1") return;
  const { error } = await (supabaseAdmin as any)
    .from("automation_inbound_fallback_jobs")
    .insert({ company_id: event.companyId, event_id: event.id, status: "pending" });
  if (error && error.code !== "23505") throw error;
}

export async function processInboundFallbackJobs(limit = 1): Promise<number> {
  const nowIso = new Date().toISOString();
  const { data: candidates, error: listErr } = await (supabaseAdmin as any)
    .from("automation_inbound_fallback_jobs")
    .select("id,company_id,event_id,attempts")
    .or("status.eq.pending,and(status.eq.leased,lease_until.lt." + nowIso + ")")
    .order("created_at", { ascending: true }).limit(limit);
  if (listErr) throw listErr;
  let processed = 0;
  for (const job of candidates || []) {
    const owner = randomUUID();
    const { data: claimed, error: claimErr } = await (supabaseAdmin as any)
      .from("automation_inbound_fallback_jobs")
      .update({
        status: "leased", lease_owner: owner,
        lease_until: new Date(Date.now() + 180_000).toISOString(),
        attempts: Number(job.attempts || 0) + 1,
      })
      .eq("id", job.id)
      .or("status.eq.pending,and(status.eq.leased,lease_until.lt." + nowIso + ")")
      .select("id").maybeSingle();
    if (claimErr) throw claimErr;
    if (!claimed) continue;
    try {
      const { data: event, error: eventErr } = await (supabaseAdmin as any)
        .from("automation_events").select("payload")
        .eq("id", job.event_id).eq("company_id", job.company_id).single();
      if (eventErr || !event) throw eventErr || new Error("Evento de ingreso ausente");
      const payload = event.payload || {};
      const { processInboundAutomation } = await import("@/lib/inbound-automation.server");
      await processInboundAutomation(supabaseAdmin, {
        companyId: job.company_id,
        numero: String(payload.phone || ""),
        texto: String(payload.text || ""),
        inboundMessageId: String(payload.messageId || job.event_id),
        stageId: payload.stageId || null,
        responderEmAudio: Boolean(payload.responderEmAudio),
        isAudioMessage: Boolean(payload.isAudioMessage),
        instanceId: payload.instanceId || null,
        channel: payload.channel || null,
      });
      const { data: finished, error: finishErr } = await (supabaseAdmin as any)
        .from("automation_inbound_fallback_jobs")
        .update({ status: "done", lease_owner: null, lease_until: null, last_error: null })
        .eq("id", job.id).eq("lease_owner", owner).select("id").maybeSingle();
      if (finishErr || !finished) throw finishErr || new Error("Lease de fallback perdido");
      processed++;
    } catch (err: any) {
      const exhausted = Number(job.attempts || 0) + 1 >= 3;
      const { error: releaseErr } = await (supabaseAdmin as any)
        .from("automation_inbound_fallback_jobs")
        .update({
          status: exhausted ? "failed" : "pending",
          last_error: String(err?.message || err).slice(0, 500),
          lease_owner: null, lease_until: null,
        })
        .eq("id", job.id).eq("lease_owner", owner);
      if (releaseErr) console.error("[inbound-fallback] No se pudo liberar:", releaseErr.message);
    }
  }
  return processed;
}
