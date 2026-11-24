-- Capiversa CRM — Sprint 3: Inbound Webhook Endpoints por Workflow/Nodo
BEGIN;

CREATE TABLE IF NOT EXISTS public.automation_webhook_endpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  workflow_id uuid NOT NULL REFERENCES public.automation_workflows(id) ON DELETE CASCADE,
  node_id text NOT NULL,
  token text NOT NULL,
  secret_hash text,
  active boolean NOT NULL DEFAULT true,
  last_called_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT automation_webhook_endpoints_token_unique UNIQUE (token),
  CONSTRAINT automation_webhook_endpoints_wf_node_unique UNIQUE (workflow_id, node_id)
);

CREATE INDEX IF NOT EXISTS idx_automation_webhook_endpoints_company
  ON public.automation_webhook_endpoints (company_id, workflow_id);

ALTER TABLE public.automation_webhook_endpoints ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "automation_webhook_endpoints_company_policy" ON public.automation_webhook_endpoints;
CREATE POLICY "automation_webhook_endpoints_company_policy"
  ON public.automation_webhook_endpoints
  FOR ALL TO authenticated
  USING (company_id IN (
    SELECT cu.company_id FROM public.company_user cu
    WHERE cu.user_id = auth.uid() AND cu.ativo = true
  ))
  WITH CHECK (company_id IN (
    SELECT cu.company_id FROM public.company_user cu
    WHERE cu.user_id = auth.uid() AND cu.ativo = true
      AND cu.role::text IN ('owner', 'admin', 'super_admin', 'gestor')
  ));

COMMIT;

NOTIFY pgrst, 'reload schema';
