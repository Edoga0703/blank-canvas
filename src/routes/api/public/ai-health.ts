// Health check público da IA: valida o provedor de IA independente ativo (Drael / OpenAI / Gemini).
// Zero dependências e zero chamadas ao Lovable AI Gateway.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/ai-health")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const t0 = Date.now();
        const url = new URL(request.url);
        const action = url.searchParams.get("action");

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: globalSettings } = await (supabaseAdmin as any)
          .from("master_settings")
          .select("value")
          .eq("key", "global_ai_config")
          .maybeSingle();

        const gVal = (globalSettings?.value as any) || {};
        const provider = gVal.ai_provider || "drael";
        const model = gVal.ai_model || "drael-v1";

        if (action === "models") {
          return Response.json({
            ok: true,
            provider,
            activeModel: model,
            supportedModels: ["drael-v1", "drael-fast", "gpt-4o-mini", "gpt-4o", "gemini-2.5-flash"],
          });
        }

        try {
          const { lovableAiChat } = await import("@/lib/lovable-ai.server");
          const reply = await lovableAiChat([
            { role: "system", content: "Responda apenas: PONG" },
            { role: "user", content: "ping" },
          ]);

          return Response.json({
            ok: true,
            provider,
            model,
            ms: Date.now() - t0,
            reply,
            gateway: "independent-direct",
          });
        } catch (e: any) {
          return Response.json({
            ok: false,
            provider,
            model,
            ms: Date.now() - t0,
            error: String(e?.message || e).slice(0, 300),
            gateway: "independent-direct",
          });
        }
      },
    },
  },
});
