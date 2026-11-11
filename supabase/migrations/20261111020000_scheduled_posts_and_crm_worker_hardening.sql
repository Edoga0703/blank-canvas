-- Migration: 20261111020000_scheduled_posts_and_crm_worker_hardening.sql
-- RPC atômica com FOR UPDATE SKIP LOCKED para reclamar posts agendados sem colisão entre workers.

CREATE OR REPLACE FUNCTION public.claim_scheduled_content_posts(p_limit int DEFAULT 10)
RETURNS SETOF public.content_posts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.content_posts
  SET status = 'publishing',
      updated_at = now()
  WHERE id IN (
    SELECT id
    FROM public.content_posts
    WHERE (status = 'scheduled' AND scheduled_at <= now())
       OR (status = 'publishing' AND updated_at < now() - interval '10 minutes')
    ORDER BY scheduled_at ASC NULLS LAST
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
END;
$$;

-- Permissões de execução: restrito a service_role (workers do backend)
REVOKE ALL ON FUNCTION public.claim_scheduled_content_posts(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_scheduled_content_posts(int) TO service_role;
