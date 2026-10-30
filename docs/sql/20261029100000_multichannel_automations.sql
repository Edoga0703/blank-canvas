-- ============================================================================
-- Migración: Motor de Automatizaciones Visuales y Multicanal (Workflows & Salesbot)
-- Versión: Capiconversa CRM v1.3.00 (Edición Definitiva Corregida)
-- ============================================================================

-- 1. Flujos de Automatización (Cabecera)
CREATE TABLE IF NOT EXISTS public.automation_workflows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'paused', 'archived')),
  active_version_id uuid,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  CONSTRAINT automation_workflows_company_unique UNIQUE (company_id, id)
);

-- 2. Versiones Inmutables del Grafo de Flujo (No modificables una vez publicadas)
CREATE TABLE IF NOT EXISTS public.automation_workflow_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  workflow_id uuid NOT NULL REFERENCES public.automation_workflows(id) ON DELETE CASCADE,
  version_number integer NOT NULL CHECK (version_number > 0),
  graph jsonb NOT NULL CHECK (jsonb_typeof(graph) = 'object'),
  schema_version integer NOT NULL DEFAULT 1,
  published_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  published_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  checksum text,
  CONSTRAINT automation_workflow_versions_number_unique UNIQUE (workflow_id, version_number),
  CONSTRAINT automation_workflow_versions_company_unique UNIQUE (company_id, id)
);

ALTER TABLE public.automation_workflows
  DROP CONSTRAINT IF EXISTS automation_workflows_active_version_fk;

ALTER TABLE public.automation_workflows
  ADD CONSTRAINT automation_workflows_active_version_fk
  FOREIGN KEY (active_version_id)
  REFERENCES public.automation_workflow_versions(id)
  ON DELETE SET NULL
  DEFERRABLE INITIALLY DEFERRED;

-- 3. Outbox de Eventos del Dominio / CRM / Mensajería (con soporte de leases y reintentos)
CREATE TABLE IF NOT EXISTS public.automation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  event_name text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  actor_id uuid,
  source text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  idempotency_key text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  processing_state text NOT NULL DEFAULT 'pending'
    CHECK (processing_state IN ('pending', 'processing', 'processed', 'failed')),
  lease_owner text,
  lease_until timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT automation_events_dedupe_unique UNIQUE (company_id, idempotency_key)
);

-- 4. Ejecuciones de Flujos (Instancias en Curso o Finalizadas)
CREATE TABLE IF NOT EXISTS public.automation_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  workflow_id uuid NOT NULL REFERENCES public.automation_workflows(id) ON DELETE CASCADE,
  workflow_version_id uuid NOT NULL REFERENCES public.automation_workflow_versions(id) ON DELETE CASCADE,
  event_id uuid REFERENCES public.automation_events(id) ON DELETE SET NULL,
  subject_type text,
  subject_id text,
  source_channel text,
  source_instance_id uuid REFERENCES public.whatsapp_instances(id) ON DELETE SET NULL,
  external_conversation_id text,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'waiting', 'succeeded', 'failed', 'cancelled', 'needs_review', 'unknown')),
  current_node_id text,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  correlation_id text,
  started_at timestamptz,
  wake_at timestamptz,
  finished_at timestamptz,
  error_code text,
  error_summary text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 5. Registro de Pasos Ejecutados (Auditoría Step-by-Step)
CREATE TABLE IF NOT EXISTS public.automation_step_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  execution_id uuid NOT NULL REFERENCES public.automation_executions(id) ON DELETE CASCADE,
  node_id text NOT NULL,
  attempt integer NOT NULL DEFAULT 1 CHECK (attempt > 0),
  status text NOT NULL CHECK (status IN ('running', 'waiting', 'succeeded', 'failed', 'skipped', 'unknown')),
  input_redacted jsonb NOT NULL DEFAULT '{}'::jsonb,
  output_redacted jsonb NOT NULL DEFAULT '{}'::jsonb,
  selected_port text,
  external_request_id text,
  error_code text,
  error_summary text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  duration_ms integer,
  CONSTRAINT automation_step_runs_node_attempt_unique UNIQUE (execution_id, node_id, attempt)
);

-- 6. Cola Durable de Trabajos Asíncronos (Leases & Retries)
CREATE TABLE IF NOT EXISTS public.automation_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  execution_id uuid NOT NULL REFERENCES public.automation_executions(id) ON DELETE CASCADE,
  node_id text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'leased', 'done', 'cancelled', 'dead')),
  run_after timestamptz NOT NULL DEFAULT now(),
  lease_owner text,
  lease_until timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  idempotency_key text NOT NULL,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT automation_jobs_idempotency_unique UNIQUE (company_id, idempotency_key)
);

