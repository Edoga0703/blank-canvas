// Health check público da IA: valida se o gateway responde em produção.
// Não expõe segredos — retorna apenas status e latência.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/ai-health")({
  server: {
    handlers: {
      GET: async () => {
        const key = process.env.LOVABLE_API_KEY;
        if (!key) {
          return Response.json({ ok: false, motivo: "LOVABLE_API_KEY ausente" }, { status: 200 });
        }
        const t0 = Date.now();
        try {
          const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: {
              "Lovable-API-Key": key,
              "Content-Type": "application/json",
              "X-Lovable-AIG-SDK": "fetch",
            },
            body: JSON.stringify({
              model: "google/gemini-2.5-flash-lite",
              messages: [{ role: "user", content: "ping" }],
            }),
          });
          const body = await res.text();
          return Response.json({
            ok: res.ok,
            status: res.status,
            ms: Date.now() - t0,
            detalhe: res.ok ? undefined : body.slice(0, 300),
          });
        } catch (e: any) {
          return Response.json({ ok: false, ms: Date.now() - t0, erro: String(e?.message).slice(0, 200) });
        }
      },
    },
  },
});
