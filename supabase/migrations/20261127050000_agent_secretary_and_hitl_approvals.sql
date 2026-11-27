-- Migration #16: Executive Secretary Config & Human-in-the-Loop Approvals
BEGIN;

-- 1. Columnas de Secretario Ejecutivo en public.agent_config
ALTER TABLE public.agent_config
  ADD COLUMN IF NOT EXISTS secretary_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE public.agent_config
  ADD COLUMN IF NOT EXISTS secretary_phones jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.agent_config
  ADD COLUMN IF NOT EXISTS secretary_briefing_hour text NOT NULL DEFAULT '08:00';

ALTER TABLE public.agent_config
  ADD COLUMN IF NOT EXISTS secretary_timezone text NOT NULL DEFAULT 'America/Sao_Paulo';

-- 2. Tabla public.agent_approval_requests (Cola Human-in-the-Loop)
CREATE TABLE IF NOT EXISTS public.agent_approval_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  agent_id uuid REFERENCES public.agent_config(id) ON DELETE SET NULL,
  short_code text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('payment_receipt', 'tool_write', 'handoff_sensitive')),
  lead_numero text NOT NULL,
  lead_nome text,
  summary text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
  requested_by_instance_id uuid,
  resolved_by text,
  resolved_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agent_approval_requests_company_short_code_key UNIQUE (company_id, short_code)
);

CREATE INDEX IF NOT EXISTS idx_agent_approvals_company_pending
  ON public.agent_approval_requests (company_id, created_at DESC)
  WHERE status = 'pending';

ALTER TABLE public.agent_approval_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agent_approvals_select_admins ON public.agent_approval_requests;
CREATE POLICY agent_approvals_select_admins
  ON public.agent_approval_requests
  FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin()
    OR public.has_company_role(company_id, ARRAY['owner'::text, 'admin'::text])
  );

DROP POLICY IF EXISTS agent_approvals_insert_admins ON public.agent_approval_requests;
CREATE POLICY agent_approvals_insert_admins
  ON public.agent_approval_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_super_admin()
    OR public.has_company_role(company_id, ARRAY['owner'::text, 'admin'::text])
  );

DROP POLICY IF EXISTS agent_approvals_update_admins ON public.agent_approval_requests;
CREATE POLICY agent_approvals_update_admins
  ON public.agent_approval_requests
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

DROP POLICY IF EXISTS agent_approvals_delete_admins ON public.agent_approval_requests;
CREATE POLICY agent_approvals_delete_admins
  ON public.agent_approval_requests
  FOR DELETE
  TO authenticated
  USING (
    public.is_super_admin()
    OR public.has_company_role(company_id, ARRAY['owner'::text, 'admin'::text])
  );

COMMIT;

NOTIFY pgrst, 'reload schema';
