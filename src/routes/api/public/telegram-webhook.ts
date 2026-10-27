import { createFileRoute } from "@tanstack/react-router";

// Webhook público do Telegram (um bot por empresa).
// Normaliza o update para o mesmo shape do webhook interno de WhatsApp
// e reencaminha, reaproveitando toda a pipeline (Conversas, IA, Kanban, CSAT).
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
            .select("instance_name, company_id, webhook_token, instance_token, provider")
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

          // Resolve URL pública do arquivo, quando houver mídia.
          let message: any = { conversation: texto };
          if (botToken) {
            const { tgFileUrl } = await import("@/lib/telegram.server");
            const photo = Array.isArray(msg?.photo) ? msg.photo[msg.photo.length - 1] : null;
            const media = photo || msg?.video || msg?.voice || msg?.audio || msg?.document;
            if (media?.file_id) {
              const fileUrl = await tgFileUrl(botToken, media.file_id);
              if (fileUrl) {
                if (photo) {
                  message = { imageMessage: { mimetype: "image/jpeg", url: fileUrl, caption: texto || undefined } };
                } else if (msg?.video) {
                  message = { videoMessage: { mimetype: msg.video.mime_type || "video/mp4", url: fileUrl, caption: texto || undefined } };
                } else if (msg?.voice || msg?.audio) {
                  const a = msg.voice ?? msg.audio;
                  message = { audioMessage: { mimetype: a.mime_type || "audio/ogg", url: fileUrl } };
                } else {
                  message = {
                    documentMessage: {
                      mimetype: msg.document?.mime_type || "application/octet-stream",
                      url: fileUrl,
                      fileName: msg.document?.file_name || "arquivo",
                      caption: texto || undefined,
                    },
                  };
                }
              }
            }
          }

          if (!texto && message?.conversation !== undefined && !message.conversation) {
            return new Response("no content", { status: 200 });
          }

          const normalized = {
            event: "messages.upsert",
            instance: inst.instance_name,
            data: {
              key: {
                remoteJid: `${chatId}@s.whatsapp.net`,
                fromMe: false,
                id: String(msg?.message_id ?? `tg_${Date.now()}`),
              },
              message,
              pushName: nome,
              messageTimestamp: Number(msg?.date ?? Math.floor(Date.now() / 1000)),
            },
          };

          try {
            const { handleUazapiWebhookInternal } = await import("@/lib/uazapi-webhook.server");
            await handleUazapiWebhookInternal(inst, normalized);
          } catch (e: any) {
            console.warn("[telegram-webhook] handleUazapiWebhookInternal failed", e?.message);
          }

          // Marca o canal do lead e salva o nome do perfil.
          try {
            await (supabaseAdmin as any)
              .from("crm_cards")
              .update({ canal_chat: "telegram", nome })
              .eq("company_id", inst.company_id)
              .eq("numero", String(chatId));
          } catch (e: any) {
            console.warn("[telegram-webhook] update card falhou", e?.message);
          }
        } catch (e: any) {
          console.warn("[telegram-webhook]", e?.message);
        }

        return new Response("ok", { status: 200 });
      },
    },
  },
});
