-- Migration #19: Persistent AI Studio Copilot sessions & messages with RLS and GRANTs
BEGIN;

CREATE TABLE IF NOT EXISTS public.agent_copilot_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL REFERENCES public.agent_config(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  title text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_acs_company_agent_user_updated
  ON public.agent_copilot_sessions (company_id, agent_id, user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.agent_copilot_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.agent_copilot_sessions(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  proposals jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_acm_session_created
  ON public.agent_copilot_messages (session_id, created_at ASC);

ALTER TABLE public.agent_copilot_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_copilot_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "agent_copilot_sessions_admin_all" ON public.agent_copilot_sessions;
CREATE POLICY "agent_copilot_sessions_admin_all"
  ON public.agent_copilot_sessions
  FOR ALL
  TO authenticated
  USING (is_super_admin() OR has_company_role(company_id, ARRAY['owner'::text, 'admin'::text]))
  WITH CHECK (is_super_admin() OR has_company_role(company_id, ARRAY['owner'::text, 'admin'::text]));

DROP POLICY IF EXISTS "agent_copilot_messages_admin_all" ON public.agent_copilot_messages;
CREATE POLICY "agent_copilot_messages_admin_all"
  ON public.agent_copilot_messages
  FOR ALL
  TO authenticated
  USING (is_super_admin() OR has_company_role(company_id, ARRAY['owner'::text, 'admin'::text]))
  WITH CHECK (is_super_admin() OR has_company_role(company_id, ARRAY['owner'::text, 'admin'::text]));

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.agent_copilot_sessions,
  public.agent_copilot_messages
TO authenticated, service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
