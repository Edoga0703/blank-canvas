import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Análise de IA da conversa do lead: pontos fortes, gargalos, causa provável
 * de travamento, melhorias para o atendente e próximo passo.
 * Sob demanda (botão "Analisar conversa" na aba Conversa do detalhe do lead).
 */
export const analyzeLeadConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({
      cardId: z.string(),
      companyId: z.string().uuid(),
      numero: z.string(),
    }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { cardId, companyId, numero } = data;

    const { data: acesso } = await context.supabase
      .rpc("has_company_access", { _company_id: companyId });
    if (!acesso) throw new Error("Acesso negado a esta empresa.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin: any = supabaseAdmin;

    const { data: msgs } = await admin
      .from("mensagens")
      .select("direcao, autor, texto, midia_tipo, created_at")
      .eq("company_id", companyId)
      .eq("numero", numero)
      .order("created_at", { ascending: false })
      .limit(100);

    const historico = (msgs ?? []).slice().reverse();
    if (historico.length === 0) throw new Error("Sem histórico de mensagens para analisar.");

    const transcricao = historico
      .map((m: any) => {
        const quem = m.direcao === "entrada" ? "Cliente" : m.autor === "ia" ? "IA" : "Atendente";
        const hora = new Date(m.created_at).toLocaleString("pt-BR");
        const txt = (m.texto || "").trim() || (m.midia_tipo ? `[${m.midia_tipo}]` : "");
        return txt ? `[${hora}] ${quem}: ${txt}` : "";
      })
      .filter(Boolean)
      .join("\n")
      .slice(-12000);

    if (!transcricao) throw new Error("Sem conteúdo suficiente para analisar.");

    const { data: card } = await admin
      .from("crm_cards")
      .select("nome, status")
      .eq("id", cardId)
      .maybeSingle();

    const { lovableAiChat } = await import("./lovable-ai.server");
    const texto = (
      await lovableAiChat(
        [
          {
            role: "system",
            content:
              "Você é um supervisor de atendimento e vendas. Analise a conversa abaixo e ajude o gestor a entender a qualidade do atendimento. " +
              "Responda no idioma principal da conversa (Español, English ou Português), direto, sem markdown pesado, no formato exato:\n" +
              "PONTOS FORTES: (2 a 4 itens do que o atendente fez bem)\n" +
              "GARGALOS: (pontos de atrito, demora, falta de clareza ou oportunidades perdidas)\n" +
              "CAUSA PROVÁVEL: (por que a conversa parou ou não avançou; se avançou, escreva 'conversa em andamento')\n" +
              "MELHORIAS: (2 a 4 orientações práticas para esse atendente)\n" +
              "PRÓXIMO PASSO: (1 a 2 ações objetivas com o lead)",
          },
          {
            role: "user",
            content: `Lead: ${card?.nome || numero} (${numero}). Etapa atual: ${card?.status || "não informada"}.\n\nConversa:\n${transcricao}`,
          },
        ],
        "google/gemini-2.5-flash",
      )
    ).trim();

    if (!texto) throw new Error("Não foi possível gerar a análise no momento.");

    const nota = `🧠 Análise da conversa (IA)\n\n${texto}`;
    await admin.from("lead_nota").insert({
      company_id: companyId,
      card_id: cardId,
      texto: nota,
    });

    return { analise: texto };
  });
