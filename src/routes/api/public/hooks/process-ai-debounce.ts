import { createFileRoute } from "@tanstack/react-router";
import { assertCronRequest } from "@/lib/cron-auth.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const Route = createFileRoute("/api/public/hooks/process-ai-debounce")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = assertCronRequest(request);
        if (denied) return denied;

        const nowIso = new Date().toISOString();
        try {
          await (supabaseAdmin as any)
            .from("master_settings")
            .upsert(
              {
                key: "ai_debounce_dispatcher_heartbeat",
                value: { last_seen_at: nowIso },
                updated_at: nowIso,
              },
              { onConflict: "key" },
            );
        } catch (hbErr: any) {
          console.warn("[process-ai-debounce] heartbeat error:", hbErr?.message);
        }

        try {
          const { data: candidates, error: listErr } = await (supabaseAdmin as any)
            .from("ai_message_processing")
            .select(
              "id,company_id,inbound_message_id,numero,instance_id,channel,provider,external_conversation_id,responder_em_audio,incoming_text,created_at,debounce_until",
            )
            .eq("status", "debouncing")
            .lte("debounce_until", nowIso)
            .order("debounce_until", { ascending: true })
            .limit(10);

          if (listErr) throw listErr;

          let claimedCount = 0;
          let executedCount = 0;
          let skippedCount = 0;

          const { processAiResponse } = await import("@/lib/ai-engine.server");

          for (const row of candidates || []) {
            const claimIso = new Date().toISOString();
            const leaseIso = new Date(Date.now() + 90_000).toISOString();
            const { data: claimed, error: claimErr } = await (supabaseAdmin as any)
              .from("ai_message_processing")
              .update({
                status: "processing",
                lease_until: leaseIso,
                updated_at: claimIso,
              })
              .eq("id", row.id)
              .eq("status", "debouncing")
              .select("id")
              .maybeSingle();

            if (claimErr) {
              console.warn("[process-ai-debounce] claim error:", claimErr.message);
              continue;
            }
            if (!claimed) continue;
            claimedCount += 1;

            try {
              let latestQuery = (supabaseAdmin as any)
                .from("ai_message_processing")
                .select("id, created_at")
                .eq("company_id", row.company_id)
                .eq("numero", row.numero);

              if (row.instance_id) {
                latestQuery = latestQuery.eq("instance_id", row.instance_id);
              } else {
                latestQuery = latestQuery.is("instance_id", null);
              }

              const { data: latestRow } = await latestQuery
                .order("created_at", { ascending: false })
                .limit(1)
                .maybeSingle();

              const isSuperseded = Boolean(
                latestRow &&
                  latestRow.id !== row.id &&
                  new Date(latestRow.created_at).getTime() >= new Date(row.created_at).getTime(),
              );

              if (isSuperseded) {
                await (supabaseAdmin as any)
                  .from("ai_message_processing")
                  .update({
                    status: "skipped",
                    error_message: "superseded_by_newer_message",
                    lease_until: null,
                    updated_at: new Date().toISOString(),
                  })
                  .eq("id", row.id);
                skippedCount += 1;
                continue;
              }

              await processAiResponse(
                row.company_id,
                row.numero,
                row.incoming_text || "",
                row.inbound_message_id,
                {
                  responderEmAudio: Boolean(row.responder_em_audio),
                  channel: row.channel ?? null,
                  provider: row.provider ?? null,
                  instanceId: row.instance_id ?? null,
                  externalConversationId: row.external_conversation_id ?? row.numero,
                  skipDebounce: true,
                  existingProcessingId: row.id,
                },
              );
              executedCount += 1;
            } catch (procErr: any) {
              console.error("[process-ai-debounce] process error:", procErr?.message);
              try {
                await (supabaseAdmin as any)
                  .from("ai_message_processing")
                  .update({
                    status: "failed",
                    error_message: String(procErr?.message || procErr).slice(0, 500),
                    lease_until: null,
                    updated_at: new Date().toISOString(),
                  })
                  .eq("id", row.id);
              } catch {}
            }
          }

          return Response.json({
            ok: true,
            claimed: claimedCount,
            executed: executedCount,
            skipped: skippedCount,
          });
        } catch (error: any) {
          console.error("[process-ai-debounce]", error?.message);
          return Response.json({ ok: false, error: error?.message }, { status: 500 });
        }
      },
    },
  },
});
