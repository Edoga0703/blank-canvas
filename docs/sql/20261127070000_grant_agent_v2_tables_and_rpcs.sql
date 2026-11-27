-- Migration #18: Grant table and RPC privileges to authenticated and service_role
BEGIN;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.agent_knowledge_chunks,
  public.ai_turn_traces,
  public.agent_tools,
  public.agent_webhook_outbox,
  public.agent_approval_requests,
  public.agent_config_versions
TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION
  public.search_agent_knowledge_chunks(uuid, uuid, text, integer),
  public.debit_ai_credits_atomic(uuid, integer)
TO authenticated, service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
