/* eslint-disable @typescript-eslint/no-explicit-any */

type MetaDeliveryStatus = "sent" | "delivered" | "read" | "failed";

const STATUS_PRIORITY: Record<string, number> = {
  pendente: 1,
  queued: 1,
  enviado: 2,
  sent: 2,
  recebido: 3,
  entregue: 3,
  delivered: 3,
  visto: 4,
  lido: 4,
  read: 4,
  falha: 5,
  failed: 5,
};

const LOCAL_STATUS: Record<MetaDeliveryStatus, string> = {
  sent: "enviado",
  delivered: "recebido",
  read: "visto",
  failed: "falha",
};

function shouldAdvance(current: string | null | undefined, next: MetaDeliveryStatus) {
  return (STATUS_PRIORITY[LOCAL_STATUS[next]] ?? 0) >= (STATUS_PRIORITY[String(current ?? "pendente")] ?? 0);
}

async function saveStatusEvent(admin: any, input: {
  companyId: string;
  mensagemId?: string | null;
  externalMessageId: string;
  status: MetaDeliveryStatus;
  occurredAt: string;
  rawPayload: unknown;
}) {
  const { data: existing, error: lookupError } = await admin.from("message_status_events")
    .select("id,mensagem_id")
    .eq("company_id", input.companyId)
    .eq("external_message_id", input.externalMessageId)
    .eq("status", input.status)
    .order("occurred_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lookupError) throw lookupError;

  if (existing?.id) {
    const patch: Record<string, unknown> = { occurred_at: input.occurredAt, raw_payload: input.rawPayload };
    if (!existing.mensagem_id && input.mensagemId) patch.mensagem_id = input.mensagemId;
    const { error } = await admin.from("message_status_events").update(patch).eq("id", existing.id);
    if (error) throw error;
    return;
  }

  const { error } = await admin.from("message_status_events").insert({
    company_id: input.companyId,
    mensagem_id: input.mensagemId ?? null,
    external_message_id: input.externalMessageId,
    status: input.status,
    occurred_at: input.occurredAt,
    raw_payload: input.rawPayload,
  });
  if (error && error.code !== "23505") throw error;
}

/** Aplica um estado individual sem permitir regressões (read -> delivered, etc.). */
export async function applyMetaMessageStatus(admin: any, input: {
  companyId: string;
  provider: string;
  externalMessageId: string;
  status: MetaDeliveryStatus;
  occurredAt: string;
  rawPayload: unknown;
}) {
  const { data: message, error } = await admin.from("mensagens")
    .select("id,status_envio")
    .eq("company_id", input.companyId)
    .eq("provider", input.provider)
    .eq("whatsapp_message_id", input.externalMessageId)
    .limit(1)
    .maybeSingle();
  if (error) throw error;

  await saveStatusEvent(admin, {
    companyId: input.companyId,
    mensagemId: message?.id ?? null,
    externalMessageId: input.externalMessageId,
    status: input.status,
    occurredAt: input.occurredAt,
    rawPayload: input.rawPayload,
  });

  if (message?.id && shouldAdvance(message.status_envio, input.status)) {
    const { error: updateError } = await admin.from("mensagens")
      .update({ status_envio: LOCAL_STATUS[input.status] })
      .eq("id", message.id);
    if (updateError) throw updateError;
  }
}

/**
 * Meta envia leitura por watermark, sem listar cada MID. Marca somente mensagens
 * de saída do contato/canal até o instante informado e preserva falhas finais.
 */
export async function applyMetaReadWatermark(admin: any, input: {
  companyId: string;
  provider: string;
  contactId: string;
  watermark: number;
  rawPayload: unknown;
}) {
  const milliseconds = input.watermark < 10_000_000_000 ? input.watermark * 1000 : input.watermark;
  const occurredAt = new Date(milliseconds).toISOString();
  const externalEventId = `read:${input.provider}:${input.contactId}:${input.watermark}`;

  const { data: messages, error } = await admin.from("mensagens")
    .select("id,status_envio")
    .eq("company_id", input.companyId)
    .eq("provider", input.provider)
    .eq("numero", input.contactId)
    .eq("direcao", "saida")
    .lte("created_at", occurredAt)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw error;

  const ids = (messages ?? [])
    .filter((message: any) => shouldAdvance(message.status_envio, "read"))
    .map((message: any) => message.id);
  if (ids.length) {
    const { error: updateError } = await admin.from("mensagens").update({ status_envio: LOCAL_STATUS.read }).in("id", ids);
    if (updateError) throw updateError;
  }

  await saveStatusEvent(admin, {
    companyId: input.companyId,
    externalMessageId: externalEventId,
    status: "read",
    occurredAt,
    rawPayload: input.rawPayload,
  });
  return ids.length;
}
