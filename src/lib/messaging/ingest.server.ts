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

const STATUS_PRIORITY: Record<string, number> = {
  queued: 1,
  pendente: 1,
  sent: 2,
  enviado: 2,
  delivered: 3,
  entregue: 3,
  read: 4,
  lido: 4,
  failed: 5,
  falha: 5,
};

const STATUS_MAP: Record<MessageStatusEvent["status"], string> = {
  queued: "pendente",
  sent: "enviado",
  delivered: "entregue",
  read: "lido",
  failed: "falha",
};

/**
 * F2 — Resolución segura de conexión.
 * Usa consultas parametrizadas individuales para evitar riesgos de inyección
 * y comportamientos erráticos con caracteres especiales.
 */
async function resolveConnection(
  provider: MessagingProviderId,
  externalConnectionId?: string | null,
) {
  let data: any = null;
  const providerList = provider === "dapi" ? ["dapi", "dapi_official"] : [provider];

  if (externalConnectionId) {
    // 1. Busca por external_connection_id parametrizado
    const { data: byExtId, error: err1 } = await (supabaseAdmin as any)
      .from("whatsapp_instances")
      .select("id,company_id,user_id,instance_name,external_connection_id,provider")
      .in("provider", providerList)
      .eq("external_connection_id", externalConnectionId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (err1) throw new Error(`No se pudo resolver la conexión: ${err1.message}`);
    if (byExtId) data = byExtId;

    // 2. Si no coincide, busca por instance_name parametrizado
    if (!data) {
      const { data: byName, error: err2 } = await (supabaseAdmin as any)
        .from("whatsapp_instances")
        .select("id,company_id,user_id,instance_name,external_connection_id,provider")
        .in("provider", providerList)
        .eq("instance_name", externalConnectionId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (err2) throw new Error(`No se pudo resolver la conexión: ${err2.message}`);
      if (byName) data = byName;
    }
  }

  // 3. Fallback controlado para beta de lovable_whatsapp si existe solo 1 instancia
  if (!data && provider === "lovable_whatsapp") {
    const fallback = await (supabaseAdmin as any)
      .from("whatsapp_instances")
      .select("id,company_id,user_id,instance_name,external_connection_id,provider")
      .eq("provider", provider)
      .order("updated_at", { ascending: false })
      .limit(2);

    if (fallback.error) {
      throw new Error(`No se pudo resolver la conexión: ${fallback.error.message}`);
    }
    if ((fallback.data ?? []).length === 1) {
      data = fallback.data[0];
    }
  }

  if (!data) throw new Error(`No existe una conexión ${provider} registrada para este evento.`);

  return data as {
    id: string;
    company_id: string;
    user_id: string | null;
    instance_name: string;
    external_connection_id: string | null;
    provider?: string | null;
  };
}

async function persistMessage(
  event: IncomingMessageEvent,
  connection: Awaited<ReturnType<typeof resolveConnection>>,
) {
  if (event.phone && !event.phone.includes("@g.us")) {
    try {
      const { resolveThreadNumero } = await import("@/lib/phone-thread.server");
      const canonicalPhone = await resolveThreadNumero(supabaseAdmin, connection.company_id, event.phone);
      if (canonicalPhone) {
        event = { ...event, phone: canonicalPhone };
      }
    } catch {
      // fallback al event.phone original
    }
  }

  let replyToUuid: string | null = null;
  if (event.replyToExternalMessageId) {
    const { data: quotedRow } = await (supabaseAdmin as any)
      .from("mensagens")
      .select("id")
      .eq("company_id", connection.company_id)
      .eq("whatsapp_message_id", event.replyToExternalMessageId)
      .limit(1)
      .maybeSingle();
    replyToUuid = quotedRow?.id ?? null;
  }

  const firstAtt = event.attachments[0];
  const safeMidiaUrl =
    firstAtt?.storageUrl ||
    (firstAtt?.providerUrl && !firstAtt.providerUrl.startsWith("data:")
      ? firstAtt.providerUrl
      : null);

  // Limpiar data URI gigante del raw_payload antes de guardarlo en PostgreSQL
  const sanitizedRaw =
    event.raw && typeof event.raw === "object"
      ? {
          ...(event.raw as any),
          data: {
            ...((event.raw as any).data || {}),
            media_url:
              typeof (event.raw as any).data?.media_url === "string" &&
              (event.raw as any).data.media_url.startsWith("data:")
                ? "[archived_to_r2]"
                : (event.raw as any).data?.media_url,
          },
        }
      : event.raw;

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
              : event.author === "system" || event.author === "phone"
                ? "automacao"
                : "humano",
        texto: event.text,
        provider: connection.provider || event.provider,
        whatsapp_message_id: event.externalMessageId,
        reply_to_id: replyToUuid,
        provider_timestamp: event.occurredAt,
        midia_url: safeMidiaUrl,
        midia_tipo: firstAtt?.kind ?? null,
        midia_mime: firstAtt?.mimeType ?? null,
        midia_nome: firstAtt?.fileName ?? null,
        status_envio: event.direction === "incoming" ? "recebido" : "enviado",
        raw_payload: sanitizedRaw,
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
        provider_url: attachment.storageKey ? null : (attachment.providerUrl ?? null),
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
    if (attachmentError) {
      throw new Error(`No se pudieron guardar los adjuntos: ${attachmentError.message}`);
    }
  }

  if (event.attachments.length && !safeMidiaUrl) {
    try {
      const { generateMediaToken } = await import("@/routes/api/public/chat-media");
      const { sig, exp } = generateMediaToken(message.id);
      const proxiedUrl = `/api/public/chat-media?id=${message.id}&sig=${sig}&exp=${exp}`;
      await (supabaseAdmin as any)
        .from("mensagens")
        .update({
          midia_url: proxiedUrl,
          midia_tipo: firstAtt?.kind ?? "document",
        })
        .eq("id", message.id);
    } catch {
      // best-effort
    }
  }

  // F4/F5 — Conciliación de estados huérfanos que hayan llegado antes del mensaje principal
  const { data: orphanStatuses } = await (supabaseAdmin as any)
    .from("message_status_events")
    .select("id, status")
    .eq("company_id", connection.company_id)
    .eq("external_message_id", event.externalMessageId)
    .is("mensagem_id", null);

  if (orphanStatuses && orphanStatuses.length > 0) {
    await (supabaseAdmin as any)
      .from("message_status_events")
      .update({ mensagem_id: message.id })
      .in("id", orphanStatuses.map((s: any) => s.id));

    let highestStatus: MessageStatusEvent["status"] | null = null;
    let maxPriority = 0;
    for (const orphan of orphanStatuses) {
      const prio = STATUS_PRIORITY[orphan.status] ?? 0;
      if (prio > maxPriority) {
        maxPriority = prio;
        highestStatus = orphan.status as MessageStatusEvent["status"];
      }
    }

    if (
      highestStatus &&
      maxPriority > (STATUS_PRIORITY[event.direction === "incoming" ? "recebido" : "enviado"] ?? 0)
    ) {
      await (supabaseAdmin as any)
        .from("mensagens")
        .update({ status_envio: STATUS_MAP[highestStatus] ?? highestStatus })
        .eq("id", message.id);
    }
  }

  // F7 — Conexión con CRM / Kanban / IA para mensajes entrantes
  if (event.direction === "incoming") {
    try {
      const { upsertCard, getStagesBrief, pickLeadOwner } = await import("@/lib/crm-engine.server");
      const stages = await getStagesBrief(supabaseAdmin, connection.company_id);
      const isAudio = event.attachments.some((a) => a.kind === "audio");
      const summaryText =
        event.text ||
        (isAudio
          ? "[ÁUDIO]"
          : event.attachments.length
            ? `[${event.attachments[0].kind.toUpperCase()}]`
            : "");

      const currentCard = await upsertCard(
        supabaseAdmin,
        connection.company_id,
        connection.user_id,
        event.phone,
        event.contactName || null,
        summaryText,
        stages,
        "whatsapp",
      );

      // Captura y asociación de Anuncios Meta Ads (CTWA), UTMs y Sesiones de Clic
      if (currentCard) {
        try {
          const {
            extractTrackingFromText,
            extractAdContext,
            extractTrackingProtocolCode,
            deriveCanal,
          } = await import("@/lib/tracking-utils");

          const t = extractTrackingFromText(event.text);
          const adCtx = extractAdContext(event.raw);
          const protocolCode = extractTrackingProtocolCode(event.text);
          const patch: Record<string, any> = {};

          const setIfEmpty = (col: string, val: string | null | undefined) => {
            if (val && !(currentCard as any)[col]) patch[col] = String(val).slice(0, 500);
          };

          // 1. Código de protocolo (#ABC12) de Link Rastreable
          if (protocolCode) {
            try {
              const { data: clickSession } = await (supabaseAdmin as any)
                .from("lead_click_session")
                .select("*")
                .eq("company_id", connection.company_id)
                .eq("code", protocolCode)
                .maybeSingle();

              if (clickSession) {
                setIfEmpty("fbclid", clickSession.fbclid);
                setIfEmpty("gclid", clickSession.gclid);
                setIfEmpty("utm_source", clickSession.utm_source);
                setIfEmpty("utm_medium", clickSession.utm_medium);
                setIfEmpty("utm_campaign", clickSession.utm_campaign);
                setIfEmpty("utm_term", clickSession.utm_term);
                setIfEmpty("utm_content", clickSession.utm_content);
                setIfEmpty("referrer", clickSession.referrer);
                setIfEmpty("first_page", clickSession.first_page);

                const prevExtras =
                  currentCard.campos_extras && typeof currentCard.campos_extras === "object"
                    ? currentCard.campos_extras
                    : {};
                patch.campos_extras = {
                  ...prevExtras,
                  browser_tracking: {
                    fbc: clickSession.fbc,
                    fbp: clickSession.fbp,
                    client_ip: clickSession.client_ip,
                    client_user_agent: clickSession.client_user_agent,
                    captured_at: clickSession.created_at,
                  },
                };
              }
            } catch {
              // lead_click_session fallback
            }
          }

          // 2. UTMs y Click IDs en texto
          setIfEmpty("utm_source", t.utm_source);
          setIfEmpty("utm_medium", t.utm_medium);
          setIfEmpty("utm_campaign", t.utm_campaign);
          setIfEmpty("utm_term", t.utm_term);
          setIfEmpty("utm_content", t.utm_content);
          setIfEmpty("gclid", t.gclid);
          setIfEmpty("fbclid", t.fbclid);

          // 3. Contexto de Anuncio Click-to-WhatsApp (Meta Ads)
          if (adCtx) {
            if (adCtx.ctwaClid) patch.ctwa_clid = adCtx.ctwaClid;
            else setIfEmpty("ctwa_clid", t.ctwa_clid);

            setIfEmpty("referrer", adCtx.sourceUrl);
            setIfEmpty("origem", adCtx.title || (adCtx.sourceId ? `Anúncio ${adCtx.sourceId}` : null));
            setIfEmpty("utm_campaign", adCtx.sourceId);

            const prevExtras =
              patch.campos_extras ||
              (currentCard.campos_extras && typeof currentCard.campos_extras === "object"
                ? currentCard.campos_extras
                : {});
            patch.campos_extras = {
              ...prevExtras,
              ad_referral: {
                source_id: adCtx.sourceId,
                source_url: adCtx.sourceUrl,
                headline: adCtx.title,
                body: adCtx.body,
                thumbnail_url: adCtx.thumbnailUrl,
                ctwa_clid: adCtx.ctwaClid,
                captured_at: new Date().toISOString(),
              },
            };
          } else {
            setIfEmpty("ctwa_clid", t.ctwa_clid);
          }

          const hasCtwa = Boolean(adCtx?.ctwaClid || adCtx?.sourceUrl || patch.ctwa_clid || patch.fbclid);
          const canal = deriveCanal(t, hasCtwa);
          const canalAtual = (currentCard as any).canal_entrada;
          if (canal !== "whatsapp_direto" && (!canalAtual || canalAtual === "whatsapp_direto" || canalAtual === "whatsapp")) {
            patch.canal_entrada = canal;
          }

          if (Object.keys(patch).length > 0) {
            await (supabaseAdmin as any).from("crm_cards").update(patch).eq("id", currentCard.id);
            Object.assign(currentCard, patch);
          }

          // Resolver en segundo plano nombres reales de Meta Ads si hay sourceId
          if (adCtx?.sourceId) {
            void import("@/lib/meta-capi.server")
              .then(({ enrichCardWithMetaAdDetails }) =>
                enrichCardWithMetaAdDetails(connection.company_id, currentCard.id, adCtx.sourceId!),
              )
              .catch(() => null);
          }

          if (hasCtwa) {
            void import("@/lib/meta-capi.server")
              .then(({ sendMetaConversionForLead }) =>
                sendMetaConversionForLead({
                  companyId: connection.company_id,
                  cardId: currentCard.id,
                  eventName: "LeadSubmitted",
                  dedupKey: `${currentCard.id}_initial_LeadSubmitted`,
                }),
              )
              .catch(() => null);
          }
        } catch (trackErr: any) {
          console.warn("[ingest.tracking] Error al extraer rastreo de anuncio:", trackErr?.message);
        }
      }

      if (currentCard && !currentCard.owner_id) {
        const { data: stageConfig } = await (supabaseAdmin as any)
          .from("crm_stage")
          .select("modo_atendimento")
          .eq("id", currentCard.stage_id)
          .maybeSingle();

        if (stageConfig?.modo_atendimento === "manual") {
          const ownerId = await pickLeadOwner(supabaseAdmin, connection.company_id, currentCard.stage_id);
          if (ownerId) {
            await (supabaseAdmin as any)
              .from("crm_cards")
              .update({ owner_id: ownerId })
              .eq("id", currentCard.id);
          }
        }
      }

      const isUntranscribedAudio = isAudio && (!event.text || !event.text.trim() || summaryText === "[ÁUDIO]");
      const { processInboundAutomation } = await import("@/lib/inbound-automation.server");
      await processInboundAutomation(supabaseAdmin, {
        companyId: connection.company_id,
        numero: event.phone,
        texto: summaryText,
        inboundMessageId: message.id,
        stageId: currentCard?.stage_id,
        responderEmAudio: isAudio,
        isAudioMessage: isUntranscribedAudio,
      });
    } catch (automationError) {
      console.error("[ingest.automation] Error al ejecutar automatización de CRM/IA:", automationError);
    }
  } else if (event.direction === "outgoing") {
    try {
      await (supabaseAdmin as any)
        .from("crm_cards")
        .update({
          ultima_mensagem: (event.text || "[Mensaje enviado]").slice(0, 240),
          ultima_em: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("company_id", connection.company_id)
        .eq("numero", event.phone);

      void import("@/lib/crm-lead-analyzer.server")
        .then(({ checkAndAnalyzeLeadCooldown }) =>
          checkAndAnalyzeLeadCooldown(connection.company_id, event.phone),
        )
        .catch(() => null);
    } catch (outErr: any) {
      console.warn("[ingest.outgoing] Error actualizando card/análisis:", outErr?.message);
    }
  }
}

async function persistStatus(
  event: MessageStatusEvent,
  connection: Awaited<ReturnType<typeof resolveConnection>>,
) {
  const { data: message } = await (supabaseAdmin as any)
    .from("mensagens")
    .select("id, status_envio")
    .eq("company_id", connection.company_id)
    .eq("whatsapp_message_id", event.externalMessageId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error: statusEventError } = await (supabaseAdmin as any).from("message_status_events").upsert(
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

  if (statusEventError) {
    console.warn("[persistStatus] Error registrando status_event:", statusEventError.message);
  }

  // F4/F5 — Regla de avance de estado: nunca retroceder a un estado de menor prioridad
  if (message?.id) {
    const currentStatus = message.status_envio || "pendente";
    const currentPriority = STATUS_PRIORITY[currentStatus] ?? 0;
    const newPriority = STATUS_PRIORITY[event.status] ?? 0;

    if (newPriority >= currentPriority || event.status === "failed") {
      await (supabaseAdmin as any)
        .from("mensagens")
        .update({ status_envio: STATUS_MAP[event.status] })
        .eq("id", message.id);
    }
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
 * Entrada única para el receptor de eventos de mensajería.
 * F1: Manejo robusto de reintentos. Si el evento falló anteriormente, se reprocesa
 * en lugar de devolver duplicate silenciosamente.
 */
export async function ingestMessagingEvent(request: IngestRequest) {
  const connection = await resolveConnection(request.provider, request.externalConnectionId);

  let inboxEventId: string | null = null;
  const { data: insertedEvent, error: insertError } = await (supabaseAdmin as any)
    .from("messaging_inbox_events")
    .insert({
      company_id: connection.company_id,
      provider: request.provider,
      external_event_id: request.externalEventId,
      external_connection_id: request.externalConnectionId ?? connection.external_connection_id,
      raw_payload: request.raw,
      status: "received",
    })
    .select("id")
    .maybeSingle();

  if (insertError) {
    if (insertError.code === "23505") {
      // Evento ya existe: consultar su estado para decidir si reintentar
      const { data: existingEvent } = await (supabaseAdmin as any)
        .from("messaging_inbox_events")
        .select("id, status")
        .eq("provider", request.provider)
        .eq("external_event_id", request.externalEventId)
        .maybeSingle();

      if (!existingEvent) {
        return { ok: true, duplicate: true, processed: 0 };
      }

      // Si ya fue procesado con éxito o ignorado deliberadamente, responder duplicado
      if (existingEvent.status === "processed" || existingEvent.status === "ignored") {
        return { ok: true, duplicate: true, processed: 0 };
      }

      // Si estaba en 'failed' o 'received' pendiente, REPROCESARLO
      inboxEventId = existingEvent.id;
      await (supabaseAdmin as any)
        .from("messaging_inbox_events")
        .update({ status: "received", error_message: null })
        .eq("id", inboxEventId);
    } else {
      throw new Error(`No se pudo registrar el evento: ${insertError.message}`);
    }
  } else {
    inboxEventId = insertedEvent?.id ?? null;
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
    } else if (request.provider === "dapi") {
      const [{ archiveProviderAttachment }, { dapiDownloadMedia }] = await Promise.all([
        import("@/lib/messaging/media-archive.server"),
        import("@/lib/dapi.server"),
      ]);
      normalized = await Promise.all(
        normalized.map(async (event) => {
          if (event.type !== "message" || !event.attachments.length) return event;
          const attachments = await Promise.all(
            event.attachments.map(async (attachment) => {
              if (attachment.storageKey) return attachment;
              try {
                return await archiveProviderAttachment({
                  companyId: connection.company_id,
                  occurredAt: event.occurredAt,
                  attachment,
                  download: async (item) => {
                    const url = item.providerUrl || "";
                    if (url.startsWith("data:")) {
                      const commaIdx = url.indexOf(",");
                      const meta = commaIdx !== -1 ? url.slice(0, commaIdx) : "";
                      const b64 = commaIdx !== -1 ? url.slice(commaIdx + 1) : "";
                      const mimeMatch = meta.match(/^data:([^;,]+)/i);
                      return {
                        bytes: new Uint8Array(Buffer.from(b64, "base64")),
                        mimeType: mimeMatch?.[1] || item.mimeType,
                        fileName: item.fileName,
                      };
                    }
                    if (url.startsWith("http")) {
                      const res = await fetch(url);
                      if (res.ok) {
                        return {
                          bytes: new Uint8Array(await res.arrayBuffer()),
                          mimeType: res.headers.get("content-type") || item.mimeType,
                          fileName: item.fileName,
                        };
                      }
                    }
                    if (item.externalId) {
                      const dl = await dapiDownloadMedia(connection.instance_name, item.externalId);
                      if (dl?.base64) {
                        const rawB64 = dl.base64.includes(",") ? dl.base64.split(",")[1] : dl.base64;
                        return {
                          bytes: new Uint8Array(Buffer.from(rawB64, "base64")),
                          mimeType: dl.mimetype || item.mimeType,
                          fileName: item.fileName,
                        };
                      }
                    }
                    throw new Error("No se pudo descargar el adjunto desde D-API");
                  },
                });
              } catch (archErr: any) {
                console.warn("[ingest.dapi] No se pudo archivar adjunto en R2, conservando providerUrl:", archErr?.message);
                return attachment;
              }
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

    if (inboxEventId) {
      await (supabaseAdmin as any)
        .from("messaging_inbox_events")
        .update({
          status: normalized.length ? "processed" : "ignored",
          normalized_count: normalized.length,
          processed_at: new Date().toISOString(),
          error_message: null,
        })
        .eq("id", inboxEventId);
    }

    return { ok: true, duplicate: false, processed: normalized.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (inboxEventId) {
      await (supabaseAdmin as any)
        .from("messaging_inbox_events")
        .update({
          status: "failed",
          error_message: message,
          processed_at: new Date().toISOString(),
        })
        .eq("id", inboxEventId);
    }
    throw error;
  }
}
