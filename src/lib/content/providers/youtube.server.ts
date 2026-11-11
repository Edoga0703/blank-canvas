import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  PermanentProviderError,
  PublishContext,
  ProviderResult,
  RetryableProviderError,
  SocialPublisherAdapter,
} from "./types";

export interface YouTubePlatformSettings {
  title?: string;
  description?: string;
  privacyStatus?: "public" | "private" | "unlisted";
  madeForKids?: boolean;
  containsSyntheticMedia?: boolean;
  tags?: string[];
}

/**
 * Adaptador oficial de publicação do YouTube (YouTube Data API v3).
 * Suporta Shorts, validações COPPA e agendamento via status.publishAt.
 */
export class YouTubePublisherAdapter implements SocialPublisherAdapter {
  platform = "youtube" as const;

  async validate(context: PublishContext): Promise<{ valid: boolean; error?: string }> {
    if (!context.socialAccountId) {
      return { valid: false, error: "Canal do YouTube não selecionado." };
    }

    if (context.mediaType !== "video" || !context.mediaUrl) {
      return { valid: false, error: "O YouTube exige mídia em formato de vídeo para publicação." };
    }

    const title = context.title?.trim() || context.platformSettings?.title?.trim() || "";
    if (!title && !context.caption?.trim()) {
      return { valid: false, error: "O YouTube exige um título de 1 a 100 caracteres." };
    }

    const effectiveTitle = title || context.caption.slice(0, 95).trim();
    if (effectiveTitle.length > 100) {
      return { valid: false, error: "O título do YouTube não pode ultrapassar 100 caracteres." };
    }

    return { valid: true };
  }

