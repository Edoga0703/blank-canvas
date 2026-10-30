import { createFileRoute } from "@tanstack/react-router";

// Webhook público do Telegram (um bot por empresa).
// Despacha diretamente para o motor unificado de mensageria e automações.
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
          const { data: inst } = await (supabaseAdmin as any)
            .from("whatsapp_instances")
            .select("id, instance_name, company_id, webhook_token, instance_token, provider")
            .eq("webhook_token", token)
            .eq("provider", "telegram")
            .maybeSingle();
          if (!inst) return new Response("unknown instance", { status: 200 });

          const msg = update?.message ?? update?.edited_message;
          const chatId = msg?.chat?.id;
          if (!chatId) return new Response("ok", { status: 200 });

          const from = msg?.from ?? {};
          const nome =
            [from.first_name, from.last_name].filter(Boolean).join(" ") ||
            (from.username ? `@${from.username}` : `Telegram ${String(chatId).slice(-4)}`);

          const texto: string = msg?.text ?? msg?.caption ?? "";
          const botToken = inst.instance_token as string | null;

          let mediaUrl: string | null = null;
          let mediaType: string = "text";
          if (botToken) {
            const { tgFileUrl } = await import("@/lib/telegram.server");
            const photo = Array.isArray(msg?.photo) ? msg.photo[msg.photo.length - 1] : null;
            const media = photo || msg?.video || msg?.voice || msg?.audio || msg?.document;
            if (media?.file_id) {
              const fileUrl = await tgFileUrl(botToken, media.file_id);
              if (fileUrl) {
                mediaUrl = fileUrl;
                if (photo) mediaType = "image";
                else if (msg?.video) mediaType = "video";
                else if (msg?.voice || msg?.audio) mediaType = "audio";
                else mediaType = "document";
              }
            }
          }

          if (!texto && !mediaUrl) {
            return new Response("no content", { status: 200 });
          }

          const providerMessageId = String(msg?.message_id ?? `tg_${Date.now()}`);

          // 1. Persistir mensagem no banco
          const { data: insertedMsg } = await (supabaseAdmin as any)
            .from("mensagens")
            .insert({
              company_id: inst.company_id,
              numero: String(chatId),
              texto: texto || (mediaUrl ? "[Mídia]" : ""),
              midia_url: mediaUrl,
              midia_tipo: mediaUrl ? mediaType : null,
              direcao: "entrada",
              whatsapp_message_id: providerMessageId,
              canal_chat: "telegram",
              autor: "contato",
              status_envio: "recebido",
              created_at: new Date().toISOString(),
            })
            .select("id")
            .maybeSingle();

          // 2. Atualizar ou criar card no CRM
          const { data: existingCard } = await (supabaseAdmin as any)
            .from("crm_cards")
            .select("id, stage_id")
            .eq("company_id", inst.company_id)
            .eq("numero", String(chatId))
            .maybeSingle();

          let cardId = existingCard?.id || null;
          if (!existingCard) {
            const { data: newCard } = await (supabaseAdmin as any)
              .from("crm_cards")
              .insert({
                company_id: inst.company_id,
                numero: String(chatId),
                nome,
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
                nome: nome || undefined,
                ultima_mensagem: texto || "[Mídia]",
                ultima_em: new Date().toISOString(),
              })
              .eq("id", existingCard.id);
          }

          // 3. Despachar para o motor de automatizações multicanal
          if (insertedMsg?.id) {
            const { recordInboundAutomationEvent } = await import("@/lib/automations/inbound-events.server");
            await recordInboundAutomationEvent({
              companyId: inst.company_id,
              messageId: insertedMsg.id,
              source: "telegram",
              instanceId: inst.id,
              payload: {
                cardId,
                messageId: insertedMsg.id,
                phone: String(chatId),
                text: texto || "",
                channel: "telegram",
                instanceId: inst.id,
                provider: "telegram",
                externalConversationId: String(chatId),
                author: "contact",
                direction: "incoming",
                kind: mediaUrl ? mediaType : "text",
                isGroup: Boolean(msg?.chat?.type === "group" || msg?.chat?.type === "supergroup"),
                stageId: existingCard?.stage_id || null,
                responderEmAudio: false,
                isAudioMessage: false,
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
