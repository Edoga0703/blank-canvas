import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveCompanyIdCached } from "./company-cache";

export type Humor = "positivo" | "neutro" | "negativo";

/** Analisa o sentimento do cliente na conversa (plugin "Análise de Sentimento"). */
export const analisarSentimento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { numero: string }) => d)
  .handler(async ({ context, data }) => {
    const numero = String(data.numero ?? "").trim();
    if (!numero) throw new Error("Número inválido.");
    const cid = await resolveCompanyIdCached(context.supabase, context.userId);

    const { capacidadeAtiva } = await import("@/lib/plugin-gate.server");
    if (!(await capacidadeAtiva(context.supabase, cid, "ia-sentimento"))) {
      throw new Error("Instale o plugin Análise de Sentimento na Loja de Plugins.");
    }

    const { data: msgs, error } = await context.supabase
      .from("mensagens")
      .select("texto,direcao,autor,created_at")
      .eq("company_id", cid)
      .eq("numero", numero)
      .order("created_at", { ascending: false })
      .limit(80);
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
      .slice(-10000);

    const { lovableAiChat } = await import("./lovable-ai.server");
    const bruto = await lovableAiChat(
      [
        {
          role: "system",
          content:
            "Você avalia o sentimento do CLIENTE em conversas de atendimento. " +
            "Responda SOMENTE um JSON válido, sem texto extra, no formato: " +
            '{"humor":"positivo|neutro|negativo","nota":0-10,"risco":true|false,"motivo":"1 frase em pt-BR","sinais":["até 3 trechos curtos"]}. ' +
            '"risco" = true quando há sinal de insatisfação séria, ameaça de cancelamento ou reclamação grave.',
        },
        { role: "user", content: linhas },
      ],
      "gpt-4o-mini",
    );

    let parsed: any = null;
    try {
      const m = String(bruto).match(/\{[\s\S]*\}/);
      parsed = m ? JSON.parse(m[0]) : null;
    } catch {
      parsed = null;
    }
    if (!parsed) return { ok: false as const, erro: "Não foi possível analisar agora. Tente novamente." };

    const humor: Humor =
      parsed.humor === "positivo" || parsed.humor === "negativo" ? parsed.humor : "neutro";
    const nota = Math.max(0, Math.min(10, Number(parsed.nota) || 5));
    const sinais = Array.isArray(parsed.sinais)
      ? parsed.sinais.slice(0, 3).map((s: any) => String(s))
      : [];

    return {
      ok: true as const,
      humor,
      nota,
      risco: !!parsed.risco,
      motivo: String(parsed.motivo ?? ""),
      sinais,
    };
  });
