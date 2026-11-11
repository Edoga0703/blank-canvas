import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  PermanentProviderError,
  PublishContext,
  ProviderResult,
  RetryableProviderError,
  SocialPublisherAdapter,
} from "./types";

export interface TikTokPlatformSettings {
  privacy_level?: "PUBLIC_TO_EVERYONE" | "MUTUAL_FOLLOW_FRIENDS" | "SELF_ONLY";
  disable_duet?: boolean;
  disable_stitch?: boolean;
  disable_comment?: boolean;
  brand_content_toggle?: boolean;
  brand_organic_toggle?: boolean;
  mode?: "direct_post" | "inbox_draft";
}

/**
 * Adaptador oficial TikTok (Content Posting API v2).
 * Suporta Direct Post e envio de rascunho com estado estrito awaiting_creator_post.
 */
export class TikTokPublisherAdapter implements SocialPublisherAdapter {
  platform = "tiktok" as const;

  async validate(context: PublishContext): Promise<{ valid: boolean; error?: string }> {
    if (!context.socialAccountId) {
      return { valid: false, error: "Conta TikTok não selecionada." };
    }

    if (context.mediaType !== "video" || !context.mediaUrl) {
      return { valid: false, error: "O TikTok exige mídia em formato de vídeo para publicação." };
    }

    const caption = context.caption?.trim() || "";
    if (caption.length > 2200) {
      return { valid: false, error: "A legenda do TikTok não pode exceder 2.200 caracteres." };
    }

    return { valid: true };
  }

