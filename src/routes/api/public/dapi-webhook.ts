import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { ingestMessagingEvent } from "@/lib/messaging/ingest.server";
import type { IncomingMessageEvent, MessageStatusEvent, MessageKind } from "@/lib/messaging/contracts";
import { dapiDownloadMedia } from "@/lib/dapi.server";
import { transcribeIncomingAudio, describeIncomingFile } from "@/lib/media-understanding.server";

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
            if (rawStatus === "connected" || rawStatus === "open") newStatus = "connected";
            else if (rawStatus === "disconnected" || rawStatus === "logged_out" || rawStatus === "close") newStatus = "disconnected";

            const updates: Record<string, any> = {
              status: newStatus,
              updated_at: new Date().toISOString(),
            };
            if (data.phoneNumber || data.phone || data.numero) {
              updates.numero = String(data.phoneNumber || data.phone || data.numero).replace(/\D/g, "");
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

          // 2. Manejo de estados de entrega y lectura (message.delivered, message.read)
          if (eventName === "message.delivered" || eventName === "message.read") {
            const externalMessageId = String(data.message_id || data.id || body.traceId || "");
            if (externalMessageId) {
              const statusEvent: MessageStatusEvent = {
                type: "status",
                provider: "dapi",
                connectionExternalId: sessionId,
                externalMessageId,
                status: eventName === "message.read" ? "read" : "delivered",
                occurredAt: body.timestamp || new Date().toISOString(),
                phone: String(data.to || data.from || "").replace(/\D/g, ""),
                raw: body,
              };
              await ingestMessagingEvent({
                companyId: inst.company_id,
                event: statusEvent,
                externalEventId: `dapi_status_${eventName}_${externalMessageId}`,
              });
            }
            return new Response(JSON.stringify({ ok: true }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          }

          // 3. Manejo de mensajes (messages.received, messages.sent)
          if (eventName === "messages.received" || eventName === "messages.sent") {
            const isGroup = Boolean(data.isGroup || String(data.from || "").endsWith("@g.us"));
            if (isGroup) {
              return new Response(JSON.stringify({ ok: true, ignored: true, reason: "group" }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
              });
            }

            const messageId = String(data.id || data.message_id || body.traceId || `dapi_${Date.now()}`);
            const fromMe = Boolean(data.fromMe);
            const rawPhone = String(fromMe ? (data.to || "") : (data.from || ""));
            const phone = rawPhone.split("@")[0].replace(/\D/g, "");

            if (!phone) {
              return new Response(JSON.stringify({ ok: true, ignored: true, reason: "no_phone" }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
              });
            }

            // Manejo de eco (fromMe === true): escrito desde celular físico o API
            if (fromMe) {
              // Verifica si el mensaje fue enviado previamente por el sistema / IA
              const { data: existing } = await supabaseAdmin
                .from("mensagens")
                .select("id, autor")
                .eq("company_id", inst.company_id)
                .eq("whatsapp_message_id", messageId)
                .maybeSingle();

              if (!existing) {
                // Mensaje enviado manualmente desde el teléfono físico: registrar y pausar la IA para no competir
                const text = String(data.message || data.text || data.caption || "").trim();
                const nowIso = new Date().toISOString();

                await supabaseAdmin.from("mensagens").insert({
                  company_id: inst.company_id,
                  contato_numero: phone,
                  contato_nome: data.from_name || null,
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
              contactName: data.from_name || null,
              direction: "incoming",
              author: "contact",
              kind,
              text,
              occurredAt: body.timestamp || new Date().toISOString(),
              replyToExternalMessageId: data.quotedMessageId || null,
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
