// src/lib/telegram/mtproto-client.server.ts
// Cliente de comunicación con la pasarela MTProto Sidecar desacoplada de Cloudflare Nitro

import type {
  TelegramChannelInfo,
  TelegramQrSessionStatus,
} from "./contracts";

function getGatewayConfig() {
  const url = process.env["TELEGRAM_GATEWAY_URL"] || "";
  const secret =
    process.env["TELEGRAM_GATEWAY_SECRET"] ||
    process.env["GATEWAY_SECRET"] ||
    "";
  return { url: url.replace(/\/+$/, ""), secret };
}

function isSimulationAllowed(): boolean {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env["ALLOW_TELEGRAM_SIMULATION"] === "true"
  );
}

// In-memory simulation registry for development / environments where the sidecar is not yet spawned
interface SimSession {
  sessionId: string;
  companyId: string;
  connectionId: string;
  createdAt: number;
  expiresAt: string;
  status: TelegramQrSessionStatus;
  actorId?: string;
  username?: string;
  displayName?: string;
}

const simSessions = new Map<string, SimSession>();

export interface StartQrResult {
  sessionId: string;
  connectionId: string;
  qrLink: string;
  expiresAt: string;
  isSimulation: boolean;
}

export interface CheckQrResult {
  sessionId: string;
  status: TelegramQrSessionStatus;
  qrLink?: string;
  expiresAt?: string;
  actorId?: string | null;
  username?: string | null;
  displayName?: string | null;
  error?: string | null;
}

/**
 * 1. Inicia una sesión de handshake QR en la pasarela MTProto
 */
