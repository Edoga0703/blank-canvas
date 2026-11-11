import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  metaPublishFacebookPost,
  metaPublishInstagramPhoto,
  metaPublishInstagramVideo,
} from "@/lib/meta-publish.server";
import {
  PermanentProviderError,
  PublishContext,
  ProviderResult,
  RetryableProviderError,
  SocialPublisherAdapter,
} from "./types";

/**
 * Adaptador de publicação Meta (Instagram & Facebook) seguro e isolado por tenant.
 */
export class MetaPublisherAdapter implements SocialPublisherAdapter {
  platform: "instagram" | "facebook";

  constructor(platform: "instagram" | "facebook") {
    this.platform = platform;
  }

  async validate(context: PublishContext): Promise<{ valid: boolean; error?: string }> {
    if (!context.socialAccountId) {
      return { valid: false, error: "Conta Meta não selecionada para o destino." };
    }

    if (this.platform === "instagram") {
      if (!context.mediaUrl) {
        return { valid: false, error: "Instagram exige mídia (foto ou vídeo) para publicação." };
      }
      if (context.mediaType !== "image" && context.mediaType !== "video") {
        return { valid: false, error: "Formato de mídia não suportado pelo Instagram." };
      }
    } else if (this.platform === "facebook") {
      if (!context.caption && !context.mediaUrl) {
        return { valid: false, error: "Facebook exige texto ou mídia para publicação." };
      }
    }

    return { valid: true };
  }

  async publish(context: PublishContext): Promise<ProviderResult> {
    const { companyId, socialAccountId, caption, mediaUrl, mediaType } = context;

    if (!socialAccountId) {
      throw new PermanentProviderError("Conta Meta não informada.", "MISSING_ACCOUNT");
    }

    // 1. Busca conta verificando rigorosamente company_id
    const { data: acc, error: accErr } = await (supabaseAdmin as any)
      .from("meta_social_accounts")
      .select("id, instance_id, ig_user_id, page_id, company_id")
      .eq("id", socialAccountId)
      .eq("company_id", companyId)
      .maybeSingle();

    if (accErr || !acc) {
      throw new PermanentProviderError("Conta Meta não encontrada ou sem permissão nesta empresa.", "ACCOUNT_NOT_FOUND");
    }

    if (!acc.instance_id) {
      throw new PermanentProviderError("Instância Meta associada não encontrada.", "INSTANCE_NOT_BOUND");
    }

    // 2. Busca token da instância verificando company_id
    const { data: inst, error: instErr } = await (supabaseAdmin as any)
      .from("whatsapp_instances")
      .select("id, instance_token, company_id")
      .eq("id", acc.instance_id)
      .eq("company_id", companyId)
      .maybeSingle();

    if (instErr || !inst?.instance_token) {
      throw new PermanentProviderError("Token de acesso da página/Instagram revogado ou inexistente.", "TOKEN_NOT_FOUND");
    }

    const token = inst.instance_token;

    try {
      if (this.platform === "instagram") {
        if (!acc.ig_user_id) {
          throw new PermanentProviderError("ID de usuário Instagram não vinculado nesta conta Meta.", "IG_USER_ID_MISSING");
        }

        if (mediaType === "video" && mediaUrl) {
          const res = await metaPublishInstagramVideo(token, acc.ig_user_id, mediaUrl, caption);
          const postId = String(res?.id || "ig_published");
          return {
            state: "published",
            externalPostId: postId,
            externalUrl: `https://www.instagram.com/p/${postId}/`,
          };
        } else if (mediaUrl) {
          const res = await metaPublishInstagramPhoto(token, acc.ig_user_id, mediaUrl, caption);
          const postId = String(res?.id || "ig_published");
          return {
            state: "published",
            externalPostId: postId,
            externalUrl: `https://www.instagram.com/p/${postId}/`,
          };
        } else {
          throw new PermanentProviderError("Instagram requer URL de mídia válida.", "MEDIA_REQUIRED");
        }
      } else {
        // Facebook Page Post
        if (!acc.page_id) {
          throw new PermanentProviderError("Página do Facebook não vinculada nesta conta.", "PAGE_ID_MISSING");
        }

        const res = await metaPublishFacebookPost(token, acc.page_id, caption, mediaUrl || undefined);
        const postId = res?.id || res?.post_id || "fb_published";
        return {
          state: "published",
          externalPostId: postId,
          externalUrl: `https://facebook.com/${postId}`,
        };
      }
    } catch (err: any) {
      const msg = err?.message || String(err);

      // Tratamento de erros permanentes vs retryable do Graph API
      if (
        msg.includes("OAuthException") ||
        msg.includes("permissions") ||
        msg.includes("unsupported") ||
        msg.includes("Invalid parameter") ||
        msg.includes("aspect ratio")
      ) {
        throw new PermanentProviderError(msg, "META_PERMANENT_ERROR");
      }

      if (
        msg.includes("rate limit") ||
        msg.includes("ECONNRESET") ||
        msg.includes("ETIMEDOUT") ||
        msg.includes("timeout") ||
        msg.includes("500") ||
        msg.includes("503")
      ) {
        throw new RetryableProviderError(msg, "META_RATE_LIMIT_OR_NETWORK");
      }

      // Default para erro permanente para evitar loops infinitos em bugs de validação
      throw new PermanentProviderError(msg, "META_API_ERROR");
    }
  }
}

export const instagramAdapter = new MetaPublisherAdapter("instagram");
export const facebookAdapter = new MetaPublisherAdapter("facebook");
