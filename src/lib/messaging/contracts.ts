export const MESSAGING_PROVIDERS = [
  "dapi",
  "dapi_official",
  "meta_direct",
] as const;

export type MessagingProviderId = (typeof MESSAGING_PROVIDERS)[number];

export type MessageDirection = "incoming" | "outgoing";
export type MessageAuthor = "contact" | "human" | "ai" | "phone" | "system";
export type MessageKind =
  "text" | "image" | "audio" | "video" | "document" | "location" | "contact" | "unknown";
export type DeliveryStatus = "queued" | "sent" | "delivered" | "read" | "failed";

export type MessageAttachment = {
  kind: Exclude<MessageKind, "text">;
  externalId?: string | null;
  providerUrl?: string | null;
  storageKey?: string | null;
  storageUrl?: string | null;
  mimeType?: string | null;
  fileName?: string | null;
  sizeBytes?: number | null;
  sha256?: string | null;
};

export type IncomingMessageEvent = {
  type: "message";
  provider: MessagingProviderId;
  connectionExternalId: string;
  externalMessageId: string;
  phone: string;
  contactName?: string | null;
  direction: MessageDirection;
  author: MessageAuthor;
  kind: MessageKind;
  text: string;
  occurredAt: string;
  replyToExternalMessageId?: string | null;
  attachments: MessageAttachment[];
  raw: unknown;
};

export type MessageStatusEvent = {
  type: "status";
  provider: MessagingProviderId;
  connectionExternalId: string;
  externalMessageId: string;
  status: DeliveryStatus;
  occurredAt: string;
  errorCode?: string | null;
  errorMessage?: string | null;
  raw: unknown;
};

export type NormalizedMessagingEvent = IncomingMessageEvent | MessageStatusEvent;

export type SendResult = {
  provider: MessagingProviderId;
  externalMessageId: string;
  status: Extract<DeliveryStatus, "queued" | "sent">;
  raw?: unknown;
};

export type SendTextInput = {
  connectionExternalId: string;
  to: string;
  text: string;
  replyToExternalMessageId?: string | null;
};

export type SendMediaInput = {
  connectionExternalId: string;
  to: string;
  kind: Extract<MessageKind, "image" | "audio" | "video" | "document">;
  mediaUrl: string;
  mimeType?: string | null;
  fileName?: string | null;
  caption?: string | null;
};

export type SendTemplateInput = {
  connectionExternalId: string;
  to: string;
  name: string;
  language: string;
  components?: unknown[];
};

export interface MessagingProvider {
  readonly id: MessagingProviderId;
  sendText(input: SendTextInput): Promise<SendResult>;
  sendMedia(input: SendMediaInput): Promise<SendResult>;
  sendTemplate(input: SendTemplateInput): Promise<SendResult>;
  normalizeEvent(raw: unknown): Promise<NormalizedMessagingEvent[]>;
}
