import { createFileRoute } from "@tanstack/react-router";

function maxWebhookBytes(): number {
  const parsed = Number(process.env["LOVABLE_WHATSAPP_MAX_WEBHOOK_BYTES"] || 1024 * 1024);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1024 * 1024;
}

export const Route = createFileRoute("/api/public/lovable-whatsapp")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const maxBytes = maxWebhookBytes();
        const declaredLength = Number(request.headers.get("content-length") || 0);
        if (declaredLength > maxBytes) {
          return Response.json({ ok: false, error: "payload_too_large" }, { status: 413 });
        }

        const rawBody = await request.text();
        if (new TextEncoder().encode(rawBody).byteLength > maxBytes) {
          return Response.json({ ok: false, error: "payload_too_large" }, { status: 413 });
        }

        try {
          const { generatedVerifyAndParseWebhook } =
            await import("@/lib/messaging/lovable-whatsapp.generated.server");
          const envelope = await generatedVerifyAndParseWebhook(request, rawBody);
          if (!envelope.externalEventId?.trim()) {
            return Response.json(
              { ok: false, error: "missing_external_event_id" },
              { status: 422 },
            );
          }

          const { ingestMessagingEvent } = await import("@/lib/messaging/ingest.server");
          const result = await ingestMessagingEvent({
            provider: "lovable_whatsapp",
            externalEventId: envelope.externalEventId.trim(),
            externalConnectionId: envelope.externalConnectionId?.trim() || null,
            raw: envelope.raw,
          });
          return Response.json(result, { status: 200 });
        } catch (error) {
          const name = error instanceof Error ? error.name : "Error";
          const message = error instanceof Error ? error.message : String(error);
          if (name === "LovableWhatsAppWebhookAuthError") {
            return Response.json({ ok: false, error: "invalid_signature" }, { status: 401 });
          }
          if (name === "LovableWhatsAppWebhookPayloadError") {
            return Response.json(
              { ok: false, error: "invalid_payload", detail: message },
              { status: 400 },
            );
          }
          if (name === "LovableWhatsAppNotLinkedError") {
            return Response.json({ ok: false, error: "connector_not_linked" }, { status: 503 });
          }
          console.error("[lovable-whatsapp.webhook]", message);
          return Response.json({ ok: false, error: "processing_failed" }, { status: 500 });
        }
      },
    },
  },
});
