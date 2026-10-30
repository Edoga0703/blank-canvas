-- ============================================================================
-- SCRIPT MAESTRO DE MIGRACIÓN CONSOLIDADA - CAPICONVERSA CRM v1.3.01
-- Fecha: 29 de Octubre de 2026
-- Incluye:
--   1. Corrección crm_stage (bloqueada_para_ia, criterio_ia)
--   2. Motor de Automatizaciones Multicanal (7 tablas base)
--   3. Preflight de concurrencia y remediación de FK centinela
--   4. Leases y Outbox de mensajería (D-API, Meta, Telegram)
--   5. Colas durables (meta_lead_deliveries, automation_inbound_fallback_jobs)
--   6. Funciones atómicas (automation_start_execution, meta_capi_reserve_event)
-- ============================================================================


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- INICIO ARCHIVO: supabase/migrations/20261024170000_crm_lead_analyzer_and_stage_criteria.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- Migración: Soporte para Analista de Leads CRM, Criterios de Etapa y Control de IA
-- Versión: 20261024170000_crm_lead_analyzer_and_stage_criteria.sql

-- 1. Agregar criterio_ia y bloqueada_para_ia a crm_stage
ALTER TABLE public.crm_stage 
ADD COLUMN IF NOT EXISTS criterio_ia TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS bloqueada_para_ia BOOLEAN DEFAULT FALSE;

-- 2. Agregar crm_master_prompt a crm_pipeline
ALTER TABLE public.crm_pipeline 
ADD COLUMN IF NOT EXISTS crm_master_prompt TEXT DEFAULT NULL;

-- 3. Agregar ultimo_analise_ia_em a crm_cards
ALTER TABLE public.crm_cards 
ADD COLUMN IF NOT EXISTS ultimo_analise_ia_em TIMESTAMPTZ DEFAULT NULL;

-- 4. Comentarios descriptivos
COMMENT ON COLUMN public.crm_stage.criterio_ia IS 'Descripción y criterios que la IA analiza para determinar si un lead pertenece a esta etapa.';
COMMENT ON COLUMN public.crm_stage.bloqueada_para_ia IS 'Si es true, la IA no puede mover leads automáticamente a esta etapa (requiere acción humana).';
COMMENT ON COLUMN public.crm_pipeline.crm_master_prompt IS 'Prompt maestro del Analista de Leads CRM específico para este embudo.';
COMMENT ON COLUMN public.crm_cards.ultimo_analise_ia_em IS 'Marca de tiempo del último análisis realizado por el Bot Analista de CRM.';


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- INICIO ARCHIVO: supabase/migrations/20261029100000_multichannel_automations.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

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
  WITH CHECK (company_id IN (SELECT cu.company_id FROM public.company_user cu WHERE cu.user_id = auth.uid() AND cu.ativo = true AND cu.role::text IN ('owner', 'admin', 'super_admin', 'gestor')));

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


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- INICIO ARCHIVO: supabase/migrations/20261029110000_automation_legacy_preflight.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- Preflight para bases v1.3.00 que aun conservan la FK de instance_id.
-- Se ejecuta antes de 120000; idempotente y transaccional.
BEGIN;
DO $do$
DECLARE fk record;
BEGIN
  FOR fk IN
    SELECT c.conname FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attname='instance_id'
    WHERE c.conrelid='public.automation_conversation_control'::regclass
      AND c.confrelid='public.whatsapp_instances'::regclass
      AND c.contype='f' AND a.attnum=ANY(c.conkey)
  LOOP
    EXECUTE format('ALTER TABLE public.automation_conversation_control DROP CONSTRAINT %I',fk.conname);
  END LOOP;
END $do$;
ALTER TABLE public.automation_events
  ADD COLUMN IF NOT EXISTS lease_owner text,
  ADD COLUMN IF NOT EXISTS lease_until timestamptz,
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error text;
COMMIT;


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- INICIO ARCHIVO: supabase/migrations/20261029120000_multichannel_automations_fixes.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

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


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- INICIO ARCHIVO: supabase/migrations/20261029140000_automations_remediation.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

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


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- INICIO ARCHIVO: supabase/migrations/20261029150000_automation_v1301.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- Capiversa CRM 1.3.01: recuperacion historica y operaciones atomicas.
-- Aplicar una vez en Supabase SQL Editor; el script es reejecutable.
BEGIN;

