/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type {
  IncomingMessageEvent,
  MessageStatusEvent,
  MessagingProviderId,
  NormalizedMessagingEvent,
} from "@/lib/messaging/contracts";
import { getMessagingProvider } from "@/lib/messaging/provider-registry.server";
import { createHash } from "node:crypto";

export type IngestRequest = {
  provider: MessagingProviderId;
  externalEventId: string;
  externalConnectionId?: string | null;
  raw: unknown;
};

async function resolveConnection(
  provider: MessagingProviderId,
  externalConnectionId?: string | null,
) {
  let query = (supabaseAdmin as any)
    .from("whatsapp_instances")
    .select("id,company_id,user_id,instance_name,external_connection_id")
    .eq("provider", provider);

  if (externalConnectionId) {
    query = query.or(
      `external_connection_id.eq.${externalConnectionId},instance_name.eq.${externalConnectionId}`,
    );
  }

  const { data: matchedData, error } = await query
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`No se pudo resolver la conexión: ${error.message}`);
  let data = matchedData;
  // La beta tiene una unica conexion oficial por proyecto. El ID real solo se
  // conoce al recibir el primer evento generado por Lovable.
  if (!data && provider === "lovable_whatsapp") {
    const fallback = await (supabaseAdmin as any)
      .from("whatsapp_instances")
      .select("id,company_id,user_id,instance_name,external_connection_id")
      .eq("provider", provider)
      .order("updated_at", { ascending: false })
      .limit(2);
    if (fallback.error)
      throw new Error(`No se pudo resolver la conexión: ${fallback.error.message}`);
    if ((fallback.data ?? []).length === 1) data = fallback.data[0];
  }
  if (!data) throw new Error(`No existe una conexión ${provider} registrada para este evento.`);
  return data as {
    id: string;
    company_id: string;
    user_id: string | null;
    instance_name: string;
    external_connection_id: string | null;
  };
}

async function persistMessage(
  event: IncomingMessageEvent,
  connection: Awaited<ReturnType<typeof resolveConnection>>,
) {
  const { data: message, error } = await (supabaseAdmin as any)
    .from("mensagens")
    .upsert(
      {
        company_id: connection.company_id,
        user_id: connection.user_id,
        instance_id: connection.id,
        numero: event.phone,
        contato_nome: event.contactName ?? null,
        direcao: event.direction === "incoming" ? "entrada" : "saida",
        autor:
          event.author === "contact"
            ? "contato"
            : event.author === "ai"
              ? "ia"
              : event.author === "phone"
                ? "telefone"
                : event.author === "system"
                  ? "sistema"
                  : "humano",
        texto: event.text,
        provider: event.provider,
        whatsapp_message_id: event.externalMessageId,
        provider_timestamp: event.occurredAt,
        midia_url: event.attachments[0]?.storageKey
          ? (event.attachments[0]?.storageUrl ?? null)
          : (event.attachments[0]?.providerUrl ?? null),
        midia_tipo: event.attachments[0]?.kind ?? null,
        midia_mime: event.attachments[0]?.mimeType ?? null,
        midia_nome: event.attachments[0]?.fileName ?? null,
        status_envio: event.direction === "incoming" ? "recebido" : "enviado",
        raw_payload: event.raw,
      },
      { onConflict: "company_id,provider,whatsapp_message_id" },
    )
    .select("id")
    .single();
  if (error) throw new Error(`No se pudo guardar el mensaje: ${error.message}`);

  if (event.attachments.length) {
    const rows = event.attachments.map((attachment, index) => {
      const identity =
        attachment.externalId ||
        attachment.storageKey ||
        attachment.providerUrl ||
        attachment.sha256 ||
        `${attachment.kind}:${attachment.fileName || "archivo"}:${index}`;
      const attachmentKey = createHash("sha256").update(identity).digest("hex");
      return {
        company_id: connection.company_id,
        mensagem_id: message.id,
        attachment_key: attachmentKey,
        provider_attachment_id: attachment.externalId ?? null,
        kind: attachment.kind,
        provider_url: attachment.providerUrl ?? null,
        storage_key: attachment.storageKey ?? null,
        storage_url: attachment.storageUrl ?? null,
        mime_type: attachment.mimeType ?? null,
        file_name: attachment.fileName ?? null,
        size_bytes: attachment.sizeBytes ?? null,
        sha256: attachment.sha256 ?? null,
      };
    });
    const { error: attachmentError } = await (supabaseAdmin as any)
      .from("message_attachments")
      .upsert(rows, { onConflict: "mensagem_id,attachment_key" });
    if (attachmentError)
      throw new Error(`No se pudieron guardar los adjuntos: ${attachmentError.message}`);
  }
}

