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
