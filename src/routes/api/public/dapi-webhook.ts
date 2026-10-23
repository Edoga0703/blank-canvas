import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { ingestMessagingEvent } from "@/lib/messaging/ingest.server";
import type { IncomingMessageEvent, MessageStatusEvent, MessageKind } from "@/lib/messaging/contracts";
import { dapiDownloadMedia } from "@/lib/dapi.server";
import { transcribeIncomingAudio, describeIncomingFile } from "@/lib/media-understanding.server";

/**
 * Helper forense para extraer JID, número telefónico y nombre desde cualquier formato
 * de participante en D-API (objeto { jid, name } o string "5511...@s.whatsapp.net").
 */
function parseDapiParticipant(participant: any): { jid: string; phone: string; name: string | null } {
  if (!participant) return { jid: "", phone: "", name: null };
  if (typeof participant === "string") {
    const jid = participant.trim();
    const phone = jid.split("@")[0].replace(/\D/g, "");
    return { jid, phone, name: null };
  }
  if (typeof participant === "object") {
    const jid = String(participant.jid || participant.id || participant.phone || participant.number || "").trim();
    const rawName = participant.name || participant.pushName || participant.notify || null;
    const name = rawName ? String(rawName).trim() : null;
    const phone = (participant.phone || participant.number || jid.split("@")[0] || "").replace(/\D/g, "");
    return { jid, phone, name };
  }
  return { jid: "", phone: "", name: null };
}