DO $do$
DECLARE fk record;
BEGIN
  FOR fk IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attname = 'instance_id'
    WHERE c.conrelid = 'public.automation_conversation_control'::regclass
      AND c.confrelid = 'public.whatsapp_instances'::regclass
      AND c.contype = 'f' AND a.attnum = ANY(c.conkey)
  LOOP
    EXECUTE format('ALTER TABLE public.automation_conversation_control DROP CONSTRAINT %I', fk.conname);
  END LOOP;
END $do$;

ALTER TABLE public.automation_events
  ADD COLUMN IF NOT EXISTS lease_owner text,
  ADD COLUMN IF NOT EXISTS lease_until timestamptz,
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error text;

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

DO $do$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.automation_executions
    WHERE event_id IS NOT NULL
    GROUP BY company_id, workflow_id, event_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicated automation_executions event/workflow rows; reconcile before applying 1.3.01';
  END IF;
END $do$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_automation_exec_event_wf
  ON public.automation_executions(company_id, workflow_id, event_id)
  WHERE event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_automation_events_lease_v2
  ON public.automation_events(company_id, processing_state, lease_until)
  WHERE processing_state IN ('pending', 'processing');

DROP POLICY IF EXISTS "automation_versions_company_policy" ON public.automation_workflow_versions;
DROP POLICY IF EXISTS "automation_versions_company_select" ON public.automation_workflow_versions;
DROP POLICY IF EXISTS "automation_versions_company_insert" ON public.automation_workflow_versions;
CREATE POLICY "automation_versions_company_select"
  ON public.automation_workflow_versions FOR SELECT TO authenticated
  USING (company_id IN (
    SELECT cu.company_id FROM public.company_user cu
    WHERE cu.user_id = auth.uid() AND cu.ativo = true
  ));
CREATE POLICY "automation_versions_company_insert"
  ON public.automation_workflow_versions FOR INSERT TO authenticated
  WITH CHECK (company_id IN (
    SELECT cu.company_id FROM public.company_user cu
    WHERE cu.user_id = auth.uid() AND cu.ativo = true
      AND cu.role::text IN ('owner', 'admin', 'super_admin', 'gestor')
  ));

CREATE OR REPLACE FUNCTION public.automation_claim_conversation(
  p_company_id uuid, p_instance_id uuid, p_conversation_id text,
  p_execution_id uuid, p_card_id uuid, p_lease_minutes integer DEFAULT 120
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $fn$
DECLARE
  v_instance uuid := coalesce(p_instance_id, '00000000-0000-0000-0000-000000000000'::uuid);
  v_owner text;
  v_execution uuid;
  v_until timestamptz;
  v_id uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(
    p_company_id::text || ':' || v_instance::text || ':' || p_conversation_id, 0));
  IF v_instance <> '00000000-0000-0000-0000-000000000000'::uuid THEN
    IF EXISTS (
      SELECT 1 FROM public.automation_conversation_control
      WHERE company_id=p_company_id
        AND instance_id='00000000-0000-0000-0000-000000000000'::uuid
        AND external_conversation_id=p_conversation_id
        AND owner_kind='human'
    ) THEN RETURN false; END IF;
  END IF;
  SELECT owner_kind, owner_execution_id, lease_until
    INTO v_owner, v_execution, v_until
    FROM public.automation_conversation_control
    WHERE company_id=p_company_id AND instance_id=v_instance
      AND external_conversation_id=p_conversation_id FOR UPDATE;
  IF v_owner='human' OR
     (v_owner='workflow' AND v_execution IS DISTINCT FROM p_execution_id
       AND v_until > now()) THEN
    RETURN false;
  END IF;
  INSERT INTO public.automation_conversation_control
    (company_id,instance_id,external_conversation_id,card_id,owner_kind,
     owner_execution_id,lease_until,changed_by,reason,updated_at)
  VALUES (p_company_id,v_instance,p_conversation_id,p_card_id,'workflow',
          p_execution_id,now()+make_interval(mins => greatest(1,p_lease_minutes)),
          'workflow_engine','Control adquirido por ejecucion '||p_execution_id,now())
  ON CONFLICT (company_id,instance_id,external_conversation_id)
  DO UPDATE SET card_id=coalesce(EXCLUDED.card_id,public.automation_conversation_control.card_id),
    owner_kind='workflow',owner_execution_id=p_execution_id,
    lease_until=EXCLUDED.lease_until,changed_by='workflow_engine',
    reason=EXCLUDED.reason,updated_at=now()
  WHERE public.automation_conversation_control.owner_kind <> 'human'
    AND (public.automation_conversation_control.owner_kind <> 'workflow'
      OR public.automation_conversation_control.owner_execution_id=p_execution_id
      OR public.automation_conversation_control.lease_until <= now())
  RETURNING id INTO v_id;
  RETURN v_id IS NOT NULL;