export async function startQrAuth(companyId: string, connectionId: string): Promise<StartQrResult> {
  const { url, secret } = getGatewayConfig();

  if (url) {
    try {
      const resp = await fetch(`${url}/api/gateway/start-qr`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${secret}`,
          "x-gateway-secret": secret,
        },
        body: JSON.stringify({ companyId, connectionId }),
        signal: AbortSignal.timeout(6000),
      });

      if (resp.ok) {
        const data = await resp.json();
        if (data.isSimulation && !isSimulationAllowed()) {
          throw new Error("A pasarela MTProto respondeu em simulação, o que não é permitido em produção.");
        }
        return {
          sessionId: data.sessionId,
          connectionId: data.connectionId || connectionId,
          qrLink: data.qrLink,
          expiresAt: data.expiresAt,
          isSimulation: Boolean(data.isSimulation),
        };
      }
      const errBody = await resp.json().catch(() => ({}));
      throw new Error(errBody.error || `Pasarela MTProto retornou HTTP ${resp.status}`);
    } catch (netErr: any) {
      if (!isSimulationAllowed()) {
        throw new Error(`Falha ao contactar a pasarela MTProto (${url}): ${netErr?.message || netErr}`);
      }
      console.warn("[MTProto Gateway] No se pudo contactar el gateway externo:", netErr);
    }
  }

  if (!isSimulationAllowed()) {
    throw new Error("TELEGRAM_GATEWAY_URL não configurada no servidor. O microserviço MTProto precisa estar ativo.");
  }

  // Fallback seguro de simulação exclusivo para preview / dev controlado
  const sessionId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 60 * 1000).toISOString();
  const mockToken = Buffer.from(`${sessionId}:${Date.now()}`).toString("base64url");
  const qrLink = `tg://login?token=${mockToken}`;

  simSessions.set(sessionId, {
    sessionId,
    companyId,
    connectionId,
    createdAt: Date.now(),
    expiresAt,
    status: "waiting_qr",
  });

  return {
    sessionId,
    connectionId,
    qrLink,
    expiresAt,
    isSimulation: true,
  };
}

/**
 * 2. Consulta el estado de autenticación QR
 */
export async function checkQrAuthStatus(companyId: string, sessionId: string): Promise<CheckQrResult> {
  const { url, secret } = getGatewayConfig();

  if (url) {
    try {
      const resp = await fetch(`${url}/api/gateway/qr-status/${encodeURIComponent(sessionId)}`, {
        headers: {
          Authorization: `Bearer ${secret}`,
          "x-gateway-secret": secret,
        },
        signal: AbortSignal.timeout(4000),
      });

      if (resp.ok) {
        return (await resp.json()) as CheckQrResult;
      }
    } catch (err: any) {
      if (!isSimulationAllowed()) {
        return { sessionId, status: "expired", error: "Pasarela MTProto inacessível ou offline." };
      }
    }
  }

  if (!isSimulationAllowed()) {
    return { sessionId, status: "expired", error: "TELEGRAM_GATEWAY_URL não configurada no servidor." };
  }

  const sim = simSessions.get(sessionId);
  if (!sim) {
    return { sessionId, status: "expired" };
  }

  const elapsed = Date.now() - sim.createdAt;
  if (sim.status === "waiting_qr") {
    if (elapsed > 60 * 1000) {
      sim.status = "expired";
    }
  }

  return {
    sessionId: sim.sessionId,
    status: sim.status,
    expiresAt: sim.expiresAt,
    actorId: sim.actorId || null,
    username: sim.username || null,
    displayName: sim.displayName || null,
  };
}

/**
 * 3. Envía la contraseña de verificación en dos pasos (2FA)
 */
export async function submit2FaPassword(
  companyId: string,
  sessionId: string,
  passwordOneTime: string,
): Promise<{ success: boolean; status: TelegramQrSessionStatus }> {
  const { url, secret } = getGatewayConfig();

  if (url) {
    try {
      const resp = await fetch(`${url}/api/gateway/complete-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${secret}`,
          "x-gateway-secret": secret,
        },
        body: JSON.stringify({ companyId, sessionId, passwordOneTime }),
        signal: AbortSignal.timeout(6000),
      });

      if (resp.ok) {
        const data = await resp.json();
        return { success: true, status: data.status || "authorized" };
      }
      const errBody = await resp.json().catch(() => ({}));
      throw new Error(errBody.error || "Senha 2FA rejeitada pelo Telegram");
    } catch (err: any) {
      if (!isSimulationAllowed()) {
        throw new Error(`Falha ao submeter 2FA no gateway MTProto: ${err?.message || err}`);
      }
    }
  }

  if (!isSimulationAllowed()) {
    throw new Error("TELEGRAM_GATEWAY_URL não configurada no servidor para 2FA.");
  }

  const sim = simSessions.get(sessionId);
  if (sim) {
    sim.status = "authorized";
    sim.actorId = "874521369";
    sim.username = "empresa_marketing_oficial";
    sim.displayName = "Capiversa Canais Brasil";
  }

  return { success: true, status: "authorized" };
}

/**
 * 4. Obtiene la lista de canales administrables por la cuenta conectada
 */
export async function fetchAdminChannels(
  companyId: string,
  connectionId: string,
): Promise<TelegramChannelInfo[]> {
  const { url, secret } = getGatewayConfig();

  if (url) {
    try {
      const resp = await fetch(`${url}/api/gateway/channels/${encodeURIComponent(connectionId)}`, {
        headers: {
          Authorization: `Bearer ${secret}`,
          "x-gateway-secret": secret,
        },
        signal: AbortSignal.timeout(8000),
      });

      if (resp.ok) {
        const data = await resp.json();
        if (Array.isArray(data?.channels)) {
          return data.channels;
        }
      }
      const errBody = await resp.json().catch(() => ({}));
      throw new Error(errBody.error || `Gateway retornou status ${resp.status}`);
    } catch (err: any) {
      if (!isSimulationAllowed()) {
        throw new Error(`Falha ao obter canais da pasarela MTProto: ${err?.message || err}`);
      }
    }
  }

  if (!isSimulationAllowed()) {
    throw new Error("TELEGRAM_GATEWAY_URL não configurada no servidor. Pasarela MTProto offline.");
  }

  // Canales simulados de ejemplo exclusivos para desarrollo/staging local controlado
  return [
    {
      telegramChannelId: "-1002345678901",
      title: "Ofertas e Promoções VIP",
      username: "capiversa_ofertas",
      visibility: "public",
      discussionChatId: "-1002345678999",
      memberCount: 2450,
      canPost: true,
      canEdit: true,
      canDelete: true,
      canManageDiscussion: true,
    },
    {
      telegramChannelId: "-1002345678902",
      title: "Novidades & Lançamentos Exclusivos",
      username: "capiversa_novidades",
      visibility: "public",
      discussionChatId: null,
      memberCount: 890,
      canPost: true,
      canEdit: true,
      canDelete: false,
      canManageDiscussion: false,
    },
    {
      telegramChannelId: "-1002345678903",
      title: "Comunidade Restrita de Membros",
      username: null,
      visibility: "private",
      discussionChatId: null,
      memberCount: 175,
      canPost: true,
      canEdit: true,
      canDelete: true,
      canManageDiscussion: false,
    },
  ];
}

/**
 * 5. Cierra la sesión MTProto en el gateway
 */
export async function logoutGatewaySession(companyId: string, connectionId: string): Promise<boolean> {
  const { url, secret } = getGatewayConfig();

  if (url) {
    try {
      await fetch(`${url}/api/gateway/logout/${encodeURIComponent(connectionId)}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secret}`,
          "x-gateway-secret": secret,
        },
        signal: AbortSignal.timeout(4000),
      });
    } catch {
      /* best-effort */
    }
  }

  return true;
}

