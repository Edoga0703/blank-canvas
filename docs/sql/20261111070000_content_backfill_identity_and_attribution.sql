-- ==============================================================================
-- CAPIVERSA CRM v1.3.07 — MIGRACIÓN: Identidad de Contenido, Backfill Durable y Atribución CRM
-- Fecha: 11 de noviembre de 2026
-- ==============================================================================

-- 1. Tabla de identidad unificada de publicaciones sociales
CREATE TABLE IF NOT EXISTS public.social_post_identity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('instagram', 'facebook', 'tiktok', 'youtube')),
  account_id uuid NOT NULL REFERENCES public.meta_social_accounts(id) ON DELETE CASCADE,
  external_post_id text NOT NULL,
  origin text NOT NULL CHECK (origin IN ('crm', 'platform')),
  content_post_id uuid NULL REFERENCES public.content_posts(id) ON DELETE SET NULL,
  meta_content_post_id uuid NULL REFERENCES public.meta_content_posts(id) ON DELETE SET NULL,
  campaign_id uuid NULL,
  published_at timestamptz,
  sync_state text NOT NULL DEFAULT 'pending' CHECK (sync_state IN ('pending', 'synced', 'failed', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT social_post_identity_unique_post UNIQUE (company_id, platform, account_id, external_post_id)
);

CREATE INDEX IF NOT EXISTS idx_social_post_identity_company_platform 
  ON public.social_post_identity(company_id, platform, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_post_identity_content_post 
  ON public.social_post_identity(content_post_id) WHERE content_post_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_social_post_identity_meta_post 
  ON public.social_post_identity(meta_content_post_id) WHERE meta_content_post_id IS NOT NULL;

-- 2. Estado de sincronización histórica y backfill durable por cuenta y recurso
CREATE TABLE IF NOT EXISTS public.social_backfill_state (
  company_id uuid NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('instagram', 'facebook', 'tiktok', 'youtube')),
  account_id uuid NOT NULL REFERENCES public.meta_social_accounts(id) ON DELETE CASCADE,
  resource text NOT NULL CHECK (resource IN ('posts', 'comments', 'replies', 'metrics', 'stories')),
  cursor jsonb DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'complete', 'partial', 'blocked')),
  imported_count bigint NOT NULL DEFAULT 0,
  oldest_seen_at timestamptz,
  newest_seen_at timestamptz,
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, platform, account_id, resource)
);

CREATE INDEX IF NOT EXISTS idx_social_backfill_company_status 
  ON public.social_backfill_state(company_id, status);

-- 3. Atribución comercial CRM: vinculo verificable publicación -> interacción -> tarjeta CRM -> venta
CREATE TABLE IF NOT EXISTS public.content_attribution_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  content_post_id uuid NULL REFERENCES public.content_posts(id) ON DELETE SET NULL,
  campaign_id uuid NULL,
  event_type text NOT NULL CHECK (event_type IN ('lead_created', 'deal_won', 'meeting_booked', 'messaging_referral', 'comment_intent')),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  crm_card_id uuid NULL REFERENCES public.crm_cards(id) ON DELETE SET NULL,
  source_url text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  provider_event_id text,
  evidence_type text NOT NULL CHECK (evidence_type IN ('utm', 'lead_form', 'messaging_referral', 'manual_verified')),
  confidence numeric NOT NULL DEFAULT 1.0 CHECK (confidence >= 0.0 AND confidence <= 1.0),
  dedup_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT content_attribution_company_dedup UNIQUE (company_id, dedup_key)
);

CREATE INDEX IF NOT EXISTS idx_content_attribution_post_occurred 
  ON public.content_attribution_events(company_id, content_post_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_content_attribution_card 
  ON public.content_attribution_events(company_id, crm_card_id);

-- 4. Habilitación de Row Level Security (RLS) con aislamiento multiempresa estricto
ALTER TABLE public.social_post_identity ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_backfill_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_attribution_events ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'company_social_post_identity_policy') THEN
    CREATE POLICY company_social_post_identity_policy ON public.social_post_identity
      FOR ALL USING (
        company_id IN (
          SELECT company_id FROM public.company_user WHERE user_id = auth.uid() AND ativo = true
        )
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'company_social_backfill_state_policy') THEN
    CREATE POLICY company_social_backfill_state_policy ON public.social_backfill_state
      FOR ALL USING (
        company_id IN (
          SELECT company_id FROM public.company_user WHERE user_id = auth.uid() AND ativo = true
        )
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'company_content_attribution_policy') THEN
    CREATE POLICY company_content_attribution_policy ON public.content_attribution_events
      FOR ALL USING (
        company_id IN (
          SELECT company_id FROM public.company_user WHERE user_id = auth.uid() AND ativo = true
        )
      );
  END IF;
END $$;

-- 5. Otorgar permisos a roles de aplicación y servicio
GRANT SELECT, INSERT, UPDATE, DELETE ON public.social_post_identity TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.social_backfill_state TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.content_attribution_events TO authenticated, service_role;
