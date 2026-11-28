-- Migration #20: P0 Security hardening - revoke anon EXECUTE on internal/sensitive RPCs & close public read on app_config
BEGIN;

DROP POLICY IF EXISTS "app_config_read" ON public.app_config;
REVOKE ALL ON TABLE public.app_config FROM anon;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.proname = ANY (ARRAY[
        'bootstrap_capiversa_company',
        'claim_super_admin_if_empty',
        'grant_credits',
        'consume_ai_credit',
        'debit_ai_credits_atomic',
        'topup_plan_credits',
        'find_company_by_email',
        'get_infra_stats',
        'maintenance_cleanup',
        'fin_enable_for_company',
        'provision_company_atomic',
        'acquire_ai_pool_slot',
        'cooldown_ai_pool_key',
        'release_ai_pool_slot',
        'automation_claim_conversation',
        'automation_resume_waiting',
        'automation_start_execution',
        'claim_scheduled_content_posts',
        'meta_capi_reserve_event',
        'read_email_batch',
        'enqueue_email',
        'delete_email',
        'move_to_dlq',
        'push_notificacao',
        'search_agent_knowledge_chunks',
        'seed_fin_categorias',
        'seed_fixed_agents',
        'seed_pipelines_for_company',
        'gerar_notificacoes_agendamento',
        'email_queue_dispatch'
      ])
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', r.sig);
  END LOOP;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