  async publish(context: PublishContext): Promise<ProviderResult> {
    const { companyId, socialAccountId, caption, title, mediaUrl, platformSettings, scheduledAt } = context;

    if (!socialAccountId) {
      throw new PermanentProviderError("Canal do YouTube não selecionado.", "MISSING_ACCOUNT");
    }

    if (!mediaUrl) {
      throw new PermanentProviderError("URL do vídeo ausente para o YouTube.", "MISSING_MEDIA");
    }

    // 1. Busca conta do canal no company_social_accounts isolada por empresa
    const { data: acc, error: accErr } = await (supabaseAdmin as any)
      .from("company_social_accounts")
      .select("id, company_id, network, external_id, username, display_name, credentials, status")
      .eq("id", socialAccountId)
      .eq("company_id", companyId)
      .maybeSingle();

    if (accErr || !acc) {
      throw new PermanentProviderError(
        "Conta de YouTube não encontrada ou sem permissão de acesso nesta empresa.",
        "ACCOUNT_NOT_FOUND"
      );
    }

    const credentials = (acc.credentials || {}) as {
      access_token?: string;
      refresh_token?: string;
      expires_at?: number;
      token_type?: string;
    };

    if (!credentials.access_token && !credentials.refresh_token) {
      throw new PermanentProviderError(
        "Credenciais OAuth do YouTube não configuradas. Conecte o canal nas Configurações.",
        "OAUTH_CREDENTIALS_MISSING"
      );
    }

    // Validações de título e COPPA
    const effectiveTitle = (title?.trim() || platformSettings?.title?.trim() || caption?.slice(0, 95).trim() || "Vídeo Capiversa").slice(0, 100);
    const madeForKids = Boolean(platformSettings?.madeForKids ?? false);
    const privacy = platformSettings?.privacyStatus || (scheduledAt ? "private" : "public");

    // Prepara metadados do vídeo
    const snippet: Record<string, any> = {
      title: effectiveTitle,
      description: caption || "",
      tags: Array.isArray(platformSettings?.tags) ? platformSettings.tags : ["Capiversa", "Shorts"],
      categoryId: "22", // People & Blogs
    };

    const statusObj: Record<string, any> = {
      privacyStatus: privacy,
      selfDeclaredMadeForKids: madeForKids,
    };

    // Agendamento nativo do YouTube: vídeo privado com publishAt UTC
    if (scheduledAt) {
      const scheduledDate = new Date(scheduledAt);
      if (scheduledDate.getTime() > Date.now()) {
        statusObj.privacyStatus = "private";
        statusObj.publishAt = scheduledDate.toISOString();
      }
    }

    // Renova access_token se expirado
    let activeToken = credentials.access_token;
    if (credentials.refresh_token && (!activeToken || (credentials.expires_at && credentials.expires_at < Date.now() + 60000))) {
      try {
        const refreshRes = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: process.env.GOOGLE_CLIENT_ID || "",
            client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
            refresh_token: credentials.refresh_token,
            grant_type: "refresh_token",
          }),
        });

        if (refreshRes.ok) {
          const tokenData = await refreshRes.json();
          activeToken = tokenData.access_token;
          const newExpiresAt = Date.now() + (tokenData.expires_in || 3600) * 1000;
          await (supabaseAdmin as any)
            .from("company_social_accounts")
            .update({
              credentials: {
                ...credentials,
                access_token: activeToken,
                expires_at: newExpiresAt,
              },
              updated_at: new Date().toISOString(),
            })
            .eq("id", socialAccountId)
            .eq("company_id", companyId);
        }
      } catch (refreshErr) {
        console.warn("[YouTubePublisherAdapter] Falha ao renovar token OAuth:", refreshErr);
      }
    }

    if (!activeToken) {
      throw new PermanentProviderError("Token do Google OAuth expirado e não renovável.", "TOKEN_EXPIRED");
    }

    try {
      // 2. Inicia upload resumable no YouTube Data API v3
      const initRes = await fetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${activeToken}`,
          "Content-Type": "application/json; charset=UTF-8",
          "X-Upload-Content-Type": "video/mp4",
        },
        body: JSON.stringify({ snippet, status: statusObj }),
      });

      if (!initRes.ok) {
        const errText = await initRes.text();
        if (initRes.status === 401 || initRes.status === 403) {
          throw new PermanentProviderError(`Erro de permissão no canal do YouTube: ${errText}`, "YOUTUBE_UNAUTHORIZED");
        }
        if (initRes.status === 429) {
          throw new RetryableProviderError(`Cota excedida no YouTube: ${errText}`, "YOUTUBE_QUOTA_EXCEEDED", 300);
        }
        throw new PermanentProviderError(`Falha ao iniciar upload no YouTube (${initRes.status}): ${errText}`, "YOUTUBE_INIT_FAILED");
      }

      const uploadUrl = initRes.headers.get("location");
      if (!uploadUrl) {
        throw new PermanentProviderError("YouTube não forneceu URL de sessão de upload.", "NO_UPLOAD_URL");
      }

      // 3. Obtém stream/buffer da mídia duradoura
      const mediaResponse = await fetch(mediaUrl);
      if (!mediaResponse.ok) {
        throw new RetryableProviderError(`Falha temporária ao baixar mídia para envio: ${mediaResponse.statusText}`, "MEDIA_FETCH_FAILED");
      }

      const mediaBuffer = await mediaResponse.arrayBuffer();

      // 4. Envia bytes para o endpoint resumable do YouTube
      const uploadRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": "video/mp4",
          "Content-Length": String(mediaBuffer.byteLength),
        },
        body: mediaBuffer,
      });

      if (!uploadRes.ok) {
        const uploadErr = await uploadRes.text();
        if (uploadRes.status >= 500) {
          throw new RetryableProviderError(`Servidor do YouTube indisponível (${uploadRes.status}): ${uploadErr}`, "YOUTUBE_SERVER_ERROR");
        }
        throw new PermanentProviderError(`Falha na transferência do vídeo ao YouTube: ${uploadErr}`, "YOUTUBE_UPLOAD_FAILED");
      }

      const uploadData = await uploadRes.json();
      const videoId = uploadData?.id;

      if (!videoId) {
        throw new PermanentProviderError("Vídeo processado mas ID não retornado pelo YouTube.", "NO_VIDEO_ID");
      }

      const externalUrl = `https://youtube.com/shorts/${videoId}`;

      if (scheduledAt && statusObj.publishAt) {
        return {
          state: "scheduled_on_provider",
          externalPostId: videoId,
        };
      }

      return {
        state: "published",
        externalPostId: videoId,
        externalUrl,
      };
    } catch (e: any) {
      if (e instanceof PermanentProviderError || e instanceof RetryableProviderError) {
        throw e;
      }
      const msg = e?.message || String(e);
      if (msg.includes("ETIMEDOUT") || msg.includes("ECONNRESET") || msg.includes("fetch failed")) {
        throw new RetryableProviderError(`Conexão instável com YouTube: ${msg}`, "NETWORK_ERROR");
      }
      throw new PermanentProviderError(msg, "YOUTUBE_PUBLISH_ERROR");
    }
  }
}

export const youtubeAdapter = new YouTubePublisherAdapter();
