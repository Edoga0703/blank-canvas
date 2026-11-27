-- Migration #14: Agent Knowledge Chunks (RAG Level 1), Acute Memory on crm_cards & Turn Traces
BEGIN;

-- 1. Tabla public.agent_knowledge_chunks (RAG Nivel 1 sin costo extra de API)
CREATE TABLE IF NOT EXISTS public.agent_knowledge_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL REFERENCES public.agent_config(id) ON DELETE CASCADE,
  source_path text NOT NULL,
  source_name text NOT NULL,
  chunk_index integer NOT NULL DEFAULT 0,
  content text NOT NULL,
  content_tsv tsvector GENERATED ALWAYS AS (to_tsvector('simple', coalesce(content, ''))) STORED,
  active boolean NOT NULL DEFAULT true,
  valid_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_akc_company_agent_active
  ON public.agent_knowledge_chunks (company_id, agent_id)
  WHERE active = true;

CREATE INDEX IF NOT EXISTS idx_akc_tsv
  ON public.agent_knowledge_chunks USING gin (content_tsv);

CREATE INDEX IF NOT EXISTS idx_akc_trgm
  ON public.agent_knowledge_chunks USING gin (content gin_trgm_ops);

ALTER TABLE public.agent_knowledge_chunks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS akc_select_members ON public.agent_knowledge_chunks;
CREATE POLICY akc_select_members
  ON public.agent_knowledge_chunks
  FOR SELECT
  TO authenticated
  USING (public.user_has_company(company_id) OR public.is_super_admin());

DROP POLICY IF EXISTS akc_insert_admins ON public.agent_knowledge_chunks;
CREATE POLICY akc_insert_admins
  ON public.agent_knowledge_chunks
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_super_admin()
    OR public.has_company_role(company_id, ARRAY['owner'::text, 'admin'::text])
  );

DROP POLICY IF EXISTS akc_update_admins ON public.agent_knowledge_chunks;
CREATE POLICY akc_update_admins
  ON public.agent_knowledge_chunks
  FOR UPDATE
  TO authenticated
  USING (
    public.is_super_admin()
    OR public.has_company_role(company_id, ARRAY['owner'::text, 'admin'::text])
  )
  WITH CHECK (
    public.is_super_admin()
    OR public.has_company_role(company_id, ARRAY['owner'::text, 'admin'::text])
  );

DROP POLICY IF EXISTS akc_delete_admins ON public.agent_knowledge_chunks;
CREATE POLICY akc_delete_admins
  ON public.agent_knowledge_chunks
  FOR DELETE
  TO authenticated
  USING (
    public.is_super_admin()
    OR public.has_company_role(company_id, ARRAY['owner'::text, 'admin'::text])
  );

CREATE OR REPLACE FUNCTION public.search_agent_knowledge_chunks(
  _company_id uuid,
  _agent_id uuid,
  _query text,
  _limit integer DEFAULT 5
)
RETURNS TABLE (
  id uuid,
  source_name text,
  source_path text,
  chunk_index integer,
  content text,
  score double precision
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH params AS (
    SELECT
      NULLIF(trim(coalesce(_query, '')), '') AS clean_q,
      GREATEST(1, LEAST(COALESCE(_limit, 5), 20)) AS max_rows
  ),
  scored AS (
    SELECT
      akc.id,
      akc.source_name,
      akc.source_path,
      akc.chunk_index,
      akc.content,
      (
        CASE
          WHEN p.clean_q IS NULL THEN 0::double precision
          ELSE coalesce(ts_rank(akc.content_tsv, websearch_to_tsquery('simple', p.clean_q)), 0)::double precision
        END
        + CASE
            WHEN p.clean_q IS NULL THEN 0::double precision
            ELSE coalesce(similarity(akc.content, p.clean_q), 0)::double precision
          END
      ) AS score
    FROM public.agent_knowledge_chunks akc
    CROSS JOIN params p
    WHERE akc.company_id = _company_id
      AND akc.agent_id = _agent_id
      AND akc.active = true
      AND (akc.valid_until IS NULL OR akc.valid_until > now())
  )
  SELECT s.id, s.source_name, s.source_path, s.chunk_index, s.content, s.score
  FROM scored s, params p
  WHERE s.score > 0
  ORDER BY s.score DESC, s.chunk_index ASC
  LIMIT (SELECT max_rows FROM params);
$function$;

-- 2. Memoria Aguda y Tarea en Curso en public.crm_cards
ALTER TABLE public.crm_cards
  ADD COLUMN IF NOT EXISTS client_memory jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.crm_cards
  ADD COLUMN IF NOT EXISTS active_task jsonb;

-- 3. Tabla public.ai_turn_traces (para pestaña Análises y Rayos X)
CREATE TABLE IF NOT EXISTS public.ai_turn_traces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  agent_id uuid,
  numero text NOT NULL,
  instance_id uuid,
  channel text,
  provider text,
  model text,
  route text NOT NULL DEFAULT 'general',
  chunks_used jsonb NOT NULL DEFAULT '[]'::jsonb,
  tools_used jsonb NOT NULL DEFAULT '[]'::jsonb,
  latency_ms integer,
  prompt_chars integer,
  handoff boolean NOT NULL DEFAULT false,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_turn_traces_company_created
  ON public.ai_turn_traces (company_id, created_at DESC);

ALTER TABLE public.ai_turn_traces ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_turn_traces_select_admins ON public.ai_turn_traces;
CREATE POLICY ai_turn_traces_select_admins
  ON public.ai_turn_traces
  FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin()
    OR public.has_company_role(company_id, ARRAY['owner'::text, 'admin'::text])
  );

COMMIT;

NOTIFY pgrst, 'reload schema';
