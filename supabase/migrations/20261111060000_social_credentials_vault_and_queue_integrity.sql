-- ==============================================================================
-- Migración: Bóveda de Credenciales OAuth Aislada, Reconciliación Robusta de Colas
-- Fecha: 11 de noviembre de 2026
-- ==============================================================================

-- 1. Tabla aislada de credenciales OAuth con acceso exclusivo a service_role (P0.A)
CREATE TABLE IF NOT EXISTS public.social_account_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.meta_social_accounts(id) ON DELETE CASCADE,
  credentials jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id)
);

CREATE INDEX IF NOT EXISTS idx_social_acc_cred_account 
  ON public.social_account_credentials (account_id, company_id);

ALTER TABLE public.social_account_credentials ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.social_account_credentials FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.social_account_credentials TO service_role;

-- 2. Migra credenciales existentes si las hubiera en meta_social_accounts
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'meta_social_accounts' 
      AND column_name = 'credentials'
  ) THEN
    INSERT INTO public.social_account_credentials (company_id, account_id, credentials)
    SELECT company_id, id, credentials
    FROM public.meta_social_accounts
    WHERE credentials IS NOT NULL AND credentials <> '{}'::jsonb
    ON CONFLICT (account_id) DO UPDATE SET credentials = EXCLUDED.credentials;

    -- Revoca lectura de credentials a roles cliente en meta_social_accounts
    REVOKE ALL (credentials) ON public.meta_social_accounts FROM PUBLIC, anon, authenticated;
  END IF;
END $$;

-- 3. Redefine la vista compatible company_social_accounts excluyendo columnas secretas
CREATE OR REPLACE VIEW public.company_social_accounts AS
  SELECT 
    id,
    company_id,
    connection_id,
    instance_id,
    network,
    provider,
    external_id,
    page_id,
    ig_user_id,
    linked_account_id,
    username,
    display_name,
    picture_url,
    capabilities,
    status,
    sync_cursor,
    last_synced_at,
    last_error,
    created_at,
    updated_at
  FROM public.meta_social_accounts;

-- 4. Actualización del RPC claim_content_target:
-- No incrementa attempts durante polling de targets en 'processing' (P1.G)
CREATE OR REPLACE FUNCTION public.claim_content_target(
  p_worker text,
  p_company_id uuid DEFAULT NULL,
  p_post_id uuid DEFAULT NULL
)
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
    WHERE (p_company_id IS NULL OR t.company_id = p_company_id)
      AND (p_post_id IS NULL OR t.post_id = p_post_id)
      AND (p.approval_state IN ('approved', 'draft'))
      AND (p.scheduled_at IS NULL OR p.scheduled_at <= now())
      AND (
        t.status IN ('pending', 'retry_wait')
        OR (t.status = 'processing' AND (t.next_attempt_at IS NULL OR t.next_attempt_at <= now()))
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
      attempts = CASE 
        WHEN t.status IN ('pending', 'retry_wait') THEN t.attempts + 1 
        ELSE t.attempts 
      END,
      updated_at = now()
  FROM candidate c
  WHERE t.id = c.id
  RETURNING t.*;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_content_target(text, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_content_target(text, uuid, uuid) TO service_role;