  async publish(context: PublishContext): Promise<ProviderResult> {
    const { companyId, socialAccountId, caption, mediaUrl, platformSettings } = context;

    if (!socialAccountId) {
      throw new PermanentProviderError("Conta do TikTok não selecionada.", "MISSING_ACCOUNT");
    }

    if (!mediaUrl) {
      throw new PermanentProviderError("URL do vídeo ausente para o TikTok.", "MISSING_MEDIA");
    }

    // 1. Busca conta do TikTok no company_social_accounts isolada por empresa
    const { data: acc, error: accErr } = await (supabaseAdmin as any)
      .from("company_social_accounts")
      .select("id, company_id, network, external_id, username, display_name, credentials, status")
      .eq("id", socialAccountId)
      .eq("company_id", companyId)
      .maybeSingle();

    if (accErr || !acc) {
      throw new PermanentProviderError(
        "Conta do TikTok não encontrada ou sem permissão de acesso nesta empresa.",
        "ACCOUNT_NOT_FOUND"
      );
    }

    const credentials = (acc.credentials || {}) as {
      access_token?: string;
      refresh_token?: string;
      open_id?: string;
      expires_at?: number;
      refresh_expires_at?: number;
    };

    if (!credentials.access_token && !credentials.refresh_token) {
      throw new PermanentProviderError(
        "Credenciais OAuth do TikTok não configuradas. Conecte sua conta do TikTok nas Configurações.",
        "OAUTH_CREDENTIALS_MISSING"
      );
    }

    // 2. Renova token com rotação estrita de refresh_token do TikTok
    let activeToken = credentials.access_token;
    if (
      credentials.refresh_token &&
      (!activeToken || (credentials.expires_at && credentials.expires_at < Date.now() + 60000))
    ) {
      try {
        const refreshRes = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_key: process.env.TIKTOK_CLIENT_KEY || "",
            client_secret: process.env.TIKTOK_CLIENT_SECRET || "",
            grant_type: "refresh_token",
            refresh_token: credentials.refresh_token,
          }),
        });

        if (refreshRes.ok) {
          const resData = await refreshRes.json();
          if (resData?.data?.access_token) {
            activeToken = resData.data.access_token;
            const newRefreshToken = resData.data.refresh_token || credentials.refresh_token;
            const newExpiresAt = Date.now() + (resData.data.expires_in || 86400) * 1000;
            const newRefreshExpiresAt = Date.now() + (resData.data.refresh_expires_in || 31536000) * 1000;

            await (supabaseAdmin as any)
              .from("company_social_accounts")
              .update({
                credentials: {
                  ...credentials,
                  access_token: activeToken,
                  refresh_token: newRefreshToken, // TikTok rotaciona o refresh token!
                  expires_at: newExpiresAt,
                  refresh_expires_at: newRefreshExpiresAt,
                },
                updated_at: new Date().toISOString(),
              })
              .eq("id", socialAccountId)
              .eq("company_id", companyId);
          }
        }
      } catch (refreshErr) {
        console.warn("[TikTokPublisherAdapter] Erro na renovação de token TikTok:", refreshErr);
      }
    }

    if (!activeToken) {
      throw new PermanentProviderError("Sessão TikTok expirada. Reconecte a conta.", "TOKEN_EXPIRED");
    }

    const isInboxDraft = platformSettings?.mode === "inbox_draft";
    const privacyLevel = platformSettings?.privacy_level || "SELF_ONLY";

    const postInfo: Record<string, any> = {
      title: caption || "",
      privacy_level: privacyLevel,
      disable_duet: Boolean(platformSettings?.disable_duet ?? false),
      disable_stitch: Boolean(platformSettings?.disable_stitch ?? false),
      disable_comment: Boolean(platformSettings?.disable_comment ?? false),
      brand_content_toggle: Boolean(platformSettings?.brand_content_toggle ?? false),
      brand_organic_toggle: Boolean(platformSettings?.brand_organic_toggle ?? false),
    };

    try {
      const endpoint = isInboxDraft
        ? "https://open.tiktokapis.com/v2/post/publish/inbox/video/init/"
        : "https://open.tiktokapis.com/v2/post/publish/video/init/";

      const bodyPayload = {
        post_info: postInfo,
        source_info: {
          source: "PULL_FROM_URL",
          video_url: mediaUrl,
        },
      };

      const initRes = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${activeToken}`,
          "Content-Type": "application/json; charset=UTF-8",
        },
        body: JSON.stringify(bodyPayload),
      });

      const resJson = await initRes.json().catch(() => ({}));

      if (!initRes.ok || resJson?.error?.code !== "ok") {
        const errCode = resJson?.error?.code || `HTTP_${initRes.status}`;
        const errMsg = resJson?.error?.message || initRes.statusText;

        if (initRes.status === 401 || initRes.status === 403 || errCode.includes("scope")) {
          throw new PermanentProviderError(
            `Permissão negada no TikTok (${errCode}): ${errMsg}`,
            "TIKTOK_UNAUTHORIZED"
          );
        }

        if (initRes.status === 429) {
          throw new RetryableProviderError(`Cota excedida no TikTok: ${errMsg}`, "TIKTOK_RATE_LIMIT", 120);
        }

        if (initRes.status >= 500) {
          throw new RetryableProviderError(`Servidor do TikTok instável: ${errMsg}`, "TIKTOK_SERVER_ERROR");
        }

        throw new PermanentProviderError(`Falha ao publicar no TikTok: ${errMsg}`, "TIKTOK_INIT_FAILED");
      }

      const publishId = resJson?.data?.publish_id;
      if (!publishId) {
        throw new PermanentProviderError("TikTok não retornou publish_id válido.", "NO_PUBLISH_ID");
      }

      if (isInboxDraft) {
        return {
          state: "awaiting_creator_post",
          externalPostId: publishId,
          details: "Borrador de vídeo enviado ao inbox do criador no TikTok. Aguardando finalização manual no app.",
        };
      }

      return {
        state: "processing",
        providerJobId: publishId,
      };
    } catch (e: any) {
      if (e instanceof PermanentProviderError || e instanceof RetryableProviderError) {
        throw e;
      }
      const msg = e?.message || String(e);
      if (msg.includes("ETIMEDOUT") || msg.includes("ECONNRESET") || msg.includes("fetch failed")) {
        throw new RetryableProviderError(`Conexão instável com TikTok: ${msg}`, "NETWORK_ERROR");
      }
      throw new PermanentProviderError(msg, "TIKTOK_PUBLISH_ERROR");
    }
  }

  async reconcile(
    providerJobId: string,
    companyId: string,
    socialAccountId?: string | null
  ): Promise<ProviderResult> {
    if (!socialAccountId) {
      throw new PermanentProviderError("Conta do TikTok não informada para reconciliação.", "MISSING_ACCOUNT");
    }

    const { data: acc } = await (supabaseAdmin as any)
      .from("company_social_accounts")
      .select("credentials")
      .eq("id", socialAccountId)
      .eq("company_id", companyId)
      .maybeSingle();

    const activeToken = acc?.credentials?.access_token;
    if (!activeToken) {
      throw new PermanentProviderError("Credenciais TikTok ausentes para verificação de status.", "TOKEN_MISSING");
    }

    const statusRes = await fetch("https://open.tiktokapis.com/v2/post/publish/status/fetch/", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${activeToken}`,
        "Content-Type": "application/json; charset=UTF-8",
      },
      body: JSON.stringify({ publish_id: providerJobId }),
    });

    const resJson = await statusRes.json().catch(() => ({}));
    const status = resJson?.data?.status;

    if (status === "PUBLISH_COMPLETE") {
      const publicId = resJson?.data?.publicly_available_post_id?.[0] || providerJobId;
      return {
        state: "published",
        externalPostId: publicId,
        externalUrl: `https://www.tiktok.com/@creator/video/${publicId}`,
      };
    }

    if (status === "FAILED") {
      const reason = resJson?.data?.fail_reason || "Falha informada pelo TikTok";
      return {
        state: "failed_terminal",
        code: "TIKTOK_PROCESSING_FAILED",
        message: reason,
      };
    }

    return {
      state: "processing",
      providerJobId,
    };
  }
}

export const tiktokAdapter = new TikTokPublisherAdapter();
