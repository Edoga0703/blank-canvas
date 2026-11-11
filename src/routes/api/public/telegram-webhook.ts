import { createFileRoute } from "@tanstack/react-router";

// Webhook público do Telegram (Telegram Business + Bot API multi-tenant).
// Despacha diretamente para o motor unificado de mensageria, CRM e automações,
// com vault de mídia isolado no Cloudflare R2 (capiversa-media) sem expor tokens de bot.
export const Route = createFileRoute("/api/public/telegram-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url);
        const token = url.searchParams.get("t") ?? "";
        const secret = request.headers.get("x-telegram-bot-api-secret-token") ?? "";
        if (!token || (secret && secret !== token)) {
          return new Response("Unauthorized", { status: 401 });
        }

        let update: any = null;
        try {
          update = await request.json();
        } catch {
          return new Response("Bad payload", { status: 400 });
        }

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          // 1. Resolução dual de instância (whatsapp_instances + telegram_connections)
          const { data: inst } = await (supabaseAdmin as any)
            .from("whatsapp_instances")
            .select("id, instance_name, company_id, webhook_token, instance_token, provider")
            .eq("webhook_token", token)
            .eq("provider", "telegram")
            .maybeSingle();

          const { data: tc } = await (supabaseAdmin as any)
            .from("telegram_connections")
            .select("id, company_id, transport, status, secret_ref, telegram_actor_id")
            .eq("webhook_endpoint_key", token)
            .maybeSingle();

          if (!inst && !tc) return new Response("unknown instance", { status: 200 });

          const companyId = inst?.company_id || tc?.company_id;
          const botToken = (inst?.instance_token || tc?.secret_ref) as string | null;
          const connectionId = tc?.id || null;
          const instanceId = inst?.id || null;

          // 2. Conexão Telegram Business estabelecida ou revogada
          if (update?.business_connection) {
            const bc = update.business_connection;
            const businessConnectionId = String(bc.id);
            const businessUserId = String(bc.user?.id);
            const canReply = Boolean(bc.can_reply);
            const isEnabled = Boolean(bc.is_enabled);

            if (connectionId) {
              await (supabaseAdmin as any).from("telegram_business_bindings").upsert(
                {
                  company_id: companyId,
                  connection_id: connectionId,
                  business_connection_id: businessConnectionId,
                  business_user_id: businessUserId,
                  can_reply: canReply,
                  is_active: isEnabled,
                  rights: {
                    user: bc.user,
                    date: bc.date,
                    can_reply: canReply,
                    is_enabled: isEnabled,
                  },
                  updated_at: new Date().toISOString(),
                },
                { onConflict: "connection_id,business_connection_id" },
              );
            }
            return new Response("ok", { status: 200 });
          }

          // 3. Mensagens apagadas no Telegram Business
          if (update?.deleted_business_messages) {
            const dbm = update.deleted_business_messages;
            const messageIds = (dbm.message_ids ?? []).map(String);
            const chatId = String(dbm.chat?.id ?? "");
            if (messageIds.length > 0 && chatId) {
              await (supabaseAdmin as any)
                .from("mensagens")
                .update({ deletado_em: new Date().toISOString() })
                .eq("company_id", companyId)
                .eq("numero", chatId)
                .in("whatsapp_message_id", messageIds);
            }
            return new Response("ok", { status: 200 });
          }

          // 4. Mensagens editadas (Business ou Diretas)
          const editedMsg = update?.edited_business_message ?? update?.edited_message;
          if (editedMsg) {
            const chatId = String(editedMsg.chat?.id ?? "");
            const providerMessageId = String(editedMsg.message_id ?? "");
            const newText = editedMsg.text ?? editedMsg.caption ?? "";
            if (chatId && providerMessageId) {
              await (supabaseAdmin as any)
                .from("mensagens")
                .update({
                  texto: newText,
                  editado_em: new Date().toISOString(),
                })
                .eq("company_id", companyId)
                .eq("numero", chatId)
                .eq("whatsapp_message_id", providerMessageId);
            }
            return new Response("ok", { status: 200 });
          }

          // 5. Mensagens recebidas (Business Message ou Bot Direct)
          const isBusiness = Boolean(update?.business_message);
          const msg = update?.business_message ?? update?.message;
          if (!msg) return new Response("ok", { status: 200 });

          const chatId = String(msg.chat?.id ?? "");
          if (!chatId) return new Response("ok", { status: 200 });

          const businessConnectionId = msg.business_connection_id ? String(msg.business_connection_id) : null;

          // Detecção de eco do atendente: se a mensagem foi enviada pelo dono da conta Business pelo app oficial
          let isMerchantEcho = false;
          if (isBusiness && businessConnectionId) {
            const { data: binding } = await (supabaseAdmin as any)
              .from("telegram_business_bindings")
              .select("business_user_id, can_reply")
              .eq("business_connection_id", businessConnectionId)
              .maybeSingle();

            if (binding?.business_user_id && String(msg.from?.id) === String(binding.business_user_id)) {
              isMerchantEcho = true;
            }
          }

          // 6. Extração de mídia com R2 Media Vault Pipeline
          let mediaFileId: string | null = null;
          let mediaType: string = "text";
          let mediaMime: string | null = null;
          let mediaFileName: string | null = null;

          if (Array.isArray(msg.photo) && msg.photo.length > 0) {
            const photo = msg.photo[msg.photo.length - 1];
            mediaFileId = photo.file_id;
            mediaType = "image";
            mediaMime = "image/jpeg";
            mediaFileName = `photo_${photo.file_id.slice(-8)}.jpg`;
          } else if (msg.video) {
            mediaFileId = msg.video.file_id;
            mediaType = "video";
            mediaMime = msg.video.mime_type || "video/mp4";
            mediaFileName = msg.video.file_name || `video_${msg.video.file_id.slice(-8)}.mp4`;
          } else if (msg.voice) {
            mediaFileId = msg.voice.file_id;
            mediaType = "audio";
            mediaMime = msg.voice.mime_type || "audio/ogg";
            mediaFileName = `voice_${msg.voice.file_id.slice(-8)}.ogg`;
          } else if (msg.audio) {
            mediaFileId = msg.audio.file_id;
            mediaType = "audio";
            mediaMime = msg.audio.mime_type || "audio/mpeg";
            mediaFileName = msg.audio.file_name || `audio_${msg.audio.file_id.slice(-8)}.mp3`;
          } else if (msg.document) {
            mediaFileId = msg.document.file_id;
            mediaType = "document";
            mediaMime = msg.document.mime_type || "application/octet-stream";
            mediaFileName = msg.document.file_name || `doc_${msg.document.file_id.slice(-8)}`;
          } else if (msg.sticker) {
            mediaFileId = msg.sticker.file_id;
            mediaType = "sticker";
            mediaMime = "image/webp";
            mediaFileName = `sticker_${msg.sticker.file_id.slice(-8)}.webp`;
          }

          const messageUuid = crypto.randomUUID();
          let mediaProxiedUrl: string | null = null;
          let storedAttachment: any = null;

          if (mediaFileId && botToken) {
            const { tgDownloadAndStoreMedia } = await import("@/lib/telegram.server");
            const stored = await tgDownloadAndStoreMedia({
              botToken,
              fileId: mediaFileId,
              companyId,
              fileName: mediaFileName,
              mimeType: mediaMime,
            });

            if (stored) {
              const { generateMediaToken } = await import("@/routes/api/public/chat-media");
              const { sig, exp } = generateMediaToken(messageUuid);
              mediaProxiedUrl = `/api/public/chat-media?id=${messageUuid}&sig=${sig}&exp=${exp}`;
              storedAttachment = stored;
            }
          }

          const texto: string = msg.text ?? msg.caption ?? "";
          if (!texto && !mediaProxiedUrl && !mediaFileId) {
            return new Response("no content", { status: 200 });
          }

          const from = msg.from ?? {};
          const senderName =
            [from.first_name, from.last_name].filter(Boolean).join(" ") ||
            (from.username ? `@${from.username}` : `Telegram ${String(chatId).slice(-4)}`);
          const providerMessageId = String(msg.message_id ?? `tg_${Date.now()}`);

          const direcao = isMerchantEcho ? "saida" : "entrada";
          const autor = isMerchantEcho ? "atendente" : "contato";
          const statusEnvio = isMerchantEcho ? "enviado" : "recebido";

          // 7. Persistir mensagem no banco
          const { data: insertedMsg } = await (supabaseAdmin as any)
            .from("mensagens")
            .insert({
              id: messageUuid,
              company_id: companyId,
              instance_id: instanceId,
              numero: String(chatId),
              texto: texto || (mediaProxiedUrl ? "[Mídia]" : ""),
              midia_url: mediaProxiedUrl,
              midia_tipo: mediaProxiedUrl ? mediaType : null,
              midia_mime: storedAttachment?.mimeType || mediaMime,
              midia_nome: storedAttachment?.fileName || mediaFileName,
              direcao,
              whatsapp_message_id: providerMessageId,
              canal_chat: "telegram",
              autor,
              status_envio: statusEnvio,
              created_at: new Date().toISOString(),
            })
            .select("id")
            .maybeSingle();

          // 8. Se houve upload de mídia para R2, vincular em message_attachments
          if (storedAttachment) {
            await (supabaseAdmin as any).from("message_attachments").insert({
              company_id: companyId,
              mensagem_id: messageUuid,
              attachment_key: storedAttachment.sha256,
              kind: mediaType,
              storage_key: storedAttachment.storageKey,
              storage_url: storedAttachment.storageUrl,
              mime_type: storedAttachment.mimeType,
              file_name: storedAttachment.fileName,
              size_bytes: storedAttachment.sizeBytes,
              sha256: storedAttachment.sha256,
              storage_account_id: storedAttachment.storageAccountId ?? null,
            });
          }

          // 9. Atualizar ou criar card no CRM
          const { data: existingCard } = await (supabaseAdmin as any)
            .from("crm_cards")
            .select("id, stage_id")
            .eq("company_id", companyId)
            .eq("numero", String(chatId))
            .maybeSingle();

          let cardId = existingCard?.id || null;
          if (!existingCard) {
            const { data: newCard } = await (supabaseAdmin as any)
              .from("crm_cards")
              .insert({
                company_id: companyId,
                numero: String(chatId),
                nome: senderName,
                canal_chat: "telegram",
                canal_entrada: "telegram",
                ultima_mensagem: texto || "[Mídia]",
                ultima_em: new Date().toISOString(),
              })
              .select("id, stage_id")
              .maybeSingle();
            cardId = newCard?.id || null;
          } else {
            await (supabaseAdmin as any)
              .from("crm_cards")
              .update({
                canal_chat: "telegram",
                nome: isMerchantEcho ? undefined : (senderName || undefined),
                ultima_mensagem: texto || "[Mídia]",
                ultima_em: new Date().toISOString(),
              })
              .eq("id", existingCard.id);
          }

          // 10. Despachar para o motor de automatizações multicanal (somente entradas reais de cliente)
          if (!isMerchantEcho && insertedMsg?.id) {
            const { recordInboundAutomationEvent } = await import("@/lib/automations/inbound-events.server");
            await recordInboundAutomationEvent({
              companyId,
              messageId: insertedMsg.id,
              source: "telegram",
              instanceId: instanceId || undefined,
              payload: {
                cardId,
                messageId: insertedMsg.id,
                phone: String(chatId),
                text: texto || "",
                channel: "telegram",
                instanceId: instanceId || "",
                provider: "telegram",
                externalConversationId: String(chatId),
                author: "contact",
                direction: "incoming",
                kind: mediaProxiedUrl ? mediaType : "text",
                isGroup: Boolean(msg.chat?.type === "group" || msg.chat?.type === "supergroup"),
                stageId: existingCard?.stage_id || null,
                responderEmAudio: false,
                isAudioMessage: mediaType === "audio",
              },
            });
          }
        } catch (e: any) {
          console.warn("[telegram-webhook]", e?.message);
        }

        return new Response("ok", { status: 200 });
      },
    },
  },
});