END $fn$;

CREATE OR REPLACE FUNCTION public.automation_start_execution(
  p_company_id uuid, p_workflow_id uuid, p_version_id uuid, p_event_id uuid,
  p_subject_type text, p_subject_id text, p_channel text, p_instance_id uuid,
  p_conversation_id text, p_card_id uuid, p_node_id text, p_context jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $fn$
DECLARE
  v_id uuid;
  v_status text;
  v_current_node text;
  v_created boolean := false;
BEGIN
  IF p_event_id IS NULL THEN RAISE EXCEPTION 'event_id required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.automation_events
                 WHERE id=p_event_id AND company_id=p_company_id) THEN
    RAISE EXCEPTION 'event does not belong to company';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.automation_workflows w
                 JOIN public.automation_workflow_versions v ON v.id=p_version_id
                 WHERE w.id=p_workflow_id AND w.company_id=p_company_id
                   AND w.active_version_id=p_version_id AND w.status='published'
                   AND v.workflow_id=w.id AND v.company_id=w.company_id) THEN
    RAISE EXCEPTION 'workflow/version not active in company';
  END IF;
  INSERT INTO public.automation_executions
    (company_id,workflow_id,workflow_version_id,event_id,subject_type,subject_id,
     source_channel,source_instance_id,external_conversation_id,status,current_node_id,
     context,started_at)
  VALUES (p_company_id,p_workflow_id,p_version_id,p_event_id,p_subject_type,p_subject_id,
          p_channel,p_instance_id,p_conversation_id,'running',p_node_id,
          coalesce(p_context,'{}'::jsonb),now())
  ON CONFLICT (company_id,workflow_id,event_id) WHERE event_id IS NOT NULL
  DO NOTHING RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    SELECT id,status,current_node_id INTO v_id,v_status,v_current_node
    FROM public.automation_executions
    WHERE company_id=p_company_id AND workflow_id=p_workflow_id
      AND event_id=p_event_id FOR UPDATE;
    IF v_id IS NULL THEN RAISE EXCEPTION 'execution conflict without row'; END IF;
    IF v_status <> 'running' OR v_current_node <> p_node_id THEN
      RETURN jsonb_build_object('state','already','executionId',v_id);
    END IF;
  ELSE
    v_created := true;
  END IF;
  IF p_conversation_id IS NOT NULL AND p_conversation_id <> '' THEN
    IF NOT public.automation_claim_conversation(
      p_company_id,p_instance_id,p_conversation_id,v_id,p_card_id,120) THEN
      IF v_created THEN
        UPDATE public.automation_executions SET status='cancelled',
          finished_at=now(),error_code='CONVERSATION_OWNED'
        WHERE id=v_id;
      END IF;
      RETURN jsonb_build_object('state','blocked','executionId',v_id);
    END IF;
  END IF;
  INSERT INTO public.automation_jobs
    (company_id,execution_id,node_id,status,run_after,idempotency_key)
  VALUES (p_company_id,v_id,p_node_id,'pending',now(),
          'job_'||v_id::text||'_'||p_node_id||'_start')
  ON CONFLICT (company_id,idempotency_key) DO NOTHING;
  RETURN jsonb_build_object('state',CASE WHEN v_created THEN 'started' ELSE 'repaired' END,
                            'executionId',v_id);
END $fn$;

