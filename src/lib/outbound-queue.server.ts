import { supabaseAdmin } from "@/integrations/supabase/client.server";

const DELAYS_MS = [30_000, 2 * 60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000];

export function nextDelayMs(tentativas: number) {
  return DELAYS_MS[Math.min(tentativas, DELAYS_MS.length - 1)];
}

export type OutboundKind = "text" | "media" | "audio";

export async function enqueueOutbound(params: {
  companyId: string;
  mensagemId: string | null;
  kind: OutboundKind;
  payload: Record<string, any>;
  erro?: string;
}) {
  const proxima = new Date(Date.now() + nextDelayMs(0)).toISOString();
  await supabaseAdmin.from("outbound_queue").insert({
    company_id: params.companyId,
    mensagem_id: params.mensagemId,
    kind: params.kind,
    payload: params.payload,
    proxima_em: proxima,
    ultimo_erro: params.erro ?? null,
  });
}
