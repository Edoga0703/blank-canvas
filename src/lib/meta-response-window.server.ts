/* eslint-disable @typescript-eslint/no-explicit-any */

const META_RESPONSE_WINDOW_MS = 24 * 60 * 60 * 1000;

export type MetaResponseWindow = {
  open: boolean;
  lastInboundAt: string | null;
  expiresAt: string | null;
  remainingMs: number;
};

/**
 * Calcula a janela de resposta a partir da última mensagem real de entrada.
 * Usa created_at porque a ingesta ao vivo e a sincronização histórica gravam
 * nesse campo o instante original informado pela Meta.
 */
export async function getMetaResponseWindow(admin: any, input: {
  companyId: string;
  provider: "meta_instagram" | "meta_messenger" | "dapi_official";
  contactId: string;
  now?: Date;
}): Promise<MetaResponseWindow> {
  const { data, error } = await admin.from("mensagens")
    .select("created_at,provider_timestamp")
    .eq("company_id", input.companyId)
    .eq("provider", input.provider)
    .eq("numero", input.contactId)
    .eq("direcao", "entrada")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;

  const raw = data?.provider_timestamp ?? data?.created_at ?? null;
  const last = raw ? new Date(raw) : null;
  if (!last || Number.isNaN(last.getTime())) {
    return { open: false, lastInboundAt: null, expiresAt: null, remainingMs: 0 };
  }

  const now = input.now ?? new Date();
  const expiresAt = new Date(last.getTime() + META_RESPONSE_WINDOW_MS);
  const remainingMs = Math.max(0, expiresAt.getTime() - now.getTime());
  return {
    open: remainingMs > 0,
    lastInboundAt: last.toISOString(),
    expiresAt: expiresAt.toISOString(),
    remainingMs,
  };
}

/** Impede RESPONSE fora da janela padrão antes de chamar a Graph API. */
export async function assertMetaResponseWindow(admin: any, input: {
  companyId: string;
  provider: "meta_instagram" | "meta_messenger" | "dapi_official";
  contactId: string;
}) {
  const result = await getMetaResponseWindow(admin, input);
  if (result.open) return result;

  const channel = input.provider === "meta_instagram"
    ? "Instagram"
    : input.provider === "meta_messenger"
    ? "Messenger"
    : "WhatsApp Oficial (Meta)";
  const last = result.lastInboundAt
    ? new Date(result.lastInboundAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })
    : "não localizada";

  let advice = "";
  if (input.provider === "meta_instagram") {
    advice = "No Instagram, a política oficial da Meta não permite o envio de mensagens fora da janela de 24 horas até que o contato envie uma nova mensagem.";
  } else if (input.provider === "meta_messenger") {
    advice = "No Messenger, a política oficial da Meta exige que o contato envie uma nova mensagem ou que seja utilizada uma tag autorizada.";
  } else {
    advice = "Envie um Modelo de Mensagem (HSM/Template) aprovado pela Meta ou aguarde uma nova mensagem do contato.";
  }

  throw new Error(
    `Fora da janela de resposta de 24 horas do ${channel}. ` +
    `Última mensagem recebida: ${last}. ${advice}`,
  );
}
