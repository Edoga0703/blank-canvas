import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual, createHash } from "node:crypto";
import { normalizeBrPhone } from "@/lib/br-phone";

function cors(res: Response) {
  res.headers.set("Access-Control-Allow-Origin", "*");
  res.headers.set("Access-Control-Allow-Headers", "content-type, x-webhook-secret, webhook-secret, x-secret, authorization");
  res.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  return res;
}

export const Route = createFileRoute("/api/public/automations/webhook/$token")({
  server: {
    handlers: {
      OPTIONS: async () => cors(new Response(null, { status: 204 })),
      POST: async ({ request, params }) => {
        try {
          const token = String(params.token ?? "").trim();
          if (!token || !token.startsWith("whk_")) {
            return cors(new Response("Invalid token", { status: 404 }));
          }

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: endpoint, error: epErr } = await (supabaseAdmin as any)
            .from("automation_webhook_endpoints")
            .select("id, company_id, workflow_id, node_id, token, secret_hash, active")
            .eq("token", token)
            .eq("active", true)
            .maybeSingle();

          if (epErr || !endpoint) {
            return cors(new Response("Webhook endpoint not found or inactive", { status: 404 }));
          }

          // Validar secret si está configurado
          if (endpoint.secret_hash) {
            const incomingSecret =
              request.headers.get("x-webhook-secret") ||
              request.headers.get("webhook-secret") ||
              request.headers.get("x-secret") ||
              "";

            const incomingHash = createHash("sha256").update(incomingSecret.trim()).digest("hex");
            const bufA = Buffer.from(incomingHash, "utf8");
            const bufB = Buffer.from(endpoint.secret_hash, "utf8");

            if (bufA.length !== bufB.length || !timingSafeEqual(bufA, bufB)) {
              return cors(new Response("Unauthorized: invalid secret", { status: 401 }));
            }
          }

          // Actualizar last_called_at sin bloquear
          try {
            await (supabaseAdmin as any)
              .from("automation_webhook_endpoints")
              .update({ last_called_at: new Date().toISOString() })
              .eq("id", endpoint.id);
          } catch {}

          // Parsear payload
          let body: any = {};
          try {
            const rawText = await request.text();
            if (rawText) {
              body = JSON.parse(rawText);
            }
          } catch {
            body = {};
          }

          // Extraer query params
          const urlObj = new URL(request.url);
          const query: Record<string, string> = {};
          urlObj.searchParams.forEach((v, k) => {
            query[k] = v;
          });

          // Extraer phone, name, email
          const rawPhone = String(
            body.phone || body.telefone || body.numero || body.whatsapp || query.phone || ""
          );
          const phone = normalizeBrPhone(rawPhone) || rawPhone.replace(/\D/g, "");
          const name = String(body.name || body.nome || query.name || "").trim() || null;
          const email = String(body.email || query.email || "").trim() || null;

          // Localizar o asociar card en crm_cards si hay teléfono
          let cardId: string | null = null;
          if (phone) {
            try {
              const { data: card } = await (supabaseAdmin as any)
                .from("crm_cards")
                .select("id")
                .eq("company_id", endpoint.company_id)
                .eq("numero", phone)
                .order("updated_at", { ascending: false })
                .limit(1)
                .maybeSingle();

              if (card) {
                cardId = card.id;
              }
            } catch {}
          }

          const { dispatchDomainEvent, drainImmediateAutomationJobs } = await import(
            "@/lib/automations/events.server"
          );

          const triggered = await dispatchDomainEvent({
            name: "webhook.inbound_received.v1",
            companyId: endpoint.company_id,
            entity: { type: "webhook_endpoint", id: endpoint.id },
            source: "inbound_webhook",
            payload: {
              webhookToken: token,
              nodeId: endpoint.node_id,
              workflowId: endpoint.workflow_id,
              body,
              query,
              phone,
              name,
              email,
              cardId,
            },
          });

          try {
            await drainImmediateAutomationJobs({
              workerId: "hot_whk",
              maxJobs: 8,
              maxTimeMs: 3000,
            });
          } catch (drainErr) {
            console.warn("[webhook.inbound] Drain error:", drainErr);
          }

          return cors(
            Response.json({
              ok: true,
              triggered,
            })
          );
        } catch (err: any) {
          console.error("[api/public/automations/webhook] Error:", err);
          return cors(new Response(err?.message || "Internal error", { status: 500 }));
        }
      },
    },
  },
});
