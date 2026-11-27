-- Migration #17: Dual Studio Mode (simple / advanced) & Agent Config Versioning
BEGIN;

-- 1. Modo de interfaz y versión activa en public.agent_config
ALTER TABLE public.agent_config
  ADD COLUMN IF NOT EXISTS studio_mode text NOT NULL DEFAULT 'simple'
  CHECK (studio_mode IN ('simple', 'advanced'));

ALTER TABLE public.agent_config
  ADD COLUMN IF NOT EXISTS active_version integer NOT NULL DEFAULT 1;

-- 2. Tabla public.agent_config_versions (Historial y Rollback en 1 clic)
CREATE TABLE IF NOT EXISTS public.agent_config_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL REFERENCES public.agent_config(id) ON DELETE CASCADE,
  version_number integer NOT NULL,
  label text,
  snapshot jsonb NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agent_config_versions_agent_version_key UNIQUE (agent_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_agent_config_versions_agent_created
  ON public.agent_config_versions (agent_id, version_number DESC);

ALTER TABLE public.agent_config_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agent_config_versions_select_admins ON public.agent_config_versions;
CREATE POLICY agent_config_versions_select_admins
  ON public.agent_config_versions
  FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin()
    OR public.has_company_role(company_id, ARRAY['owner'::text, 'admin'::text])
  );

DROP POLICY IF EXISTS agent_config_versions_insert_admins ON public.agent_config_versions;
CREATE POLICY agent_config_versions_insert_admins
  ON public.agent_config_versions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_super_admin()
    OR public.has_company_role(company_id, ARRAY['owner'::text, 'admin'::text])
  );

DROP POLICY IF EXISTS agent_config_versions_delete_admins ON public.agent_config_versions;
CREATE POLICY agent_config_versions_delete_admins
  ON public.agent_config_versions
  FOR DELETE
  TO authenticated
  USING (
    public.is_super_admin()
    OR public.has_company_role(company_id, ARRAY['owner'::text, 'admin'::text])
  );

COMMIT;

NOTIFY pgrst, 'reload schema';
