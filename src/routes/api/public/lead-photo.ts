import { createFileRoute } from "@tanstack/react-router";

const BUCKET = "lead-avatars";

export const Route = createFileRoute("/api/public/lead-photo")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const company = url.searchParams.get("c") || "";
        const numero = (url.searchParams.get("n") || "").replace(/\D/g, "");
        const sig = url.searchParams.get("s") || "";
        if (!/^[0-9a-f-]{36}$/i.test(company) || !numero) {
          return new Response("bad request", { status: 400 });
        }
        const { leadPhotoSignature } = await import("@/lib/lead-photo.server");
        const expected = leadPhotoSignature(company, numero);
        if (sig.length !== expected.length || sig !== expected) {
          return new Response("forbidden", { status: 403 });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await (supabaseAdmin as any).storage
          .from(BUCKET)
          .download(`${company}/${numero}.jpg`);
        if (error || !data) return new Response("not found", { status: 404 });
        return new Response(await data.arrayBuffer(), {
          headers: {
            "content-type": "image/jpeg",
            "cache-control": "public, max-age=86400",
          },
        });
      },
    },
  },
});
