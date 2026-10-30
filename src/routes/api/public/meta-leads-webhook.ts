import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Webhook para Meta Lead Ads (Formulários do Facebook/Instagram).
 * 
 * 1. GET: Validação do webhook pela Meta (hub.verify_token).
 * 2. POST: Recebe o ID do lead, busca os dados na Graph API e salva no CRM.
 */
export const Route = createFileRoute("/api/public/meta-leads-webhook")({
  server: {
    handlers: {
      // Verificação do webhook na Meta
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const mode = url.searchParams.get("hub.mode");
        const token = url.searchParams.get("hub.verify_token");
        const challenge = url.searchParams.get("hub.challenge") ?? "";
        
        // O token deve ser configurado no painel da Meta e no CRM (ou ser um padrão seguro)
        const expected = (process.env["META_WEBHOOK_VERIFY_TOKEN"] || "").trim();
        if (!expected) {
          return new Response("META_WEBHOOK_VERIFY_TOKEN not configured", { status: 503 });
        }

        if (mode === "subscribe" && token === expected) {
          return new Response(challenge, {
            status: 200,
            headers: { "Content-Type": "text/plain" },
          });
        }
        return new Response("Forbidden", { status: 403 });
      },

      POST: async ({ request }) => {
        const rawBody = await request.text();
        const signature = request.headers.get("x-hub-signature-256") || "";
        const appSecret = process.env["META_APP_SECRET"];

        // 1. Validar assinatura (se o secret estiver configurado)
        const allowUnsigned = process.env["META_ALLOW_UNSIGNED_WEBHOOKS"] === "true";
        if (!appSecret) {
          if (!allowUnsigned) {
            return new Response("Webhook secret not configured", { status: 503 });
          }
        } else {
          if (!signature.startsWith("sha256=")) {
            return new Response("Invalid signature", { status: 401 });
          }
          const hex = signature.slice("sha256=".length).trim();
          if (!/^[a-f0-9]{64}$/i.test(hex)) {
            return new Response("Invalid signature", { status: 401 });
          }
          const receivedBuf = Buffer.from(hex, "hex");
          const expectedBuf = createHmac("sha256", appSecret).update(rawBody).digest();
          if (receivedBuf.length !== expectedBuf.length || !timingSafeEqual(receivedBuf, expectedBuf)) {
            return new Response("Invalid signature", { status: 401 });
          }
        }

        let payload: any;
        try {
          payload = JSON.parse(rawBody);
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }

        // Persistir cada entrega antes de confirmar a Meta. O cron recupera falhas.
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        let enqueued = 0;
        for (const entry of payload.entry || []) {
          for (const change of entry.changes || []) {
            if (change.field !== "leadgen") continue;
            const leadId = String(change.value?.leadgen_id || "").trim();
            const pageId = String(change.value?.page_id || entry.id || "").trim();
            const formId = String(change.value?.form_id || "").trim() || null;
            if (!leadId || !pageId) continue;
            const { error } = await (supabaseAdmin as any)
              .from("meta_lead_deliveries")
              .insert({ leadgen_id: leadId, page_id: pageId, form_id: formId, status: "pending" });
            if (error && error.code !== "23505") {
              console.error("[meta-leads-webhook] No se pudo persistir entrega:", error.message);
              return new Response("Delivery persistence failed", { status: 500 });
            }
            if (!error) enqueued++;
          }
        }
        if (enqueued > 0) {
          const { processMetaLeadDeliveries } = await import("@/lib/meta-lead-deliveries.server");
          void processMetaLeadDeliveries(1).catch((error) =>
            console.error("[meta-leads-webhook] Procesamiento inmediato:", error?.message));
        }

        return new Response("EVENT_RECEIVED", { status: 200 });
      }
    }
  }
});


