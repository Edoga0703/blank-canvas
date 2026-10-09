import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveCompanyIdCached } from "./company-cache";

/** Resume a conversa de um contato com IA (plugin "Resumo Automático"). */
export const resumirConversa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { numero: string }) => d)
  .handler(async ({ context, data }) => {
    const numero = String(data.numero ?? "").trim();
    if (!numero) throw new Error("Número inválido.");
    const cid = await resolveCompanyIdCached(context.supabase, context.userId);

    const { capacidadeAtiva } = await import("@/lib/plugin-gate.server");
    if (!(await capacidadeAtiva(context.supabase, cid, "ia-resumo"))) {
      throw new Error("Instale o plugin Resumo Automático na Loja de Plugins.");
    }

    const { data: msgs, error } = await context.supabase
      .from("mensagens")
      .select("texto,direcao,autor,created_at")
      .eq("company_id", cid)
      .eq("numero", numero)
      .order("created_at", { ascending: false })
      .limit(120);
    if (error) throw error;
    if (!msgs?.length) return { ok: false as const, erro: "Esta conversa ainda não tem mensagens." };

    const linhas = msgs
      .slice()
      .reverse()
      .map((m: any) => {
        const quem = m.direcao === "saida" ? (m.autor === "ia" ? "IA" : "Atendente") : "Cliente";
        const texto = String(m.texto ?? "").trim() || "[mídia/arquivo]";
        return `${quem}: ${texto}`;
      })
      .join("\n")
      .slice(-12000);

    const { lovableAiChat } = await import("./lovable-ai.server");
    const resumo = await lovableAiChat(
      [
        {
          role: "system",
          content:
            "Você resume conversas de atendimento ao cliente para a equipe. " +
            "Responda em português (pt-BR), objetivo, neste formato:\n" +
            "**Resumo:** 2-3 frases do que o cliente quer e o que aconteceu.\n" +
            "**Pendências:** o que falta resolver (ou 'nenhuma').\n" +
            "**Próximo passo sugerido:** 1 ação concreta para o atendente.",
        },
        { role: "user", content: linhas },
      ],
      "openai/gpt-6-astra",
    );

    return { ok: true as const, resumo };
  });
