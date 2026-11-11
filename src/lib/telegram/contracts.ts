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
