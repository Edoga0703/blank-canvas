import { getActiveInstance, waSendText } from "./wa-dispatch.server";

type Admin = any;

const PALAVRAS: Array<{ re: RegExp; score: number }> = [
  { re: /muito\s+insatisfeit/i, score: 1 },
  { re: /muito\s+satisfeit/i, score: 5 },
  { re: /insatisfeit/i, score: 2 },
  { re: /regular|neutro|m[eé]dio/i, score: 3 },
  { re: /satisfeit[oa]/i, score: 4 },
  { re: /[oó]tim|excelent|perfeit/i, score: 5 },
  { re: /p[eé]ssim|horr[ií]vel|ruim/i, score: 1 },
  { re: /bom|boa/i, score: 4 },
];

/** Interpreta a resposta do cliente: número, estrelas ou palavras. */
export function parseCsatScore(texto: string): number | null {
  const t = String(texto ?? "").trim();
  if (!t) return null;

  const estrelas = (t.match(/⭐|★|🌟/g) ?? []).length;
  const soNumero = t.replace(/[^0-9]/g, "");
  if (soNumero.length === 1) {
    const n = Number(soNumero);
    if (n >= 1 && n <= 5) return n;
  }
  if (estrelas >= 1 && estrelas <= 5) return estrelas;

  for (const p of PALAVRAS) if (p.re.test(t)) return p.score;
  return null;
}

/** mensagens.user_id é obrigatório: usa o dono do lead, senão o owner da empresa. */
async function resolverUserId(admin: Admin, companyId: string, numero: string) {
  const { data: card } = await admin
    .from("crm_cards")
    .select("owner_id, user_id")
    .eq("company_id", companyId)
    .eq("numero", numero)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (card?.owner_id) return card.owner_id as string;
  if (card?.user_id) return card.user_id as string;
  const { data: owner } = await admin
    .from("company_user")
    .select("user_id")
    .eq("company_id", companyId)
    .eq("ativo", true)
    .in("role", ["owner", "admin"])
    .order("role", { ascending: true })
    .limit(1)
    .maybeSingle();
  return (owner?.user_id as string | undefined) ?? null;
}

async function enviar(admin: Admin, companyId: string, numero: string, texto: string) {
  const instance = await getActiveInstance(companyId);
  if (!instance) return;
  await waSendText(instance, numero, texto);
  const userId = await resolverUserId(admin, companyId, numero);
  const { error } = await admin.from("mensagens").insert({
    company_id: companyId,
    user_id: userId,
    numero,
    texto,
    direcao: "saida",
    autor: "ia",
    created_at: new Date().toISOString(),
  });
  if (error) console.warn("[csat-chat] falha ao registrar mensagem no chat:", error);
}

/**
 * Se há uma pesquisa de satisfação aberta no chat para este número,
 * consome a mensagem recebida como nota (ou comentário) e encerra o fluxo.
 */
export async function processCsatChatReply(
  admin: Admin,
  params: { companyId: string; numero: string; texto: string; inboundMessageId: string },
) {
  const { companyId, numero, texto } = params;

  const { data: pend } = await admin
    .from("csat_response")
    .select("id, estado, expira_em, tentativas, score, contato_nome")
    .eq("company_id", companyId)
    .eq("numero", numero)
    .eq("canal", "chat")
    .in("estado", ["aguardando_nota", "aguardando_comentario"])
    .order("enviado_em", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!pend) return null;

  if (pend.expira_em && new Date(pend.expira_em).getTime() < Date.now()) {
    await admin.from("csat_response").update({ estado: "expirado" }).eq("id", pend.id);
    return null;
  }

  const { data: comp } = await admin
    .from("company")
    .select("csat_pedir_comentario, csat_texto_comentario, csat_texto_agradecimento, csat_pergunta")
    .eq("id", companyId)
    .maybeSingle();

  const agradecimento =
    (comp?.csat_texto_agradecimento as string | null)?.trim() ||
    "Obrigado pela sua avaliação! 🙏";
  const pedidoComentario =
    (comp?.csat_texto_comentario as string | null)?.trim() ||
    "Quer deixar um comentário? Pode escrever aqui. 🙂";

  // Etapa: comentário
  if (pend.estado === "aguardando_comentario") {
    await admin
      .from("csat_response")
      .update({ comentario: String(texto).slice(0, 2000), estado: "concluido" })
      .eq("id", pend.id);
    await enviar(admin, companyId, numero, agradecimento);
    return { handled: true, action: "comentario_registrado" as const };
  }

  // Etapa: nota
  const score = parseCsatScore(texto);
  if (score == null) {
    const tentativas = (pend.tentativas ?? 0) + 1;
    await admin.from("csat_response").update({ tentativas }).eq("id", pend.id);
    if (tentativas <= 1) {
      await enviar(
        admin,
        companyId,
        numero,
        "Para registrar sua avaliação, responda apenas com um número de 1 a 5. 🙂",
      );
      return { handled: true, action: "reforco_enviado" as const };
    }
    // Segunda tentativa inválida: libera o atendimento normal.
    await admin.from("csat_response").update({ estado: "abandonado" }).eq("id", pend.id);
    return null;
  }

  const pedirComentario = comp?.csat_pedir_comentario !== false;
  await admin
    .from("csat_response")
    .update({
      score,
      respondido_em: new Date().toISOString(),
      estado: pedirComentario ? "aguardando_comentario" : "concluido",
    })
    .eq("id", pend.id);

  try {
    const { emitWebhook } = await import("./webhooks.server");
    await emitWebhook(companyId, "csat.responded", {
      numero,
      contato_nome: pend.contato_nome,
      score,
      resposta_id: pend.id,
    });
  } catch (e) {
    console.warn("[csat] webhook csat.responded", e);
  }

  if (score <= 2) {
    try {
      await admin.rpc("push_notificacao", {
        _company_id: companyId,
        _tipo: "csat_nota_baixa",
        _titulo: `Nota ${score} de ${pend.contato_nome || numero}`,
        _descricao: "Avaliação baixa na pesquisa de satisfação. Vale um retorno rápido.",
        _link: `/app/conversas?numero=${numero}`,
        _ref_id: String(pend.id),
      });
    } catch (e) {
      console.warn("[csat] push_notificacao falhou", e);
    }
  }

  await enviar(
    admin,
    companyId,
    numero,
    // Se vai pedir comentário, o agradecimento só é enviado após o comentário.
    pedirComentario ? pedidoComentario : agradecimento,
  );

  return { handled: true, action: "nota_registrada" as const, score };
}
