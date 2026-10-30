-- ============================================================================
-- Migración Incremental: Mejoras de Concurrencia, Outbox y Leases en Automatizaciones
-- Timestamp: 20261029120000
-- ============================================================================

-- 1. Añadir columnas de lease y reintentos en outbox de eventos si no existen
ALTER TABLE public.automation_events
  ADD COLUMN IF NOT EXISTS lease_owner text,
  ADD COLUMN IF NOT EXISTS lease_until timestamptz,
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error text;

CREATE INDEX IF NOT EXISTS idx_automation_events_lease
  ON public.automation_events (lease_until)
  WHERE processing_state = 'processing';

-- 2. Backfill de instance_id en control conversacional para eliminar hueco de NULL
UPDATE public.automation_conversation_control
SET instance_id = '00000000-0000-0000-0000-000000000000'::uuid
WHERE instance_id IS NULL;

ALTER TABLE public.automation_conversation_control
  ALTER COLUMN instance_id SET DEFAULT '00000000-0000-0000-0000-000000000000'::uuid,
  ALTER COLUMN instance_id SET NOT NULL;

ALTER TABLE public.automation_conversation_control
  DROP CONSTRAINT IF EXISTS automation_conv_ctrl_unique;

ALTER TABLE public.automation_conversation_control
  ADD CONSTRAINT automation_conv_ctrl_unique
  UNIQUE (company_id, instance_id, external_conversation_id);

-- 3. Índice único de idempotencia para evitar doble ejecución por evento + flujo
CREATE UNIQUE INDEX IF NOT EXISTS idx_automation_exec_event_wf
  ON public.automation_executions(company_id, workflow_id, event_id)
  WHERE event_id IS NOT NULL;

-- 4. Inmutabilidad de versiones publicadas mediante políticas RLS estrictas
DROP POLICY IF EXISTS "automation_versions_company_policy" ON public.automation_workflow_versions;
DROP POLICY IF EXISTS "automation_versions_company_select" ON public.automation_workflow_versions;
DROP POLICY IF EXISTS "automation_versions_company_insert" ON public.automation_workflow_versions;

CREATE POLICY "automation_versions_company_select"
  ON public.automation_workflow_versions
  FOR SELECT TO authenticated
  USING (company_id IN (
    SELECT cu.company_id FROM public.company_user cu
    WHERE cu.user_id = auth.uid() AND cu.ativo = true
  ));

CREATE POLICY "automation_versions_company_insert"
  ON public.automation_workflow_versions
  FOR INSERT TO authenticated
  WITH CHECK (company_id IN (
    SELECT cu.company_id FROM public.company_user cu
    WHERE cu.user_id = auth.uid() AND cu.ativo = true
      AND cu.role::text IN ('owner', 'admin', 'super_admin', 'gestor')
  ));