async function persistStatus(
  event: MessageStatusEvent,
  connection: Awaited<ReturnType<typeof resolveConnection>>,
) {
  const { data: message } = await (supabaseAdmin as any)
    .from("mensagens")
    .select("id")
    .eq("company_id", connection.company_id)
    .eq("provider", event.provider)
    .eq("whatsapp_message_id", event.externalMessageId)
    .maybeSingle();

  await (supabaseAdmin as any).from("message_status_events").upsert(
    {
      company_id: connection.company_id,
      mensagem_id: message?.id ?? null,
      external_message_id: event.externalMessageId,
      status: event.status,
      error_code: event.errorCode ?? null,
      error_message: event.errorMessage ?? null,
      raw_payload: event.raw,
      occurred_at: event.occurredAt,
    },
    { onConflict: "company_id,external_message_id,status,occurred_at", ignoreDuplicates: true },
  );

  if (message?.id) {
    const statusMap: Record<MessageStatusEvent["status"], string> = {
      queued: "pendente",
      sent: "enviado",
      delivered: "entregue",
      read: "lido",
      failed: "falha",
    };
    await (supabaseAdmin as any)
      .from("mensagens")
      .update({ status_envio: statusMap[event.status] })
      .eq("id", message.id);
  }
}

async function persistNormalized(
  event: NormalizedMessagingEvent,
  connection: Awaited<ReturnType<typeof resolveConnection>>,
) {
  if (event.type === "message") return persistMessage(event, connection);
  return persistStatus(event, connection);
}

/**
 * Entrada única para el receptor que Lovable generará.
 * Registra primero el payload crudo para no perder eventos y aplica una clave
 * externa única para que los reintentos del webhook no creen duplicados.
 */
export async function ingestMessagingEvent(request: IngestRequest) {
  const connection = await resolveConnection(request.provider, request.externalConnectionId);
  const { data: inboxEvent, error: insertError } = await (supabaseAdmin as any)
    .from("messaging_inbox_events")
    .insert({
      company_id: connection.company_id,
      provider: request.provider,
      external_event_id: request.externalEventId,
      external_connection_id: request.externalConnectionId ?? connection.external_connection_id,
      raw_payload: request.raw,
    })
    .select("id")
    .maybeSingle();

  if (insertError) {
    if (insertError.code === "23505") return { ok: true, duplicate: true, processed: 0 };
    throw new Error(`No se pudo registrar el evento: ${insertError.message}`);
  }

  try {
    let normalized = await getMessagingProvider(request.provider).normalizeEvent(request.raw);
    if (request.provider === "lovable_whatsapp") {
      const [{ archiveProviderAttachment }, { generatedDownloadMedia }] = await Promise.all([
        import("@/lib/messaging/media-archive.server"),
        import("@/lib/messaging/lovable-whatsapp.generated.server"),
      ]);
      normalized = await Promise.all(
        normalized.map(async (event) => {
          if (event.type !== "message" || !event.attachments.length) return event;
          const attachments = await Promise.all(
            event.attachments.map(async (attachment) => {
              if (attachment.storageKey) return attachment;
              return archiveProviderAttachment({
                companyId: connection.company_id,
                occurredAt: event.occurredAt,
                attachment,
                download: (item) =>
                  generatedDownloadMedia({
                    externalId: item.externalId,
                    providerUrl: item.providerUrl,
                    mimeType: item.mimeType,
                    fileName: item.fileName,
                  }),
              });
            }),
          );
          return { ...event, attachments };
        }),
      );
    }
    for (const event of normalized) await persistNormalized(event, connection);

    if (request.provider === "lovable_whatsapp" && normalized.length) {
      await (supabaseAdmin as any)
        .from("whatsapp_instances")
        .update({
          status: "connected",
          external_connection_id: request.externalConnectionId ?? connection.external_connection_id,
          last_state_at: new Date().toISOString(),
        })
        .eq("id", connection.id);
    }

    await (supabaseAdmin as any)
      .from("messaging_inbox_events")
      .update({
        status: normalized.length ? "processed" : "ignored",
        normalized_count: normalized.length,
        processed_at: new Date().toISOString(),
      })
      .eq("id", inboxEvent.id);

    return { ok: true, duplicate: false, processed: normalized.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await (supabaseAdmin as any)
      .from("messaging_inbox_events")
      .update({ status: "failed", error_message: message, processed_at: new Date().toISOString() })
      .eq("id", inboxEvent.id);
    throw error;
  }
}