-- 7. Control y Arbitraje de Conversación (Workflow vs IA vs Humano Scoped por Instancia y Sentinel)
CREATE TABLE IF NOT EXISTS public.automation_conversation_control (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  instance_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000'::uuid,
  external_conversation_id text NOT NULL,
  card_id uuid REFERENCES public.crm_cards(id) ON DELETE SET NULL,
  owner_kind text NOT NULL DEFAULT 'none'
    CHECK (owner_kind IN ('human', 'workflow', 'ai', 'none')),
  owner_execution_id uuid REFERENCES public.automation_executions(id) ON DELETE SET NULL,
  lease_until timestamptz,
  changed_by text,
  reason text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT automation_conv_ctrl_unique UNIQUE (company_id, instance_id, external_conversation_id)
);

-- Índices de Alto Rendimiento
CREATE INDEX IF NOT EXISTS idx_automation_workflows_company_status
  ON public.automation_workflows (company_id, status);

CREATE INDEX IF NOT EXISTS idx_automation_events_pending
  ON public.automation_events (company_id, processing_state, created_at)
  WHERE processing_state = 'pending';

CREATE INDEX IF NOT EXISTS idx_automation_events_lease
  ON public.automation_events (lease_until)
  WHERE processing_state = 'processing';

CREATE INDEX IF NOT EXISTS idx_automation_jobs_ready
  ON public.automation_jobs (run_after, created_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_automation_jobs_expired_lease
  ON public.automation_jobs (lease_until)
  WHERE status = 'leased';

CREATE INDEX IF NOT EXISTS idx_automation_executions_recent
  ON public.automation_executions (company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_automation_executions_waiting
  ON public.automation_executions (company_id, wake_at)
  WHERE status = 'waiting';

CREATE INDEX IF NOT EXISTS idx_automation_step_runs_execution
  ON public.automation_step_runs (execution_id, started_at);

-- 8. Trigger PostgreSQL para Captura Automática de Cambios en crm_cards
CREATE OR REPLACE FUNCTION public.automation_capture_card_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_payload jsonb;
  v_event text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_event := 'crm.card.created.v1';
    v_payload := jsonb_build_object(
      'cardId', NEW.id,
      'stageId', NEW.stage_id,
      'pipelineId', NEW.pipeline_id,
      'ownerId', NEW.owner_id,
      'numero', NEW.numero,
      'nome', NEW.nome,
      'createdAt', NEW.created_at
    );
    INSERT INTO public.automation_events
      (company_id, event_name, entity_type, entity_id, source, idempotency_key, payload)
    VALUES
      (NEW.company_id, v_event, 'crm_card', NEW.id::text, 'db_trigger',
       'card-created:' || NEW.id::text,
       v_payload)
    ON CONFLICT (company_id, idempotency_key) DO NOTHING;
    RETURN NEW;
  END IF;

  IF NEW.stage_id IS DISTINCT FROM OLD.stage_id THEN
    INSERT INTO public.automation_events
      (company_id, event_name, entity_type, entity_id, source, idempotency_key, payload)
    VALUES
      (NEW.company_id, 'crm.card.stage_changed.v1', 'crm_card', NEW.id::text,
       'db_trigger',
       concat('card-stage:', NEW.id::text, ':', coalesce(OLD.stage_id::text,'null'),
              ':', coalesce(NEW.stage_id::text,'null'), ':', NEW.updated_at),
       jsonb_build_object(
         'cardId', NEW.id,
         'numero', NEW.numero,
         'fromStageId', OLD.stage_id,
         'toStageId', NEW.stage_id,
         'pipelineId', NEW.pipeline_id,
         'changedAt', NEW.updated_at
       ))
    ON CONFLICT (company_id, idempotency_key) DO NOTHING;
  END IF;

  IF NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN
    INSERT INTO public.automation_events
      (company_id, event_name, entity_type, entity_id, source, idempotency_key, payload)
    VALUES
      (NEW.company_id, 'crm.card.owner_changed.v1', 'crm_card', NEW.id::text,
       'db_trigger',
       concat('card-owner:', NEW.id::text, ':', coalesce(OLD.owner_id::text,'null'),
              ':', coalesce(NEW.owner_id::text,'null'), ':', NEW.updated_at),
       jsonb_build_object(
         'cardId', NEW.id,
         'numero', NEW.numero,
         'fromOwnerId', OLD.owner_id,
         'toOwnerId', NEW.owner_id,
         'changedAt', NEW.updated_at
       ))
    ON CONFLICT (company_id, idempotency_key) DO NOTHING;
  END IF;

  IF NEW.tags IS DISTINCT FROM OLD.tags THEN
    INSERT INTO public.automation_events
      (company_id, event_name, entity_type, entity_id, source, idempotency_key, payload)
    VALUES
      (NEW.company_id, 'crm.card.tags_changed.v1', 'crm_card', NEW.id::text,
       'db_trigger',
       concat('card-tags:', NEW.id::text, ':', NEW.updated_at),
       jsonb_build_object(
         'cardId', NEW.id,
         'numero', NEW.numero,
         'tagsBefore', OLD.tags,
         'tagsAfter', NEW.tags,
         'changedAt', NEW.updated_at
       ))
    ON CONFLICT (company_id, idempotency_key) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS crm_cards_automation_outbox ON public.crm_cards;
CREATE TRIGGER crm_cards_automation_outbox
  AFTER INSERT OR UPDATE OF stage_id, owner_id, tags ON public.crm_cards
  FOR EACH ROW EXECUTE FUNCTION public.automation_capture_card_event();

-- 9. Row Level Security (RLS) en todas las tablas
ALTER TABLE public.automation_workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_workflow_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_step_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_conversation_control ENABLE ROW LEVEL SECURITY;

-- Políticas RLS por Empresa
DROP POLICY IF EXISTS "automation_workflows_company_policy" ON public.automation_workflows;
CREATE POLICY "automation_workflows_company_policy" ON public.automation_workflows
  FOR ALL TO authenticated
  USING (company_id IN (SELECT cu.company_id FROM public.company_user cu WHERE cu.user_id = auth.uid() AND cu.ativo = true))
  WITH CHECK (company_id IN (SELECT cu.company_id FROM public.company_user cu WHERE cu.user_id = auth.uid() AND cu.ativo = true));

-- Inmutabilidad de versiones: SELECT para miembros, INSERT solo para admins/gestores, NO UPDATE/DELETE
DROP POLICY IF EXISTS "automation_versions_company_select" ON public.automation_workflow_versions;
CREATE POLICY "automation_versions_company_select" ON public.automation_workflow_versions
  FOR SELECT TO authenticated
  USING (company_id IN (SELECT cu.company_id FROM public.company_user cu WHERE cu.user_id = auth.uid() AND cu.ativo = true));

DROP POLICY IF EXISTS "automation_versions_company_insert" ON public.automation_workflow_versions;
CREATE POLICY "automation_versions_company_insert" ON public.automation_workflow_versions
  FOR INSERT TO authenticated
  WITH CHECK (company_id IN (SELECT cu.company_id FROM public.company_user cu WHERE cu.user_id = auth.uid() AND cu.ativo = true AND cu.role IN ('owner', 'admin', 'super_admin', 'gestor')));

DROP POLICY IF EXISTS "automation_executions_company_policy" ON public.automation_executions;
CREATE POLICY "automation_executions_company_policy" ON public.automation_executions
  FOR ALL TO authenticated
  USING (company_id IN (SELECT cu.company_id FROM public.company_user cu WHERE cu.user_id = auth.uid() AND cu.ativo = true))
  WITH CHECK (company_id IN (SELECT cu.company_id FROM public.company_user cu WHERE cu.user_id = auth.uid() AND cu.ativo = true));

DROP POLICY IF EXISTS "automation_step_runs_company_policy" ON public.automation_step_runs;
CREATE POLICY "automation_step_runs_company_policy" ON public.automation_step_runs
  FOR ALL TO authenticated
  USING (company_id IN (SELECT cu.company_id FROM public.company_user cu WHERE cu.user_id = auth.uid() AND cu.ativo = true))
  WITH CHECK (company_id IN (SELECT cu.company_id FROM public.company_user cu WHERE cu.user_id = auth.uid() AND cu.ativo = true));

DROP POLICY IF EXISTS "automation_conv_ctrl_company_policy" ON public.automation_conversation_control;
CREATE POLICY "automation_conv_ctrl_company_policy" ON public.automation_conversation_control
  FOR ALL TO authenticated
  USING (company_id IN (SELECT cu.company_id FROM public.company_user cu WHERE cu.user_id = auth.uid() AND cu.ativo = true))
  WITH CHECK (company_id IN (SELECT cu.company_id FROM public.company_user cu WHERE cu.user_id = auth.uid() AND cu.ativo = true));