CREATE OR REPLACE FUNCTION public.automation_resume_waiting(
  p_company_id uuid, p_execution_id uuid, p_expected_node text,
  p_target_node text, p_job_key text, p_context_patch jsonb,
  p_require_due boolean DEFAULT false
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $fn$
DECLARE v_id uuid;
BEGIN
  UPDATE public.automation_executions
  SET status='running', current_node_id=p_target_node, wake_at=NULL,
      context=coalesce(context,'{}'::jsonb)||coalesce(p_context_patch,'{}'::jsonb)
  WHERE id=p_execution_id AND company_id=p_company_id
    AND status='waiting' AND current_node_id=p_expected_node
    AND (NOT p_require_due OR wake_at <= now())
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN RETURN false; END IF;
  INSERT INTO public.automation_jobs
    (company_id,execution_id,node_id,status,run_after,idempotency_key)
  VALUES (p_company_id,p_execution_id,p_target_node,'pending',now(),p_job_key)
  ON CONFLICT (company_id,idempotency_key) DO NOTHING;
  RETURN true;
END $fn$;

REVOKE ALL ON FUNCTION public.automation_claim_conversation(uuid,uuid,text,uuid,uuid,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.automation_start_execution(uuid,uuid,uuid,uuid,text,text,text,uuid,text,uuid,text,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.automation_resume_waiting(uuid,uuid,text,text,text,jsonb,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.automation_claim_conversation(uuid,uuid,text,uuid,uuid,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.automation_start_execution(uuid,uuid,uuid,uuid,text,text,text,uuid,text,uuid,text,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.automation_resume_waiting(uuid,uuid,text,text,text,jsonb,boolean) TO service_role;

CREATE TABLE IF NOT EXISTS public.meta_lead_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  leadgen_id text NOT NULL,
  page_id text NOT NULL,
  form_id text,
  company_id uuid REFERENCES public.company(id) ON DELETE SET NULL,
  card_id uuid REFERENCES public.crm_cards(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','leased','processed','failed')),
  attempts integer NOT NULL DEFAULT 0,
  lease_owner text,
  lease_until timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  CONSTRAINT meta_lead_deliveries_unique UNIQUE (leadgen_id,page_id)
);
ALTER TABLE public.meta_lead_deliveries ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_meta_lead_deliveries_ready
  ON public.meta_lead_deliveries(status,lease_until,created_at);

CREATE TABLE IF NOT EXISTS public.automation_inbound_fallback_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES public.automation_events(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','leased','done','failed')),
  attempts integer NOT NULL DEFAULT 0,
  lease_owner text,
  lease_until timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT automation_inbound_fallback_event_unique UNIQUE(event_id)
);
ALTER TABLE public.automation_inbound_fallback_jobs ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_automation_inbound_fallback_ready
  ON public.automation_inbound_fallback_jobs(status,lease_until,created_at);


-- La reserva CAPI se realiza en PostgreSQL para impedir envíos concurrentes.
ALTER TABLE public.meta_capi_event_log
  ADD COLUMN IF NOT EXISTS lease_owner text,
  ADD COLUMN IF NOT EXISTS lease_until timestamptz;

CREATE OR REPLACE FUNCTION public.meta_capi_reserve_event(
  p_company_id uuid, p_card_id uuid, p_dedup_key text,
  p_event_name text, p_action_source text, p_dataset_id text,
  p_messaging_channel text, p_ctwa_clid text, p_value numeric,
  p_currency text, p_lease_owner text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $fn$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.meta_capi_event_log
    (company_id,card_id,dedup_key,event_name,action_source,dataset_id,
     messaging_channel,ctwa_clid,value,currency,status,lease_owner,lease_until)
  VALUES
    (p_company_id,p_card_id,p_dedup_key,p_event_name,p_action_source,p_dataset_id,
     p_messaging_channel,p_ctwa_clid,p_value,p_currency,'sending',p_lease_owner,
     now() + interval '3 minutes')
  ON CONFLICT (company_id,dedup_key)
  DO UPDATE SET status='sending',lease_owner=p_lease_owner,
    lease_until=now()+interval '3 minutes',error_message=NULL
  WHERE public.meta_capi_event_log.status='failed'
     OR (public.meta_capi_event_log.status='sending'
       AND public.meta_capi_event_log.lease_until < now())
  RETURNING id INTO v_id;
  RETURN v_id;
END $fn$;
REVOKE ALL ON FUNCTION public.meta_capi_reserve_event(uuid,uuid,text,text,text,text,text,text,numeric,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.meta_capi_reserve_event(uuid,uuid,text,text,text,text,text,text,numeric,text,text) TO service_role;

COMMIT;

