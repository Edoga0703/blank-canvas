// src/lib/telegram/contracts.ts
// Tipos oficiales para la integración de Telegram (Business Bot + MTProto QR)

export type TelegramTransport = "business_bot" | "mtproto_account";

export type TelegramSurface =
  | "private"
  | "channel"
  | "discussion_thread"
  | "group"
  | "channel_dm";

export interface TelegramPeerRef {
  companyId: string;
  connectionId: string;          // UUID local de telegram_connections
  transport: TelegramTransport;
  surface: TelegramSurface;
  chatId: string;                // String decimal int64 (nunca Number de JS)
  businessConnectionId?: string;
  threadRootId?: string;        // Raíz del hilo en el grupo de discusión vinculado
}

export interface TelegramEnvelope {
  source: "bot_webhook" | "tdlib_update" | "teleproto_update";
  updateKey: string;            // bot:<botId>:<updateId> o td:<connection>:<chat>:<msg>
  peer: TelegramPeerRef;
  messageId?: string;
  kind: "message" | "edit" | "delete" | "reaction" | "permission" | "business_connection";
  direction?: "inbound" | "outbound";
  occurredAt: string;
  body: unknown;
}

export function conversationKey(p: TelegramPeerRef): string {
  const business = p.businessConnectionId ?? "-";
  const root = p.threadRootId ?? "-";
  return [p.companyId, "telegram", p.surface, p.connectionId, business, p.chatId, root]
    .map(encodeURIComponent)
    .join(":");
}

export function channelMessageKey(channelId: string, messageId: string): string {
  return `tg:${channelId}:${messageId}`;
}

// =========================================================================
// Contratos de Pasarela MTProto (Gateway Sidecar Desacoplado)
// =========================================================================

export type TelegramQrSessionStatus =
  | "waiting_qr"
  | "waiting_password"
  | "authorized"
  | "expired"
  | "failed";

export interface TelegramChannelInfo {
  telegramChannelId: string;     // String decimal int64 (ej: "-1001234567890")
  title: string;
  username: string | null;
  visibility: "public" | "private";
  discussionChatId?: string | null;
  memberCount: number;
  canPost: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
  canManageDiscussion?: boolean;
  isLinked?: boolean;
  socialAccountId?: string | null;
}

export interface TelegramConnectedAccount {
  id: string;                    // UUID de telegram_connections
  companyId: string;
  transport: TelegramTransport;
  telegramActorId: string | null;
  displayName: string | null;
  username: string | null;
  status: "pending" | "active" | "degraded" | "revoked" | "disconnected" | "legacy_pending_migration";
  createdAt: string;
  channelCount?: number;
}

export type GatewayCommand =
  | { type: "start_qr"; companyId: string; connectionId: string; requestId: string }
  | { type: "check_qr"; companyId: string; sessionId: string; requestId: string }
  | { type: "complete_password"; companyId: string; sessionId: string; requestId: string; passwordOneTime: string }
  | { type: "list_channels"; companyId: string; connectionId: string; requestId: string }
  | { type: "publish"; companyId: string; connectionId: string; requestId: string; fencingEpoch: number; channelId: string; contentTargetId: string; text: string; assetRefs: string[] }
  | { type: "backfill"; companyId: string; connectionId: string; requestId: string; channelId: string; beforeMessageId?: string; limit: number }
  | { type: "logout"; companyId: string; connectionId: string; requestId: string };

export type GatewayEvent =
  | { type: "qr_ready"; connectionId: string; qrLink: string; expiresAt: string }
  | { type: "password_required"; connectionId: string }
  | { type: "authorized"; connectionId: string; actorId: string; username?: string; displayName?: string }
  | { type: "disconnected"; connectionId: string; reason: string }
  | { type: "telegram_update"; connectionId: string; eventKey: string; body: unknown };