export interface PublishChannelOptions {
  companyId: string;
  connectionId: string;
  channelId: string;
  text?: string;
  mediaUrls?: string[];
  mediaType?: "video" | "image" | "carousel" | "text";
  pinMessage?: boolean;
}

export interface PublishChannelResult {
  success: boolean;
  messageId: string;
  messageIds: string[];
  channelUrl: string;
  isSimulation?: boolean;
}

export interface BackfillChannelOptions {
  companyId: string;
  connectionId: string;
  channelId: string;
  limit?: number;
  beforeMessageId?: string;
}

export interface BackfillMessage {
  id: string;
  text: string;
  date: string;
  mediaType: string;
  views: number;
  forwards: number;
  replies: number;
  permalink?: string;
}

export interface BackfillChannelResult {
  posts: BackfillMessage[];
  hasMore: boolean;
  nextCursor?: string | null;
  isSimulation?: boolean;
}

/**
 * 6. Publica contenido (texto, imagen, video o álbum) en un canal de Telegram vía MTProto
 */
export async function publishToTelegramChannel(
  options: PublishChannelOptions,
): Promise<PublishChannelResult> {
  const { url, secret } = getGatewayConfig();

  if (url) {
    try {
      const resp = await fetch(`${url}/api/gateway/publish`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${secret}`,
          "x-gateway-secret": secret,
        },
        body: JSON.stringify(options),
        signal: AbortSignal.timeout(25000),
      });

      if (resp.ok) {
        const data = (await resp.json()) as PublishChannelResult;
        if (data.isSimulation && !isSimulationAllowed()) {
          throw new Error("A pasarela MTProto respondeu em modo de simulação. Publicação cancelada em produção.");
        }
        return data;
      }
      const errJson = await resp.json().catch(() => ({}));
      throw new Error(errJson.error || `Gateway returned HTTP ${resp.status}`);
    } catch (err: any) {
      if (!isSimulationAllowed()) {
        throw err;
      }
      console.warn("[publishToTelegramChannel] Error en gateway remoto, evaluando contingencia:", err);
    }
  }

  if (!isSimulationAllowed()) {
    throw new Error("TELEGRAM_GATEWAY_URL não configurada no servidor. Pasarela MTProto offline.");
  }

  // Fallback seguro de simulación exclusivo para desarrollo / staging local
  const cleanSuffix = options.channelId.replace(/^-100/, "");
  const mockMsgId = String(10000 + Math.floor(Math.random() * 90000));
  const urls = options.mediaUrls || [];
  const isAlbum = options.mediaType === "carousel" || urls.length > 1;
  const mockIds = isAlbum ? urls.map((_, i) => String(Number(mockMsgId) + i)) : [mockMsgId];

  return {
    success: true,
    messageId: mockMsgId,
    messageIds: mockIds,
    channelUrl: `https://t.me/c/${cleanSuffix}/${mockMsgId}`,
    isSimulation: true,
  };
}

/**
 * 7. Importa publicaciones históricas paginadas de un canal
 */
export async function fetchChannelBackfill(
  options: BackfillChannelOptions,
): Promise<BackfillChannelResult> {
  const { url, secret } = getGatewayConfig();

  if (url) {
    try {
      const resp = await fetch(`${url}/api/gateway/backfill`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${secret}`,
          "x-gateway-secret": secret,
        },
        body: JSON.stringify(options),
        signal: AbortSignal.timeout(15000),
      });

      if (resp.ok) {
        const data = (await resp.json()) as BackfillChannelResult;
        if (data.isSimulation && !isSimulationAllowed()) {
          return { posts: [], hasMore: false, nextCursor: null, isSimulation: false };
        }
        return data;
      }
    } catch (err: any) {
      if (!isSimulationAllowed()) {
        console.warn("[fetchChannelBackfill] Erro ao consultar gateway MTProto:", err?.message || err);
        return { posts: [], hasMore: false, nextCursor: null, isSimulation: false };
      }
    }
  }

  if (!isSimulationAllowed()) {
    return { posts: [], hasMore: false, nextCursor: null, isSimulation: false };
  }

  // Fallback de simulación para desarrollo local
  const now = Date.now();
  const cleanSuffix = options.channelId.replace(/^-100/, "");
  const count = Math.min(options.limit || 20, 50);

  const mockPosts: BackfillMessage[] = Array.from({ length: count }).map((_, i) => {
    const id = String(1000 + i);
    const postDate = new Date(now - i * 3600 * 24 * 1000).toISOString();
    const isMedia = i % 3 !== 0;
    return {
      id,
      text: `Publicação histórica simulada #${id} do canal oficial da empresa.`,
      date: postDate,
      mediaType: isMedia ? (i % 2 === 0 ? "photo" : "video") : "text",
      views: 320 + i * 50,
      forwards: 14 + i * 3,
      replies: 8 + i,
      permalink: `https://t.me/c/${cleanSuffix}/${id}`,
    };
  });

  return {
    posts: mockPosts,
    hasMore: false,
    nextCursor: null,
    isSimulation: true,
  };
}

export interface TelegramPostComment {
  id: string;
  text: string;
  date: string;
  authorId: string;
  authorName: string;
  authorUsername: string | null;
  replyToMsgId: string | null;
}

export interface FetchPostCommentsOptions {
  companyId: string;
  connectionId: string;
  channelId: string;
  messageId: string;
  limit?: number;
  offsetId?: string;
}

export interface FetchPostCommentsResult {
  comments: TelegramPostComment[];
  totalCount: number;
  hasMore: boolean;
  isSimulation?: boolean;
}

export interface ReplyPostCommentOptions {
  companyId: string;
  connectionId: string;
  channelId: string;
  messageId: string;
  commentId?: string;
  text: string;
}

export interface ReplyPostCommentResult {
  success: boolean;
  commentId?: string;
  date?: string;
  isSimulation?: boolean;
  error?: string;
}

/**
 * 8. Obtiene los comentarios de un hilo de discusión vinculado a una publicación de canal
 */
export async function fetchPostComments(
  options: FetchPostCommentsOptions,
): Promise<FetchPostCommentsResult> {
  const { url, secret } = getGatewayConfig();

  if (url) {
    try {
      const resp = await fetch(`${url}/api/gateway/comments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${secret}`,
          "x-gateway-secret": secret,
        },
        body: JSON.stringify(options),
        signal: AbortSignal.timeout(10000),
      });

      if (resp.ok) {
        const data = (await resp.json()) as FetchPostCommentsResult;
        if (data.isSimulation && !isSimulationAllowed()) {
          throw new Error("A pasarela MTProto respondeu em modo de simulação.");
        }
        return data;
      }
      const errJson = await resp.json().catch(() => ({}));
      throw new Error(errJson.error || `Gateway returned HTTP ${resp.status}`);
    } catch (err: any) {
      if (!isSimulationAllowed()) {
        throw new Error(`Pasarela MTProto offline ou inacessível para carregar comentários: ${err?.message || err}`);
      }
    }
  }

  if (!isSimulationAllowed()) {
    throw new Error("TELEGRAM_GATEWAY_URL não configurada no servidor. Pasarela MTProto offline.");
  }

  // Fallback seguro de simulación exclusivo para desarrollo local
  const mockComments: TelegramPostComment[] = [
    {
      id: "2001",
      text: "Qual o valor desse produto com frete para São Paulo?",
      date: new Date(Date.now() - 3600 * 1000 * 2).toISOString(),
      authorId: "987654321",
      authorName: "Carlos Silva",
      authorUsername: "carlossilva_sp",
      replyToMsgId: null,
    },
    {
      id: "2002",
      text: "Ainda tem disponível a pronta entrega? Gostaria de fechar agora.",
      date: new Date(Date.now() - 3600 * 1000).toISOString(),
      authorId: "987654322",
      authorName: "Mariana Costa",
      authorUsername: "mari_costa",
      replyToMsgId: null,
    },
    {
      id: "2003",
      text: "Excelente! Acabei de recomendar para o meu sócio.",
      date: new Date(Date.now() - 1800 * 1000).toISOString(),
      authorId: "987654323",
      authorName: "Roberto Lima",
      authorUsername: null,
      replyToMsgId: null,
    },
  ];

  return {
    comments: mockComments,
    totalCount: mockComments.length,
    hasMore: false,
    isSimulation: true,
  };
}

