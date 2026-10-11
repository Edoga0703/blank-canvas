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
  provider: "meta_instagram" | "meta_messenger";
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
  provider: "meta_instagram" | "meta_messenger";
  contactId: string;
}) {
  const result = await getMetaResponseWindow(admin, input);
  if (result.open) return result;

  const channel = input.provider === "meta_instagram" ? "Instagram" : "Messenger";
  const last = result.lastInboundAt
    ? new Date(result.lastInboundAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })
    : "não localizada";
  throw new Error(
    `Fora da janela de resposta de 24 horas do ${channel}. ` +
    `Última mensagem recebida: ${last}. Aguarde uma nova mensagem do contato antes de responder.`,
  );
}
