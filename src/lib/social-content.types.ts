// Tipos oficiales para el Módulo de Contenido Multicanal, Programación y Analítica

export type SocialPlatform = "instagram" | "facebook" | "tiktok" | "youtube";

export type SocialAccountStatus = "active" | "degraded" | "expired" | "disconnected";

export interface SocialAccount {
  id: string;
  company_id: string;
  network: SocialPlatform;
  provider: string;
  external_id: string;
  page_id?: string | null;
  ig_user_id?: string | null;
  username: string | null;
  display_name: string | null;
  picture_url: string | null;
  status: SocialAccountStatus;
  capabilities?: Record<string, any>;
  sync_cursor?: Record<string, any>;
  last_synced_at?: string | null;
  last_error?: string | null;
  instance_id?: string | null;
  instance_name?: string | null;
  created_at: string;
}

export type ContentAssetState =
  | "prepared"
  | "uploading"
  | "uploaded"
  | "validating"
  | "ready"
  | "failed";

export interface ContentAsset {
  id: string;
  company_id: string;
  storage_key: string;
  storage_account_id?: string | null;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  sha256?: string | null;
  width?: number | null;
  height?: number | null;
  duration_seconds?: number | null;
  state: ContentAssetState;
  error_message?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReadyAsset {
  id: string;
  companyId: string;
  storageKey: string;
  storageAccountId: string | null;
  mimeType: string;
  sizeBytes: number;
  sha256: string | null;
  width?: number | null;
  height?: number | null;
  durationSeconds?: number | null;
}

export type ContentMediaType = "video" | "image" | "carousel" | "text";

export type ContentPostStatus =
  | "draft"
  | "awaiting_approval"
  | "approved"
  | "scheduled"
  | "publishing"
  | "published"
  | "partial"
  | "failed"
  | "cancelled";

export type ContentApprovalState = "draft" | "awaiting_approval" | "approved" | "rejected";

export type ContentPostSource = "human" | "external_ai" | "automation";

export interface ContentPost {
  id: string;
  company_id: string;
  user_id?: string | null;
  media_url?: string | null;
  media_type: ContentMediaType;
  media_metadata?: {
    duration_seconds?: number;
    width?: number;
    height?: number;
    size_bytes?: number;
    mime_type?: string;
    thumbnail_url?: string;
  };
  base_caption?: string | null;
  scheduled_at?: string | null;
  status: ContentPostStatus;
  source?: ContentPostSource;
  approval_state?: ContentApprovalState;
  timezone?: string | null;
  idempotency_key?: string | null;
  created_at: string;
  updated_at: string;
  targets?: ContentPostTarget[];
}

export type PostTargetStatus =
  | "pending"
  | "leased"
  | "uploading"
  | "processing"
  | "awaiting_creator_post"
  | "published"
  | "retry_wait"
  | "failed_terminal"
  | "cancelled"
  | "publishing"
  | "failed";

export interface ContentPostTarget {
  id: string;
  post_id: string;
  company_id: string;
  social_account_id?: string | null;
  platform: SocialPlatform;
  asset_id?: string | null;
  custom_title?: string | null;
  custom_caption?: string | null;
  platform_settings?: {
    privacy_level?: "PUBLIC_TO_EVERYONE" | "MUTUAL_FOLLOW_FRIENDS" | "SELF_ONLY";
    made_for_kids?: boolean;
    is_commercial?: boolean;
    allow_comments?: boolean;
    allow_duet?: boolean;
    allow_stitch?: boolean;
  };
  status: PostTargetStatus;
  provider_job_id?: string | null;
  external_post_id?: string | null;
  external_url?: string | null;
  error_message?: string | null;
  attempts?: number;
  next_attempt_at?: string | null;
  lease_owner?: string | null;
  lease_until?: string | null;
  published_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface ContentComment {
  id: string;
  post_id?: string | null;
  social_account_id?: string | null;
  platform: SocialPlatform;
  external_comment_id: string;
  external_post_id?: string | null;
  author_id?: string | null;
  author_name?: string | null;
  author_username?: string | null;
  text: string;
  like_count?: number;
  reply_count?: number;
  status: "pending" | "replied" | "hidden";
  commented_at?: string | null;
  replied_at?: string | null;
}

// Estadísticas de perfil (Account-level Metrics)
export interface SocialProfileMetrics {
  social_account_id: string;
  platform: SocialPlatform;
  username: string;
  followers_count: number;
  following_count?: number;
  media_count?: number;
  total_views?: number;
  total_likes?: number;
  growth_7d?: number;
  growth_30d?: number;
  engagement_rate?: number;
  history?: Array<{
    date: string;
    followers: number;
    views?: number;
  }>;
}

// Estadísticas por publicación (Post-level Metrics)
export interface SocialPostMetrics {
  post_id: string;
  target_id: string;
  platform: SocialPlatform;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves?: number;
  reach?: number;
  impressions?: number;
  avg_watch_time_seconds?: number;
  retention_rate?: number;
}

// Métricas de Inteligencia Propietaria de Capiversa
export interface ContentPerformanceInsight {
  target_id: string;
  platform: SocialPlatform;
  performance_score: number; // 0 - 100
  virality_ratio: number; // (shares / views) * 100
  commercial_intent_ratio: number; // % comentarios con intención de compra
  views_vs_average_ratio: number; // ratio vs promedio del canal (ej. 1.8x)
  best_hour_score: number;
  recommendations: string[];
}