/**
 * 9. Responde a un comentario en el hilo de discusión del canal de Telegram
 */
export async function replyToPostComment(
  options: ReplyPostCommentOptions,
): Promise<ReplyPostCommentResult> {
  const { url, secret } = getGatewayConfig();

  if (url) {
    try {
      const resp = await fetch(`${url}/api/gateway/reply-comment`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${secret}`,
          "x-gateway-secret": secret,
        },
        body: JSON.stringify(options),
        signal: AbortSignal.timeout(10000),
      });

      if (resp.ok) {
        const data = (await resp.json()) as ReplyPostCommentResult;
        if (data.isSimulation && !isSimulationAllowed()) {
          throw new Error("A pasarela MTProto respondeu em simulação ao responder comentário.");
        }
        return data;
      }
      const errJson = await resp.json().catch(() => ({}));
      throw new Error(errJson.error || `Gateway returned HTTP ${resp.status}`);
    } catch (err: any) {
      if (!isSimulationAllowed()) {
        throw new Error(`Pasarela MTProto offline para responder comentário: ${err?.message || err}`);
      }
      console.warn("[MTProto Client] Error respondiendo comentario:", err);
    }
  }

  if (!isSimulationAllowed()) {
    throw new Error("TELEGRAM_GATEWAY_URL não configurada no servidor. Pasarela MTProto offline.");
  }

  // Fallback seguro de simulación exclusivo para desarrollo local
  const mockId = String(3000 + Math.floor(Math.random() * 9000));
  return {
    success: true,
    commentId: mockId,
    date: new Date().toISOString(),
    isSimulation: true,
  };
}


