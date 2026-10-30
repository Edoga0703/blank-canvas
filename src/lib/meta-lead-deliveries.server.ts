import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { fetchAndProcessMetaLead } from "@/lib/meta-leads.server";

export async function processMetaLeadDeliveries(limit = 3): Promise<number> {
  const nowIso = new Date().toISOString();
  const { data: rows, error: listErr } = await (supabaseAdmin as any)
    .from("meta_lead_deliveries")
    .select("id,leadgen_id,page_id,form_id,attempts")
    .or("status.eq.pending,and(status.eq.leased,lease_until.lt." + nowIso + ")")
    .order("created_at", { ascending: true }).limit(limit);
  if (listErr) throw listErr;
  let processed = 0;
  for (const row of rows || []) {
    const owner = randomUUID();
    const { data: claimed, error: claimErr } = await (supabaseAdmin as any)
      .from("meta_lead_deliveries")
      .update({
        status: "leased", lease_owner: owner,
        lease_until: new Date(Date.now() + 120_000).toISOString(),
        attempts: Number(row.attempts || 0) + 1,
      })
      .eq("id", row.id)
      .or("status.eq.pending,and(status.eq.leased,lease_until.lt." + nowIso + ")")
      .select("id").maybeSingle();
    if (claimErr) throw claimErr;
    if (!claimed) continue;
    try {
      const result = await fetchAndProcessMetaLead(
        supabaseAdmin, row.page_id, row.leadgen_id, row.form_id || undefined);
      if (!result?.ok) throw new Error(result?.reason || "Lead Meta no procesado");
      const { data: card, error: cardErr } = await (supabaseAdmin as any)
        .from("crm_cards").select("company_id").eq("id", result.cardId).single();
      if (cardErr || !card) throw cardErr || new Error("Card Meta no encontrado");
      const { data: done, error: doneErr } = await (supabaseAdmin as any)
        .from("meta_lead_deliveries")
        .update({
          status: "processed", company_id: card.company_id, card_id: result.cardId,
          lease_owner: null, lease_until: null,
          processed_at: new Date().toISOString(), last_error: null,
        })
        .eq("id", row.id).eq("lease_owner", owner).select("id").maybeSingle();
      if (doneErr || !done) throw doneErr || new Error("Lease Meta Lead perdido");
      processed++;
    } catch (error: any) {
      const exhausted = Number(row.attempts || 0) + 1 >= 5;
      const { error: releaseErr } = await (supabaseAdmin as any)
        .from("meta_lead_deliveries")
        .update({
          status: exhausted ? "failed" : "pending",
          lease_owner: null, lease_until: null,
          last_error: String(error?.message || error).slice(0, 500),
        })
        .eq("id", row.id).eq("lease_owner", owner);
      if (releaseErr) console.error("[meta-lead-deliveries] release:", releaseErr.message);
    }
  }
  return processed;
}
