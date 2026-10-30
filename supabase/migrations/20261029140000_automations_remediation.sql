-- ============================================================================
-- Migración de Remediación Definitiva: Automatizaciones Multicanal, Índices y Paridad
-- Timestamp: 20261029140000
-- ============================================================================

-- 1. Asegurar que automation_conversation_control no tenga FK restrictiva en instance_id
-- para permitir el UUID centinela '00000000-0000-0000-0000-000000000000'
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'automation_conversation_control'
      AND constraint_name = 'automation_conversation_control_instance_id_fkey'
  ) THEN
    ALTER TABLE public.automation_conversation_control
      DROP CONSTRAINT automation_conversation_control_instance_id_fkey;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'automation_conversation_control'
      AND constraint_name = 'automation_conv_ctrl_instance_fkey'
  ) THEN
    ALTER TABLE public.automation_conversation_control
      DROP CONSTRAINT automation_conv_ctrl_instance_fkey;
  END IF;
END $$;

-- 2. Asegurar centinela por defecto y NOT NULL en instance_id
UPDATE public.automation_conversation_control
SET instance_id = '00000000-0000-0000-0000-000000000000'::uuid
WHERE instance_id IS NULL;

ALTER TABLE public.automation_conversation_control
  ALTER COLUMN instance_id SET DEFAULT '00000000-0000-0000-0000-000000000000'::uuid,
  ALTER COLUMN instance_id SET NOT NULL;

-- 3. Clave única de control conversacional por empresa, instancia y conversación
ALTER TABLE public.automation_conversation_control
  DROP CONSTRAINT IF EXISTS automation_conv_ctrl_unique;

ALTER TABLE public.automation_conversation_control
  ADD CONSTRAINT automation_conv_ctrl_unique
  UNIQUE (company_id, instance_id, external_conversation_id);

-- 4. Índice de idempotencia para ejecuciones de flujos vinculadas a eventos
CREATE UNIQUE INDEX IF NOT EXISTS idx_automation_exec_event_wf
  ON public.automation_executions (company_id, workflow_id, event_id)
  WHERE event_id IS NOT NULL;

-- 5. Índice para consultas de deduplicación de eventos CAPI en Meta
CREATE INDEX IF NOT EXISTS idx_meta_capi_dedup
  ON public.meta_capi_event_log (company_id, dedup_key);

-- 6. Índice de lease y outbox de eventos para el worker
CREATE INDEX IF NOT EXISTS idx_automation_events_lease_v2
  ON public.automation_events (company_id, processing_state, lease_until)
  WHERE processing_state IN ('pending', 'processing');
