// src/lib/content/providers/telegram.server.ts
// Adaptador oficial de publicación en canales de Telegram vía MTProto Sidecar (Fase 3)

import {
  PublishContext,
  ProviderResult,
  SocialPublisherAdapter,
  PermanentProviderError,
  RetryableProviderError,
} from "./types";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { publishToTelegramChannel } from "@/lib/telegram/mtproto-client.server";

export const telegramAdapter: SocialPublisherAdapter = {
  platform: "telegram",

  /**
   * 1. Valida el contenido antes de despachar
   */
  async validate(context: PublishContext): Promise<{ valid: boolean; error?: string }> {
    if (!context.caption?.trim() && !context.mediaUrl) {
      return { valid: false, error: "A publicação no Telegram precisa de texto ou mídia." };
    }

    const captionLen = context.caption?.trim().length || 0;
    const hasMedia = Boolean(context.mediaUrl);

    // Límites de Telegram: 4096 caracteres para mensajes de texto, 1024 para leyendas con foto/video
    if (hasMedia && captionLen > 1024) {
      return {
        valid: false,
        error: `O texto da publicação possui ${captionLen} caracteres. O limite máximo para posts com mídia no Telegram é de 1024 caracteres.`,
      };
    }

    if (!hasMedia && captionLen > 4096) {
      return {
        valid: false,
        error: `O texto da publicação possui ${captionLen} caracteres. O limite máximo do Telegram é de 4096 caracteres.`,
      };
    }

    return { valid: true };
  },

  /**
   * 2. Publica en el canal de Telegram mediante la conexión MTProto autorizada
   */
  async publish(context: PublishContext): Promise<ProviderResult> {
    const { companyId, socialAccountId, targetId, postId, caption, mediaUrl, mediaType, platformSettings } = context;

    try {
      // 1. Resolver el canal de Telegram vinculado
      let telegramChannelId: string | null = null;
      let channelDbId: string | null = null;

      if (socialAccountId) {
        const { data: socialAcc } = await (supabaseAdmin as any)
          .from("meta_social_accounts")
          .select("id, external_id, page_id, username, display_name")
          .eq("id", socialAccountId)
          .eq("company_id", companyId)
          .maybeSingle();

        if (socialAcc) {
          telegramChannelId = socialAcc.page_id || socialAcc.external_id;
        }
      }

      if (!telegramChannelId) {
        // Fallback: buscar el primer canal de la empresa
        const { data: fallbackCh } = await (supabaseAdmin as any)
          .from("telegram_channels")
          .select("id, telegram_channel_id")
          .eq("company_id", companyId)
          .limit(1)
          .maybeSingle();

        if (fallbackCh) {
          telegramChannelId = fallbackCh.telegram_channel_id;
          channelDbId = fallbackCh.id;
        }
      } else {
        const { data: chRow } = await (supabaseAdmin as any)
          .from("telegram_channels")
          .select("id")
          .eq("telegram_channel_id", telegramChannelId)
          .eq("company_id", companyId)
          .maybeSingle();

        if (chRow) channelDbId = chRow.id;
      }

      if (!telegramChannelId) {
        throw new PermanentProviderError(
          "Nenhum canal do Telegram vinculado encontrado para esta empresa.",
          "TELEGRAM_CHANNEL_NOT_FOUND",
        );
      }

      // 2. Resolver la conexión MTProto autorizada para este canal
      let connectionId: string | null = null;

      if (channelDbId) {
        const { data: route } = await (supabaseAdmin as any)
          .from("telegram_channel_routes")
          .select("connection_id")
          .eq("channel_id", channelDbId)
          .eq("company_id", companyId)
          .eq("can_post", true)
          .order("preferred", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (route?.connection_id) {
          connectionId = route.connection_id;
        }
      }

      if (!connectionId) {
        // Fallback a cualquier conexión MTProto activa de la empresa
        const { data: conn } = await (supabaseAdmin as any)
          .from("telegram_connections")
          .select("id")
          .eq("company_id", companyId)
          .eq("transport", "mtproto_account")
          .eq("status", "active")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (conn?.id) connectionId = conn.id;
      }

      if (!connectionId) {
        throw new PermanentProviderError(
          "Nenhuma conta Telegram MTProto conectada com permissão de administrador no canal.",
          "TELEGRAM_MTPROTO_CONNECTION_NOT_FOUND",
        );
      }

      // 3. Preparar lista de medios (soporte para carrusel / álbum de 2 a 10 fotos)
      const mediaUrls: string[] = [];
      if (Array.isArray(platformSettings?.mediaUrls) && platformSettings.mediaUrls.length > 0) {
        mediaUrls.push(...platformSettings.mediaUrls);
      } else if (mediaUrl) {
        mediaUrls.push(mediaUrl);
      }

      // 4. Despachar publicación al gateway MTProto
      const result = await publishToTelegramChannel({
        companyId,
        connectionId,
        channelId: telegramChannelId,
        text: caption,
        mediaUrls,
        mediaType,
      });

      if (!result?.success || !result.messageId) {
        throw new RetryableProviderError(
          "A pasarela MTProto não confirmou o identificador da publicação.",
          "TELEGRAM_DISPATCH_UNCONFIRMED",
        );
      }

      const primaryId = result.messageId;
      const allIds = result.messageIds?.length ? result.messageIds : [primaryId];

      // 5. Registrar ítems en telegram_post_items para trazabilidad de álbumes
      if (channelDbId) {
        const itemsToInsert = allIds.map((msgId, idx) => ({
          company_id: companyId,
          target_id: targetId,
          channel_id: channelDbId,
          item_index: idx,
          telegram_message_id: msgId,
          media_group_id: allIds.length > 1 ? primaryId : null,
          published_at: new Date().toISOString(),
        }));

        try {
          await (supabaseAdmin as any).from("telegram_post_items").insert(itemsToInsert);
        } catch (itemErr) {
          console.warn("[telegramAdapter] Aviso al registrar telegram_post_items:", itemErr);
        }
      }

      // 6. Registrar en social_post_identity
      if (socialAccountId) {
        try {
          await (supabaseAdmin as any).from("social_post_identity").upsert(
            {
              company_id: companyId,
              platform: "telegram",
              account_id: socialAccountId,
              external_post_id: primaryId,
              origin: "crm",
              content_post_id: postId,
              published_at: new Date().toISOString(),
              sync_state: "synced",
            },
            { onConflict: "company_id,platform,account_id,external_post_id" },
          );
        } catch (idErr) {
          console.warn("[telegramAdapter] Aviso al registrar social_post_identity:", idErr);
        }
      }

      // 7. Notificar el motor de automatizaciones (Fase 5 Trigger: telegram.channel_post_published)
      try {
        const { dispatchDomainEvent } = await import("@/lib/automations/events.server");
        await dispatchDomainEvent({
          id: crypto.randomUUID(),
          companyId,
          name: "telegram.channel_post_published.v1",
          occurredAt: new Date().toISOString(),
          entity: { type: "post", id: primaryId },
          source: "telegram",
          idempotencyKey: `post_published_${telegramChannelId}_${primaryId}`,
          payload: {
            channelId: telegramChannelId,
            postId: primaryId,
            format: mediaType || (mediaUrls.length ? "photo" : "text"),
            caption,
            url: result.channelUrl,
          },
        }).catch(() => null);
      } catch (evErr) {
        console.warn("[telegramAdapter] Aviso al despachar evento de automatización:", evErr);
      }

      return {
        state: "published",
        externalPostId: primaryId,
        externalUrl: result.channelUrl,
      };
    } catch (err: any) {
      if (err instanceof PermanentProviderError || err instanceof RetryableProviderError) {
        throw err;
      }

      const msg = err?.message || String(err);
      if (/FLOOD_WAIT|timeout|ETIMEDOUT|ECONNRESET|fetch failed/i.test(msg)) {
        throw new RetryableProviderError(`Erro transitório de rede com Telegram: ${msg}`, "TELEGRAM_NETWORK_RETRY", 30);
      }

      throw new PermanentProviderError(`Falha definitiva ao publicar no Telegram: ${msg}`, "TELEGRAM_PUBLISH_FAILED");
    }
  },
};
