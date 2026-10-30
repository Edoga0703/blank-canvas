// src/lib/automations/types.ts
import type { z } from "zod";

export type Channel =
  | "whatsapp"
  | "instagram_dm"
  | "facebook_messenger"
  | "telegram"
  | "email"
  | "sms"
  | "webchat"
  | "other";

export interface ConnectionRef {
  companyId: string;
  instanceId: string;
  provider: string;
  channel: Channel;
  instanceName?: string;
  status?: string;
}

export interface NormalizedInboundMessage {
  eventId: string;
  companyId: string;
  instanceId: string;
  provider: string;
  channel: Channel;
  externalMessageId: string;
  externalConversationId: string;
  externalContactId: string;
  crmCardId?: string | null;
  direction: "incoming" | "outgoing";
  author: "contact" | "human" | "ai" | "automation" | "system";
  kind: "text" | "image" | "audio" | "video" | "document" | "sticker" | "unknown";
  text?: string;
  mediaUrl?: string | null;
  occurredAt: string;
  isEcho?: boolean;
}

export type AutomationEventName =
  | "crm.card.created.v1"
  | "crm.card.stage_changed.v1"
  | "crm.card.owner_changed.v1"
  | "crm.card.tags_changed.v1"
  | "messaging.inbound_received.v1";

export interface DomainEvent<TPayload = any> {
  id: string;
  companyId: string;
  name: AutomationEventName;
  occurredAt: string;
  actorId?: string | null;
  entity: { type: string; id: string };
  source: string;
  idempotencyKey: string;
  payload: TPayload;
}

export type NodeExecutionResult =
  | { kind: "next"; port?: string; output?: any }
  | { kind: "wait"; resumeAt: string; waitKey: string; output?: any }
  | { kind: "finish"; output?: any };

export interface AutomationExecutionContext {
  companyId: string;
  executionId: string;
  workflowId: string;
  versionId: string;
  nodeId: string;
  context: Record<string, any>;
  subject?: { type: string; id: string };
  sourceChannel?: Channel;
  sourceInstanceId?: string | null;
  externalConversationId?: string | null;
}

export interface AutomationNodeDefinition<TConfig = any> {
  type: string;
  version: number;
  category: "trigger" | "condition" | "action" | "control";
  name: string;
  description: string;
  icon?: string;
  configSchema: z.ZodType<TConfig>;
  outputPorts: readonly string[];
  execute(ctx: AutomationExecutionContext, config: TConfig): Promise<NodeExecutionResult>;
}
