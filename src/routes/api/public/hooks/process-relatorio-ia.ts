import { createFileRoute } from "@tanstack/react-router";
import { assertCronRequest } from "@/lib/cron-auth.server";

export const Route = createFileRoute("/api/public/hooks/process-relatorio-ia")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = assertCronRequest(request);
        if (denied) return denied;
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { analyzeOperationalCards } = await import("@/lib/atendimento-live-analysis.server");
          const { data: companies } = await supabaseAdmin.from("company").select("id").eq("atendimento_operacional", true);
          const now = new Date();
          const fortalezaDay = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Fortaleza", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
          const inicio = new Date(`${fortalezaDay}T03:00:00.000Z`);
          const fim = new Date(inicio.getTime() + 24 * 60 * 60_000);
          let analisados = 0;
          let falhas = 0;
          for (const company of companies ?? []) {
            const { data: cards } = await supabaseAdmin.from("crm_cards")
              .select("numero,nome,ultima_em")
              .eq("company_id", company.id)
              .gte("ultima_em", inicio.toISOString())
              .lt("ultima_em", fim.toISOString())
              .order("ultima_em", { ascending: false })
              .limit(1000);
            const result = await analyzeOperationalCards(supabaseAdmin, company.id, cards ?? []);
            analisados += result.analisados;
            falhas += result.falhas;
          }
          return Response.json({ ok: true, analisados, falhas });
        } catch (error: any) {
          console.error("[process-relatorio-ia]", error?.message);
          return Response.json({ ok: false, error: "Falha ao atualizar relatórios." }, { status: 500 });
        }
      },
      GET: async () => Response.json({ ok: true, hint: "POST para executar" }),
    },
  },
});