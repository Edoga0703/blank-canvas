export type SocialPlatform = "instagram" | "facebook" | "tiktok" | "youtube";

export class PermanentProviderError extends Error {
  code: string;
  constructor(message: string, code = "PERMANENT_ERROR") {
    super(message);
    this.name = "PermanentProviderError";
    this.code = code;
  }
}

export class RetryableProviderError extends Error {
  code: string;
  retryAfterSeconds?: number;
  constructor(message: string, code = "RETRYABLE_ERROR", retryAfterSeconds?: number) {
    super(message);
    this.name = "RetryableProviderError";
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export interface PublishContext {
  postId: string;
  targetId: string;
  companyId: string;
  platform: SocialPlatform;
  socialAccountId?: string | null;
  caption: string;
  title?: string | null;
  mediaUrl?: string | null;
  mediaType: "video" | "image" | "carousel" | "text";
  platformSettings?: Record<string, any> | null;
  scheduledAt?: string | null;
  timezone?: string | null;
}

export type ProviderResult =
  | { state: "published"; externalPostId: string; externalUrl?: string }
  | { state: "awaiting_creator_post"; externalPostId?: string; details?: string }
  | { state: "scheduled_on_provider"; externalPostId: string }
  | { state: "processing"; providerJobId: string }
  | { state: "failed_terminal"; code: string; message: string };

export interface SocialPublisherAdapter {
  platform: SocialPlatform;
  validate(context: PublishContext): Promise<{ valid: boolean; error?: string }>;
  publish(context: PublishContext): Promise<ProviderResult>;
  reconcile?(providerJobId: string, companyId: string, socialAccountId?: string | null): Promise<ProviderResult>;
}
