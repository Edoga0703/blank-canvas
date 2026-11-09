// Health check público da IA: valida se o gateway responde em produção.
// Não expõe segredos — retorna apenas status e latência.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/ai-health")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const key = process.env.LOVABLE_API_KEY;
        if (!key) {
          return Response.json({ ok: false, motivo: "LOVABLE_API_KEY ausente" }, { status: 200 });
        }
        const url = new URL(request.url);
        const action = url.searchParams.get("action");
        if (action === "models") {
          try {
            const mRes = await fetch("https://ai.gateway.lovable.dev/v1/models", {
              headers: {
                "Authorization": `Bearer ${key}`,
                "Lovable-API-Key": key,
              },
            });
            const mData = await mRes.json().catch(() => null);
            return Response.json({ ok: mRes.ok, models: mData });
          } catch (e: any) {
            return Response.json({ ok: false, error: e.message });
          }
        }
        const model = url.searchParams.get("model") || "google/gemini-2.5-flash";
        const t0 = Date.now();

        const isAnthropic = model.startsWith("anthropic/");
        const endpoint = isAnthropic
          ? "https://ai.gateway.lovable.dev/v1/messages"
          : "https://ai.gateway.lovable.dev/v1/chat/completions";

        const headers: Record<string, string> = {
          "Authorization": `Bearer ${key}`,
          "Lovable-API-Key": key,
          "Content-Type": "application/json",
          "X-Lovable-AIG-SDK": "fetch",
        };
        if (isAnthropic) {
          headers["anthropic-version"] = "2023-06-01";
        }

        const payload = isAnthropic
          ? {
              model,
              max_tokens: 1024,
              messages: [{ role: "user", content: "ping" }],
            }
          : {
              model,
              messages: [{ role: "user", content: "ping" }],
            };

        try {
          const res = await fetch(endpoint, {
            method: "POST",
            headers,
            body: JSON.stringify(payload),
          });
          const body = await res.text();
          let parsed: any = null;
          try { parsed = JSON.parse(body); } catch {}
          const reply = isAnthropic
            ? parsed?.content?.[0]?.text || null
            : parsed?.choices?.[0]?.message?.content || null;

          return Response.json({
            ok: res.ok,
            status: res.status,
            model,
            ms: Date.now() - t0,
            reply,
            detalhe: res.ok ? undefined : body.slice(0, 300),
          });
        } catch (e: any) {
          return Response.json({ ok: false, ms: Date.now() - t0, erro: String(e?.message).slice(0, 200) });
        }
      },
    },
  },
});
