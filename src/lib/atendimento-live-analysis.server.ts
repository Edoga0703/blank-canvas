type AnalysisCard = { numero: string; nome?: string | null; ultima_em: string };

export async function analyzeOperationalCards(supabase: any, companyId: string, cards: AnalysisCard[]) {
  const { lovableAiChat } = await import("./lovable-ai.server");
  let analisados = 0;
  let falhas = 0;

  for (const card of cards) {
    try {
      const { data: mensagens } = await supabase.from("mensagens")
        .select("texto,direcao,autor,created_at")
        .eq("company_id", companyId)
        .eq("numero", card.numero)
        .order("created_at", { ascending: false })
        .limit(40);
      if (!mensagens?.length) continue;
      const historico = mensagens.slice().reverse().map((m: any) =>
        `${m.direcao === "entrada" ? "Cliente" : m.autor === "ia" ? "IA" : "Atendente"}: ${String(m.texto ?? "[mídia]").trim()}`,
      ).join("\n").slice(-8000);
      const resposta = await lovableAiChat([
        { role: "system", content: "Você monitora atendimentos em tempo real. Não invente fatos. Responda só JSON válido: {\"solicitacao\":\"o que o cliente pediu\",\"andamento\":\"o que já foi feito ou o que falta\",\"situacao\":\"resolvido\"|\"pendente\"}." },
        { role: "user", content: historico },
      ], "openai/gpt-6-astra");
      const parsed = JSON.parse(resposta.replace(/^```json\s*|\s*```$/g, "").trim());
      const { error } = await supabase.from("atendimento_live_analise").upsert({
        company_id: companyId,
        numero: card.numero,
        contato_nome: card.nome ?? null,
        solicitacao: String(parsed.solicitacao ?? "").slice(0, 2000),
        andamento: String(parsed.andamento ?? "").slice(0, 2000),
        situacao: parsed.situacao === "resolvido" ? "resolvido" : "em_andamento",
        ultima_em_analisada: card.ultima_em,
        analisado_em: new Date().toISOString(),
      }, { onConflict: "company_id,numero" });
      if (error) throw error;
      analisados += 1;
    } catch (error) {
      falhas += 1;
      console.error("[relatorio-ia] Falha ao analisar conversa", card.numero, error);
    }
  }
  return { analisados, falhas };
}