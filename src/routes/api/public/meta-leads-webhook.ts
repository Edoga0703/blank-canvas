import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "node:crypto";

function validSignature(raw: string, header: string, secret: string) {
  const receivedHex = header.trim().replace(/^sha256=/i, "");
  const expectedHex = createHmac("sha256", secret).update(raw).digest("hex");
  const received = Buffer.from(receivedHex, "utf8");
  const expected = Buffer.from(expectedHex, "utf8");
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export const Route = createFileRoute("/api/public/meta-leads-webhook")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const { getMetaWebhookVerifyToken } = await import("@/lib/meta-config.server");
        const expected = await getMetaWebhookVerifyToken();
        if (url.searchParams.get("hub.mode") === "subscribe" && expected && url.searchParams.get("hub.verify_token") === expected) {
          return new Response(url.searchParams.get("hub.challenge") ?? "", { status: 200, headers: { "Content-Type": "text/plain" } });
        }
        return new Response("Forbidden", { status: 403 });
      },

      POST: async ({ request }) => {
        const rawBody = await request.text();
        const { getMetaAppSecrets } = await import("@/lib/meta-config.server");
        const appSecret = (await getMetaAppSecrets())[0]?.trim();
        const signature = request.headers.get("x-hub-signature-256") ?? "";
        if (process.env["META_ALLOW_UNSIGNED_WEBHOOKS"] !== "true" && (!appSecret || !validSignature(rawBody, signature, appSecret))) {
          return new Response("Invalid signature", { status: 401 });
        }

        let payload: any;
        try { payload = JSON.parse(rawBody); } catch { return new Response("Invalid JSON", { status: 400 }); }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { fetchAndProcessMetaLead } = await import("@/lib/meta-leads.server");
        const processed: string[] = [];

        for (const entry of payload?.entry ?? []) {
          for (const change of entry?.changes ?? []) {
            if (change?.field !== "leadgen") continue;
            const leadId = String(change?.value?.leadgen_id ?? "");
            const pageId = String(change?.value?.page_id ?? entry?.id ?? "");
            const formId = change?.value?.form_id ? String(change.value.form_id) : undefined;
            if (!leadId || !pageId) continue;
            const externalEventId = `meta-lead:${leadId}`;
            const { data: prior } = await (supabaseAdmin as any).from("messaging_inbox_events").select("id,status").eq("external_event_id", externalEventId).maybeSingle();
            if (prior?.status === "processed") continue;
            if (prior?.id) await (supabaseAdmin as any).from("messaging_inbox_events").update({ status: "processing", raw_payload: change, processed_at: null }).eq("id", prior.id);
            else await (supabaseAdmin as any).from("messaging_inbox_events").insert({ external_event_id: externalEventId, provider: "meta_leadgen", raw_payload: change, status: "processing" });
            try {
              const result = await fetchAndProcessMetaLead(supabaseAdmin, pageId, leadId, formId);
              processed.push(leadId);
              await (supabaseAdmin as any).from("messaging_inbox_events").update({ status: "processed", normalized_count: result?.ok ? 1 : 0, processed_at: new Date().toISOString(), error_message: result?.ok ? null : result?.reason }).eq("external_event_id", externalEventId);
            } catch (error) {
              await (supabaseAdmin as any).from("messaging_inbox_events").update({ status: "failed", error_message: error instanceof Error ? error.message : String(error) }).eq("external_event_id", externalEventId);
              console.error("[meta-leads-webhook]", error);
            }
          }
        }
        return Response.json({ ok: true, processed });
      },
    },
  },
});
