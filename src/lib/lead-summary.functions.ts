import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const requestLeadSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({
    cardId: z.string(),
    companyId: z.string().uuid(),
    numero: z.string(),
  }).parse(data))
  .handler(async ({ data, context }) => {
    const { companyId, numero } = data;

    // Garante que o usuário logado realmente pertence à empresa (RLS do usuário)
    const { data: acesso } = await context.supabase
      .rpc("has_company_access", { _company_id: companyId });
    if (!acesso) throw new Error("Acesso negado a esta empresa.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { gerarResumoHandoff } = await import("./handoff-summary.server");

    // Busca histórico de mensagens
    const { data: msgs } = await supabaseAdmin
      .from("mensagens")
      .select("direcao, autor, texto")
      .eq("company_id", companyId)
      .eq("numero", numero)
      .order("created_at", { ascending: false })
      .limit(50);

    if (!msgs || msgs.length === 0) {
      throw new Error("Sem histórico de mensagens para resumir.");
    }

    const resumo = await gerarResumoHandoff(supabaseAdmin, {
      companyId,
      numero,
      historico: msgs.reverse(),
      motivo: "solicitação manual de resumo pelo atendente",
    });

    if (!resumo) {
      throw new Error("Não foi possível gerar o resumo no momento.");
    }

    return { resumo };
  });