export const Route = createFileRoute("/api/public/dapi-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const token = url.searchParams.get("t") || request.headers.get("x-webhook-token");

          const rawText = await request.text();
          let body: any = {};
          try {
            body = JSON.parse(rawText || "{}");
          } catch {
            return new Response("Invalid JSON payload", { status: 400 });
          }

          const sessionId = String(body.sessionId || body.session || "");
          if (!sessionId) {
            return new Response("Missing sessionId in webhook body", { status: 400 });
          }

          // Validación de seguridad de la conexión
          let query = supabaseAdmin
            .from("whatsapp_instances")
            .select("id, company_id, instance_name, status, paused, webhook_token")
            .eq("instance_name", sessionId);

          if (token) {
            query = query.eq("webhook_token", token);
          }

          const { data: inst, error: instErr } = await query.maybeSingle();
          if (instErr || !inst) {
            console.warn(`[dapi-webhook] Instancia no encontrada o token inválido para sessionId=${sessionId}`);
            return new Response("Unauthorized or unknown session", { status: 401 });
          }

          const eventName = String(body.event || "");
          const data = body.data || {};

          // 1. Manejo de estados de conexión (connection.status, connection.qrcode)
          if (eventName === "connection.status") {
            const rawStatus = String(data.status || data.state || "").toLowerCase();
            let newStatus = "connecting";
            if (rawStatus === "connected" || rawStatus === "open") {
              newStatus = "connected";
            } else if (rawStatus === "disconnected" || rawStatus === "logged_out" || rawStatus === "close") {
              newStatus = "disconnected";
            }

            const updates: Record<string, any> = {
              status: newStatus,
              updated_at: new Date().toISOString(),
              last_state_at: new Date().toISOString(),
            };
            const phoneStr = String(data.phoneNumber || data.phone || data.numero || "").replace(/\D/g, "");
            if (phoneStr) {
              updates.numero = phoneStr;
            }

            await supabaseAdmin
              .from("whatsapp_instances")
              .update(updates)
              .eq("id", inst.id);

            return new Response(JSON.stringify({ ok: true, event: "connection.status", status: newStatus }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          }

          if (eventName === "connection.qrcode") {
            return new Response(JSON.stringify({ ok: true, event: "connection.qrcode" }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          }

          // 2. Manejo de estados de entrega y lectura (message.delivered, message.read, message.status, messages.status)
          if (
            eventName === "message.delivered" ||
            eventName === "message.read" ||
            eventName === "message.status" ||
            eventName === "messages.status"
          ) {
            let status: "sent" | "delivered" | "read" | "failed" = "delivered";
            if (eventName === "message.read") {
              status = "read";
            } else if (eventName === "message.delivered") {
              status = "delivered";
            } else {
              const rawStatus = String(data.status || "").toLowerCase();
              if (rawStatus === "read" || rawStatus === "played") status = "read";
              else if (rawStatus === "delivered" || rawStatus === "received") status = "delivered";
              else if (rawStatus === "sent") status = "sent";
              else if (rawStatus === "failed" || rawStatus === "error") status = "failed";
            }

            const externalMessageId = String(data.message_id || data.id || body.traceId || "");
            if (externalMessageId) {
              const target = parseDapiParticipant(data.to || data.from || data.recipient);
              const statusEvent: MessageStatusEvent = {
                type: "status",
                provider: "dapi",
                connectionExternalId: sessionId,
                externalMessageId,
                status,
                occurredAt: body.timestamp || new Date().toISOString(),
                phone: target.phone,
                raw: body,
              };
              await ingestMessagingEvent({
                companyId: inst.company_id,
                event: statusEvent,
                externalEventId: `dapi_status_${eventName}_${externalMessageId}_${status}`,
              });
            }
            return new Response(JSON.stringify({ ok: true }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          }

          // 3. Manejo de mensajes (messages.received, messages.sent)
          if (eventName === "messages.received" || eventName === "messages.sent") {
            const fromMe = Boolean(data.fromMe);
            const senderPart = parseDapiParticipant(data.from || data.sender);
            const recipientPart = parseDapiParticipant(data.to || data.recipient_id || data.recipient);

            const isGroup = Boolean(
              data.is_group ||
              data.isGroup ||
              (senderPart.jid && senderPart.jid.endsWith("@g.us")) ||
              (recipientPart.jid && recipientPart.jid.endsWith("@g.us")) ||
              (typeof data.from === "string" && data.from.endsWith("@g.us")) ||
              (data.chat_id && String(data.chat_id).endsWith("@g.us"))
            );
            if (isGroup) {
              return new Response(JSON.stringify({ ok: true, ignored: true, reason: "group" }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
              });
            }

            const messageId = String(data.id || data.message_id || body.traceId || `dapi_${Date.now()}`);
            const activeParticipant = fromMe ? recipientPart : senderPart;
            const phone = activeParticipant.phone;

            if (!phone) {
              return new Response(JSON.stringify({ ok: true, ignored: true, reason: "no_phone" }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
              });
            }

            const contactName = String(
              data.from_name ||
              data.pushName ||
              senderPart.name ||
              recipientPart.name ||
              ""
            ).trim() || null;

            // Manejo de eco (fromMe === true): escrito desde celular físico o API externa
            if (fromMe) {
              // Verifica si el mensaje fue enviado previamente por el sistema / IA
              const { data: existing } = await supabaseAdmin
                .from("mensagens")
                .select("id, autor")
                .eq("company_id", inst.company_id)
                .eq("whatsapp_message_id", messageId)
                .maybeSingle();

              if (!existing) {
                // Mensaje enviado manualmente desde el teléfono físico: registrar y pausar la IA
                const text = String(data.message || data.text || data.body || data.caption || "").trim();
                const nowIso = new Date().toISOString();

                await supabaseAdmin.from("mensagens").insert({
                  company_id: inst.company_id,
                  contato_numero: phone,
                  contato_nome: contactName,
                  texto: text,
                  direcao: "saida",
                  autor: "humano",
                  whatsapp_message_id: messageId,
                  status_envio: "enviado",
                  canal: "whatsapp",
                  created_at: nowIso,
                } as any);

                // Pausar IA para este contacto (Helpdesk handoff)
                const { error: pauseErr } = await supabaseAdmin.from("contact_pause").upsert(
                  {
                    company_id: inst.company_id,
                    contato_numero: phone,
                    pausado: true,
                    pausado_por: "humano",
                    pausado_ate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
                    updated_at: nowIso,
                  } as any,
                  { onConflict: "company_id,contato_numero" },
                );
                if (pauseErr) console.warn("[dapi-webhook] Erro ao pausar contato por eco humano:", pauseErr.message);
              }

              return new Response(JSON.stringify({ ok: true, echo: true }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
              });
            }

            // Mensaje entrante del cliente (fromMe === false)
            const dataType = String(data.type || "text").toLowerCase();
            let kind: MessageKind = "text";
            let mediaUrl: string | null = data.media_url || null;
            let mimeType: string | null = data.media_data?.mimetype || data.mimetype || null;
            let text = String(
              data.message ||
              data.text ||
              data.body ||
              data.media_data?.caption ||
              data.caption ||
              (dataType === "list_response" ? data.data?.selected_row_id || "" : "") ||
              ""
            ).trim();

            if (["image", "audio", "video", "document"].includes(dataType)) {
              kind = dataType as MessageKind;

              // Si D-API no envió URL directa, descargamos el binario base64
              if (!mediaUrl) {
                const downloaded = await dapiDownloadMedia(sessionId, messageId);
                if (downloaded?.base64) {
                  mediaUrl = `data:${downloaded.mimetype || mimeType || "application/octet-stream"};base64,${downloaded.base64}`;
                }
              }

              // Entendimiento de audio por IA (Whisper)
              if (kind === "audio" && mediaUrl) {
                const transcribed = await transcribeIncomingAudio(mediaUrl, mimeType);
                if (transcribed) {
                  text = transcribed;
                }
              }

              // Entendimiento de imagen por IA (comprobantes / catálogos)
              if (kind === "image" && mediaUrl && !text) {
                const desc = await describeIncomingFile(mediaUrl, "image", mimeType, text);
                if (desc) {
                  text = `[Imagen recibida: ${desc}]`;
                }
              }
            }

            const incomingEvent: IncomingMessageEvent = {
              type: "message",
              provider: "dapi",
              connectionExternalId: sessionId,
              externalMessageId: messageId,
              phone,
              contactName,
              direction: "incoming",
              author: "contact",
              kind,
              text,
              occurredAt: body.timestamp || new Date().toISOString(),
              replyToExternalMessageId: data.quotedMessageId || data.quoted_message_id || null,
              attachments: mediaUrl
                ? [
                    {
                      kind: kind as any,
                      externalId: messageId,
                      providerUrl: mediaUrl,
                      mimeType,
                      fileName: data.media_data?.filename || data.filename || null,
                    },
                  ]
                : [],
              raw: body,
            };

            await ingestMessagingEvent({
              companyId: inst.company_id,
              event: incomingEvent,
              externalEventId: `dapi_msg_${messageId}`,
            });

            return new Response(JSON.stringify({ ok: true, processed: true }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          }

          return new Response(JSON.stringify({ ok: true, unhandledEvent: eventName }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch (err: any) {
          console.error("[dapi-webhook] Fatal error:", err);
          return new Response(JSON.stringify({ error: err?.message || "Internal server error" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
