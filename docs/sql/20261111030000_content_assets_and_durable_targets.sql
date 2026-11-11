-- Migration: 20261111030000_content_assets_and_durable_targets.sql
-- Fase 1 & 2: Modelo duradero de medios, estados de aprobación, targets desacoplados y RPC atómica de reclamo.

-- 1. Tabla de Activos de Contenido (content_assets) con ciclo de vida
CREATE TABLE IF NOT EXISTS public.content_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  storage_key text NOT NULL,
  storage_account_id uuid REFERENCES public.storage_accounts(id) ON DELETE SET NULL,
  original_name text NOT NULL,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL,
  sha256 text,
  width integer,
  height integer,
  duration_seconds numeric,
  state text NOT NULL DEFAULT 'prepared' CHECK (state IN ('prepared', 'uploading', 'uploaded', 'validating', 'ready', 'failed')),
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, storage_key)
);

CREATE INDEX IF NOT EXISTS idx_content_assets_company_state 
  ON public.content_assets (company_id, state);

-- Habilitar RLS en content_assets
ALTER TABLE public.content_assets ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'company_content_assets_select') THEN
    CREATE POLICY company_content_assets_select ON public.content_assets
      FOR SELECT USING (
        company_id IN (
          SELECT cu.company_id FROM public.company_user cu
          WHERE cu.user_id = auth.uid() AND cu.ativo = true
        )
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'company_content_assets_modify') THEN
    CREATE POLICY company_content_assets_modify ON public.content_assets
      FOR ALL USING (
        company_id IN (
          SELECT cu.company_id FROM public.company_user cu
          WHERE cu.user_id = auth.uid() AND cu.ativo = true
        )
      );
  END IF;
END $$;

-- 2. Ampliación de content_posts para idempotencia, aprobación, fuente y zona horaria
ALTER TABLE public.content_posts
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'human',
  ADD COLUMN IF NOT EXISTS approval_state text NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS timezone text,
  ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS content_posts_company_idem_idx
  ON public.content_posts (company_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- 3. Ampliación de content_post_targets para colas durables, leasing y reintentos
ALTER TABLE public.content_post_targets
  ADD COLUMN IF NOT EXISTS asset_id uuid REFERENCES public.content_assets(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS provider_job_id text,
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS lease_owner text,
  ADD COLUMN IF NOT EXISTS lease_until timestamptz;

-- Ajustar constraint de status de targets si existe
ALTER TABLE public.content_post_targets 
  DROP CONSTRAINT IF EXISTS content_post_targets_status_check;

ALTER TABLE public.content_post_targets
  ADD CONSTRAINT content_post_targets_status_check
  CHECK (status IN (
    'pending', 'leased', 'uploading', 'processing',
    'awaiting_creator_post', 'published', 'retry_wait',
    'failed_terminal', 'failed', 'cancelled', 'publishing'
  ));

CREATE INDEX IF NOT EXISTS idx_content_post_targets_queue 
  ON public.content_post_targets (status, next_attempt_at, lease_until);

-- 4. RPC atómica de reclamo de targets con FOR UPDATE SKIP LOCKED
CREATE OR REPLACE FUNCTION public.claim_content_target(p_worker text)
RETURNS SETOF public.content_post_targets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH candidate AS (
    SELECT t.id
    FROM public.content_post_targets t
    JOIN public.content_posts p ON p.id = t.post_id
    WHERE (p.approval_state IN ('approved', 'draft'))
      AND (p.scheduled_at IS NULL OR p.scheduled_at <= now())
      AND (
        t.status IN ('pending', 'retry_wait')
        OR (t.status = 'leased' AND t.lease_until < now())
      )
      AND (t.next_attempt_at IS NULL OR t.next_attempt_at <= now())
    ORDER BY COALESCE(p.scheduled_at, p.created_at) ASC, t.created_at ASC
    FOR UPDATE OF t SKIP LOCKED
    LIMIT 1
  )
  UPDATE public.content_post_targets t
  SET status = 'leased',
      lease_owner = p_worker,
      lease_until = now() + interval '3 minutes',
      attempts = t.attempts + 1,
      updated_at = now()
  FROM candidate c
  WHERE t.id = c.id
  RETURNING t.*;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_content_target(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_content_target(text) TO service_role;
