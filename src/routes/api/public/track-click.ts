import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const CHARS = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

function generateCode(len = 6): string {
  let res = "";
  for (let i = 0; i < len; i++) {
    res += CHARS[Math.floor(Math.random() * CHARS.length)];
  }
  return res;
}

function cors(res: Response) {
  res.headers.set("Access-Control-Allow-Origin", "*");
  res.headers.set("Access-Control-Allow-Headers", "content-type, authorization");
  res.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  return res;
}

const trackSchema = z.object({
  company_id: z.string().uuid(),
  phone: z.string().optional().nullable(),
  text: z.string().optional().nullable(),
  slug: z.string().optional().nullable(),
  fbclid: z.string().optional().nullable(),
  gclid: z.string().optional().nullable(),
  fbc: z.string().optional().nullable(),
  fbp: z.string().optional().nullable(),
  utm_source: z.string().optional().nullable(),
  utm_medium: z.string().optional().nullable(),
  utm_campaign: z.string().optional().nullable(),
  utm_term: z.string().optional().nullable(),
  utm_content: z.string().optional().nullable(),
  referrer: z.string().optional().nullable(),
  first_page: z.string().optional().nullable(),
});

export const Route = createFileRoute("/api/public/track-click")({
  server: {
    handlers: {
      OPTIONS: async () => cors(new Response(null, { status: 204 })),

      // 1. Redirección GET: http://.../api/public/track-click?c=COMPANY_UUID&phone=...&text=...
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const q = url.searchParams;

          const companyId = q.get("c") || q.get("company_id");
          if (!companyId) {
            return cors(new Response("Falta parámetro company_id o c", { status: 400 }));
          }

          const rawPhone = q.get("phone") || q.get("numero") || "";
          const phone = rawPhone.replace(/\D/g, "");
          const baseText = q.get("text") || q.get("texto") || "";

          const ip =
            request.headers.get("cf-connecting-ip") ||
            request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
            null;
          const userAgent = request.headers.get("user-agent") || null;

          const code = generateCode(6);

          await (supabaseAdmin as any).from("lead_click_session").insert({
            company_id: companyId,
            code,
            slug: q.get("slug") || null,
            fbclid: q.get("fbclid") || null,
            gclid: q.get("gclid") || null,
            fbc: q.get("fbc") || null,
            fbp: q.get("fbp") || null,
            utm_source: q.get("utm_source") || null,
            utm_medium: q.get("utm_medium") || null,
            utm_campaign: q.get("utm_campaign") || null,
            utm_term: q.get("utm_term") || null,
            utm_content: q.get("utm_content") || null,
            referrer: q.get("referrer") || request.headers.get("referer") || null,
            first_page: q.get("first_page") || null,
            client_ip: ip,
            client_user_agent: userAgent,
          });

          const refSuffix = `\n\n[Ref: #${code}]`;
          const fullText = (baseText ? `${baseText.trim()}${refSuffix}` : `[Ref: #${code}]`).trim();

          if (phone) {
            const redirectUrl = `https://wa.me/${phone}?text=${encodeURIComponent(fullText)}`;
            return new Response(null, {
              status: 302,
              headers: { Location: redirectUrl },
            });
          }

          return cors(
            Response.json({
              ok: true,
              code,
              ref_text: refSuffix.trim(),
              full_text: fullText,
            }),
          );
        } catch (e: any) {
          console.error("[track-click.GET] Error:", e?.message);
          return cors(Response.json({ ok: false, error: e?.message }, { status: 500 }));
        }
      },

      // 2. Registro POST: usado desde JS / SDK en frontend
      POST: async ({ request }) => {
        try {
          const json = await request.json().catch(() => ({}));
          const data = trackSchema.parse(json);

          const ip =
            request.headers.get("cf-connecting-ip") ||
            request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
            null;
          const userAgent = request.headers.get("user-agent") || null;

          const code = generateCode(6);

          await (supabaseAdmin as any).from("lead_click_session").insert({
            company_id: data.company_id,
            code,
            slug: data.slug || null,
            fbclid: data.fbclid || null,
            gclid: data.gclid || null,
            fbc: data.fbc || null,
            fbp: data.fbp || null,
            utm_source: data.utm_source || null,
            utm_medium: data.utm_medium || null,
            utm_campaign: data.utm_campaign || null,
            utm_term: data.utm_term || null,
            utm_content: data.utm_content || null,
            referrer: data.referrer || request.headers.get("referer") || null,
            first_page: data.first_page || null,
            client_ip: ip,
            client_user_agent: userAgent,
          });

          const refSuffix = `\n\n[Ref: #${code}]`;
          const phone = data.phone ? String(data.phone).replace(/\D/g, "") : null;
          const baseText = (data.text || "").trim();
          const fullText = (baseText ? `${baseText}${refSuffix}` : `[Ref: #${code}]`).trim();
          const waUrl = phone ? `https://wa.me/${phone}?text=${encodeURIComponent(fullText)}` : null;

          return cors(
            Response.json({
              ok: true,
              code,
              ref_text: refSuffix.trim(),
              full_text: fullText,
              wa_url: waUrl,
            }),
          );
        } catch (e: any) {
          console.error("[track-click.POST] Error:", e?.message);
          return cors(Response.json({ ok: false, error: e?.message }, { status: 400 }));
        }
      },
    },
  },
});
