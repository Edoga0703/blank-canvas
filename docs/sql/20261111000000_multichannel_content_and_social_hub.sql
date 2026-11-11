-- ==============================================================================
-- Migración: Módulo de Contenido Multicanal, Programación y Analítica Propietaria
-- Plataformas soportadas: Meta (Instagram & Facebook), YouTube y TikTok.
-- ==============================================================================

-- 1. Ampliación de meta_social_accounts para admitir TikTok y YouTube
ALTER TABLE public.meta_social_accounts DROP CONSTRAINT IF EXISTS meta_social_accounts_network_check;
ALTER TABLE public.meta_social_accounts ADD CONSTRAINT meta_social_accounts_network_check 
  CHECK (network IN ('facebook', 'instagram', 'tiktok', 'youtube'));

-- 2. Ampliación de meta_content_posts para admitir publicaciones de TikTok y YouTube
ALTER TABLE public.meta_content_posts DROP CONSTRAINT IF EXISTS meta_content_posts_network_check;
ALTER TABLE public.meta_content_posts ADD CONSTRAINT meta_content_posts_network_check 
  CHECK (network IN ('facebook', 'instagram', 'tiktok', 'youtube'));

-- 3. Ampliación de meta_content_comments para admitir comentarios de TikTok y YouTube
ALTER TABLE public.meta_content_comments DROP CONSTRAINT IF EXISTS meta_content_comments_network_check;
ALTER TABLE public.meta_content_comments ADD CONSTRAINT meta_content_comments_network_check 
  CHECK (network IN ('facebook', 'instagram', 'tiktok', 'youtube'));

-- 4. Tabla de Publicaciones Maestras (content_posts)
CREATE TABLE IF NOT EXISTS public.content_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  user_id uuid,
  media_url text,
  media_type text NOT NULL DEFAULT 'video' CHECK (media_type IN ('video', 'image', 'carousel', 'text')),
  media_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  base_caption text,
  scheduled_at timestamptz,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'publishing', 'published', 'partial', 'failed', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS content_posts_company_status_idx 
  ON public.content_posts (company_id, status);
CREATE INDEX IF NOT EXISTS content_posts_scheduled_idx 
  ON public.content_posts (status, scheduled_at) 
  WHERE status = 'scheduled';

-- 5. Tabla de Destinos por Red (content_post_targets)
CREATE TABLE IF NOT EXISTS public.content_post_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.content_posts(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  social_account_id uuid REFERENCES public.meta_social_accounts(id) ON DELETE SET NULL,
  platform text NOT NULL CHECK (platform IN ('facebook', 'instagram', 'tiktok', 'youtube')),
  custom_title text,
  custom_caption text,
  platform_settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'publishing', 'published', 'failed')),
  external_post_id text,
  external_url text,
  error_message text,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (post_id, platform, social_account_id)
);

CREATE INDEX IF NOT EXISTS content_post_targets_post_idx 
  ON public.content_post_targets (post_id);
CREATE INDEX IF NOT EXISTS content_post_targets_company_status_idx 
  ON public.content_post_targets (company_id, status);

-- 6. Tabla de Analítica Propietaria y Métricas de Rendimiento (content_performance_insights)
CREATE TABLE IF NOT EXISTS public.content_performance_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  social_account_id uuid REFERENCES public.meta_social_accounts(id) ON DELETE CASCADE,
  target_id uuid REFERENCES public.content_post_targets(id) ON DELETE CASCADE,
  platform text NOT NULL,
  performance_score integer CHECK (performance_score BETWEEN 0 AND 100),
  virality_ratio numeric(6,2),
  commercial_intent_ratio numeric(6,2),
  views_vs_average_ratio numeric(6,2),
  best_hour_score numeric(6,2),
  insights jsonb DEFAULT '{}'::jsonb,
  computed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS content_perf_insights_company_idx 
  ON public.content_performance_insights (company_id, platform);

-- 7. Habilitación de Row Level Security (RLS)
ALTER TABLE public.content_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_post_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_performance_insights ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'company_content_posts_policy') THEN
    CREATE POLICY company_content_posts_policy ON public.content_posts
      FOR ALL USING (
        company_id IN (
          SELECT company_id FROM public.company_user WHERE user_id = auth.uid() AND ativo = true
        )
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'company_content_targets_policy') THEN
    CREATE POLICY company_content_targets_policy ON public.content_post_targets
      FOR ALL USING (
        company_id IN (
          SELECT company_id FROM public.company_user WHERE user_id = auth.uid() AND ativo = true
        )
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'company_content_insights_policy') THEN
    CREATE POLICY company_content_insights_policy ON public.content_performance_insights
      FOR ALL USING (
        company_id IN (
          SELECT company_id FROM public.company_user WHERE user_id = auth.uid() AND ativo = true
        )
      );
  END IF;
END $$;
