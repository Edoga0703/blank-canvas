// Resumo automático de transferência: quando a IA passa o lead para um humano,
// gera um resumo da conversa + próximos passos e salva como nota interna do lead.

type Admin = any;

export async function gerarResumoHandoff(
  admin: Admin,
  params: {
    companyId: string;
    numero: string;
    historico: Array<{ direcao: string; autor?: string | null; texto?: string | null }>;
    motivo?: string;
  },
): Promise<string | null> {
  try {
    const { companyId, numero, historico } = params;

    const { data: card } = await admin
      .from("crm_cards")
      .select("id, nome")
      .eq("company_id", companyId)
      .eq("numero", numero)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!card?.id) return null;

    // evita duplicar resumo se já houve um nos últimos 10 minutos
    const { data: recente } = await admin
      .from("lead_nota")
      .select("id, created_at, texto")
      .eq("card_id", card.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (
      recente?.texto?.startsWith("🤖 Resumo da IA") &&
      Date.now() - new Date(recente.created_at).getTime() < 10 * 60_000
    ) {
      return null;
    }

    const transcricao = (historico || [])
      .slice(-30)
      .map((m) => `${m.direcao === "entrada" ? "Cliente" : m.autor === "ia" ? "IA" : "Atendente"}: ${m.texto ?? ""}`)
      .filter((l) => l.trim().length > 12)
      .join("\n");
    if (!transcricao) return null;

    const { lovableAiChat } = await import("./lovable-ai.server");
    const texto = (
      await lovableAiChat(
        [
          {
            role: "system",
            content:
              "Você é um assistente de vendas. Resuma a conversa para o atendente humano que vai assumir. " +
              "Responda no idioma de atendimento da conversa (Español, English ou Português), sem markdown pesado, no formato exato:\n" +
              "RESUMO: (2 a 4 linhas do que o cliente quer e do que já foi dito)\n" +
              "DADOS: (dados coletados: nome, produto/serviço, valores, prazos — ou 'não informado')\n" +
              "OBJEÇÕES: (dúvidas ou travas do cliente, ou 'nenhuma')\n" +
              "PRÓXIMOS PASSOS: (2 a 3 ações objetivas para avançar e fechar a venda)",
          },
          {
            role: "user",
            content: `Contato: ${card.nome || numero} (${numero}).\nMotivo da transferência: ${params.motivo || "transferência para atendimento humano"}.\n\nConversa:\n${transcricao}`,
          },
        ],
        "google/gemini-2.5-flash",
      )
    ).trim();
    if (!texto) return null;

    const nota = `🤖 Resumo da IA (transferência)\n\n${texto}`;
    await admin.from("lead_nota").insert({
      company_id: companyId,
      card_id: card.id,
      texto: nota,
    });

    try {
      await admin.from("notificacao").insert({
        company_id: companyId,
        tipo: "lead_novo",
        titulo: `Lead transferido: ${card.nome || numero}`,
        descricao: "A IA transferiu o atendimento e deixou um resumo com próximos passos.",
        link: `/app/crm?card=${card.id}`,
      });
    } catch {
      // notificação é opcional
    }

    return nota;
  } catch (e: any) {
    console.warn("[handoff-summary]", e?.message);
    return null;
  }
}
