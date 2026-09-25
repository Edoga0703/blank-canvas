import { createFileRoute } from "@tanstack/react-router";

type Provider = "kiwify" | "cakto" | "perfectpay" | "abacatepay";

function tokenEnv(provider: Provider): string {
  return provider === "kiwify"
    ? "KIWIFY_WEBHOOK_TOKEN"
    : provider === "cakto"
    ? "CAKTO_WEBHOOK_TOKEN"
    : provider === "abacatepay"
    ? "ABACATEPAY_WEBHOOK_TOKEN"
    : "PERFECTPAY_WEBHOOK_TOKEN";
}

export const Route = createFileRoute("/api/public/billing/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url);
        const provider = (url.searchParams.get("provider") || "") as Provider;
        const token = url.searchParams.get("token") ||
          url.searchParams.get("webhookSecret") ||
          request.headers.get("x-webhook-token") ||
          "";

        if (!["kiwify", "cakto", "perfectpay", "abacatepay"].includes(provider)) {
          return new Response("provider inválido", { status: 400 });
        }
        const expected = process.env[tokenEnv(provider)];
        if (!expected || token !== expected) {
          return new Response("token inválido", { status: 401 });
        }

        let body: any = {};
        try {
          body = await request.json();
        } catch {
          try {
            const form = await request.formData();
            body = Object.fromEntries(form.entries());
          } catch {
            body = {};
          }
        }

        try {
          const { normalize, applyBillingEvent } = await import("@/lib/billing/apply.server");
          const evt = normalize(provider, body);

          // Cobrança gerada pelo nosso próprio checkout: concilia pelo id interno.
          if (provider === "abacatepay") {
            const { resolveInternalCharge } = await import("@/lib/billing/charges.server");
            const handled = await resolveInternalCharge(body, evt);
            if (handled) return Response.json({ ok: true, charge: handled });
          }

          await applyBillingEvent(evt);
          return Response.json({ ok: true });
        } catch (e: any) {
          console.error("[billing.webhook]", provider, e);
          try {
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            await supabaseAdmin.from("billing_event_log").insert({
              provider,
              event_type: "error",
              payload: body,
              error: String(e?.message || e),
            });
          } catch {}
          return Response.json({ ok: false, error: String(e?.message || e) }, { status: 200 });
        }
      },
    },
  },
});
