-- ==============================================================================
-- Migración: Cuentas Sociales Unificadas, Reconciliación Asíncrona, Aislamiento de Cola y Búsqueda Segura
-- Fecha: 11 de noviembre de 2026
-- ==============================================================================

-- 1. Unificación de almacenamiento de credenciales OAuth en meta_social_accounts
ALTER TABLE public.meta_social_accounts 
  ADD COLUMN IF NOT EXISTS credentials jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 2. Vista compatible company_social_accounts mapeada a meta_social_accounts
CREATE OR REPLACE VIEW public.company_social_accounts AS
  SELECT * FROM public.meta_social_accounts;

-- 3. Ampliar estados de content_posts para contemplar awaiting_creator_post
ALTER TABLE public.content_posts 
  DROP CONSTRAINT IF EXISTS content_posts_status_check;

ALTER TABLE public.content_posts 
  ADD CONSTRAINT content_posts_status_check 
  CHECK (status IN ('draft', 'scheduled', 'publishing', 'published', 'partial', 'failed', 'cancelled', 'awaiting_creator_post'));

-- 4. Actualización del RPC de reclamo atómico de targets (claim_content_target)
-- Soporta aislamiento de tenant (p_company_id), post específico (p_post_id)
-- y reclamo de targets en estado 'processing' para reconciliación cuando next_attempt_at venció.
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
      attempts = t.attempts + 1,
      updated_at = now()
  FROM candidate c
  WHERE t.id = c.id
  RETURNING t.*;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_content_target(text, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_content_target(text, uuid, uuid) TO service_role;

-- 5. RPC de búsqueda global de mensajes con soporte para modo operacional de asesores (sin límite 300)
CREATE OR REPLACE FUNCTION public.search_company_messages(
  p_company_id uuid,
  p_user_id uuid,
  p_query text,
  p_limit int DEFAULT 30,
  p_is_restricted boolean DEFAULT false
)
RETURNS TABLE (
  id uuid,
  numero text,
  contato_nome text,
  texto text,
  created_at timestamptz,
  direcao text,
  autor text,
  midia_tipo text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_is_restricted THEN
    RETURN QUERY
    SELECT DISTINCT ON (m.created_at, m.id)
      m.id, m.numero, m.contato_nome, m.texto, m.created_at, m.direcao, m.autor, m.midia_tipo
    FROM public.mensagens m
    JOIN public.crm_cards c ON c.company_id = m.company_id AND c.numero = m.numero
    WHERE m.company_id = p_company_id
      AND c.owner_id = p_user_id
      AND m.texto ILIKE ('%' || p_query || '%')
    ORDER BY m.created_at DESC, m.id
    LIMIT p_limit;
  ELSE
    RETURN QUERY
    SELECT m.id, m.numero, m.contato_nome, m.texto, m.created_at, m.direcao, m.autor, m.midia_tipo
    FROM public.mensagens m
    WHERE m.company_id = p_company_id
      AND m.texto ILIKE ('%' || p_query || '%')
    ORDER BY m.created_at DESC
    LIMIT p_limit;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.search_company_messages(uuid, uuid, text, int, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_company_messages(uuid, uuid, text, int, boolean) TO service_role;
