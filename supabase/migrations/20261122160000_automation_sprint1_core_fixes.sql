-- Capiversa CRM — Sprint 1 Automations Core Fixes
-- 1) Permite IDs externos de Meta/Telegram en automation_events.actor_id (text)
-- 2) Agrega card_id a automation_executions y lo persiste desde automation_start_execution
BEGIN;

ALTER TABLE public.automation_events
  ALTER COLUMN actor_id TYPE text USING actor_id::text;

ALTER TABLE public.automation_executions
  ADD COLUMN IF NOT EXISTS card_id uuid REFERENCES public.crm_cards(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_automation_executions_card_id
  ON public.automation_executions (company_id, card_id)
  WHERE card_id IS NOT NULL;

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
                 WHERE id = p_event_id AND company_id = p_company_id) THEN
    RAISE EXCEPTION 'event does not belong to company';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.automation_workflows w
                 JOIN public.automation_workflow_versions v ON v.id = p_version_id
                 WHERE w.id = p_workflow_id AND w.company_id = p_company_id
                   AND w.active_version_id = p_version_id AND w.status = 'published'
                   AND v.workflow_id = w.id AND v.company_id = w.company_id) THEN
    RAISE EXCEPTION 'workflow/version not active in company';
  END IF;

  INSERT INTO public.automation_executions
    (company_id, workflow_id, workflow_version_id, event_id, subject_type, subject_id,
     source_channel, source_instance_id, external_conversation_id, card_id,
     status, current_node_id, context, started_at)
  VALUES (p_company_id, p_workflow_id, p_version_id, p_event_id, p_subject_type, p_subject_id,
          p_channel, p_instance_id, p_conversation_id, p_card_id,
          'running', p_node_id, coalesce(p_context, '{}'::jsonb), now())
  ON CONFLICT (company_id, workflow_id, event_id) WHERE event_id IS NOT NULL
  DO NOTHING RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    SELECT id, status, current_node_id INTO v_id, v_status, v_current_node
    FROM public.automation_executions
    WHERE company_id = p_company_id AND workflow_id = p_workflow_id
      AND event_id = p_event_id FOR UPDATE;
    IF v_id IS NULL THEN RAISE EXCEPTION 'execution conflict without row'; END IF;
    IF v_status <> 'running' OR v_current_node <> p_node_id THEN
      RETURN jsonb_build_object('state', 'already', 'executionId', v_id);
    END IF;
  ELSE
    v_created := true;
  END IF;

  IF p_conversation_id IS NOT NULL AND p_conversation_id <> '' THEN
    IF NOT public.automation_claim_conversation(
      p_company_id, p_instance_id, p_conversation_id, v_id, p_card_id, 120) THEN
      IF v_created THEN
        UPDATE public.automation_executions SET status = 'cancelled',
          finished_at = now(), error_code = 'CONVERSATION_OWNED'
        WHERE id = v_id;
      END IF;
      RETURN jsonb_build_object('state', 'blocked', 'executionId', v_id);
    END IF;
  END IF;

  INSERT INTO public.automation_jobs
    (company_id, execution_id, node_id, status, run_after, idempotency_key)
  VALUES (p_company_id, v_id, p_node_id, 'pending', now(),
          'job_' || v_id::text || '_' || p_node_id || '_start')
  ON CONFLICT (company_id, idempotency_key) DO NOTHING;

  RETURN jsonb_build_object(
    'state', CASE WHEN v_created THEN 'started' ELSE 'repaired' END,
    'executionId', v_id
  );
END $fn$;

REVOKE ALL ON FUNCTION public.automation_start_execution(uuid,uuid,uuid,uuid,text,text,text,uuid,text,uuid,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.automation_start_execution(uuid,uuid,uuid,uuid,text,text,text,uuid,text,uuid,text,jsonb) TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
