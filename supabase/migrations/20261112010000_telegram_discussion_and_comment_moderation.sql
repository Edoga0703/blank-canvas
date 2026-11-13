-- ==============================================================================
-- CAPIVERSA CRM v1.3.07 — MIGRACIÓN: Moderación de Discusiones Telegram y Atribución CRM
-- Fecha: 12 de noviembre de 2026
-- ==============================================================================

-- 1. Ampliación de CHECK de plataforma en meta_content_comments para admitir Telegram
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'meta_content_comments_network_check'
  ) THEN
    ALTER TABLE public.meta_content_comments DROP CONSTRAINT meta_content_comments_network_check;
    ALTER TABLE public.meta_content_comments ADD CONSTRAINT meta_content_comments_network_check 
      CHECK (network IN ('facebook', 'instagram', 'tiktok', 'youtube', 'telegram'));
  END IF;
END $$;

-- 2. Asegurar existencia de tabla de atribución comercial CRM y sus columnas para meta_content_posts
CREATE TABLE IF NOT EXISTS public.content_attribution_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  content_post_id uuid NULL,
  meta_content_post_id uuid NULL REFERENCES public.meta_content_posts(id) ON DELETE SET NULL,
  campaign_id uuid NULL,
  event_type text NOT NULL CHECK (event_type IN ('lead_created', 'deal_won', 'meeting_booked', 'messaging_referral', 'comment_intent')),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  crm_card_id uuid NULL REFERENCES public.crm_cards(id) ON DELETE SET NULL,
  source_url text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  evidence_type text NOT NULL DEFAULT 'manual_verified' CHECK (evidence_type IN ('utm', 'lead_form', 'messaging_referral', 'manual_verified')),
  confidence numeric NOT NULL DEFAULT 1.0 CHECK (confidence >= 0.0 AND confidence <= 1.0),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Si la tabla ya existía (por migración previa), añadir incrementalmente las columnas que falten
ALTER TABLE public.content_attribution_events
  ADD COLUMN IF NOT EXISTS meta_content_post_id uuid NULL,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'content_attribution_meta_post_fk'
  ) THEN
    ALTER TABLE public.content_attribution_events
      ADD CONSTRAINT content_attribution_meta_post_fk
      FOREIGN KEY (meta_content_post_id)
      REFERENCES public.meta_content_posts(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- Índices de consulta rápida
CREATE INDEX IF NOT EXISTS idx_content_attribution_company_event 
  ON public.content_attribution_events(company_id, event_type, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_content_attribution_crm_card 
  ON public.content_attribution_events(crm_card_id) WHERE crm_card_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_content_attribution_meta_post 
  ON public.content_attribution_events(meta_content_post_id) WHERE meta_content_post_id IS NOT NULL;

-- 3. Habilitar RLS en content_attribution_events
ALTER TABLE public.content_attribution_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS content_attribution_events_company_select ON public.content_attribution_events;
CREATE POLICY content_attribution_events_company_select ON public.content_attribution_events
  FOR SELECT TO authenticated
  USING (public.user_has_company(company_id));

GRANT SELECT ON public.content_attribution_events TO authenticated;
GRANT ALL ON public.content_attribution_events TO service_role;
