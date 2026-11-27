-- Migration #15: Verified External Agent Tools & Webhook Outbox
BEGIN;

-- 1. Tabla public.agent_tools (Herramientas HTTP/API verificadas del agente)
CREATE TABLE IF NOT EXISTS public.agent_tools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL REFERENCES public.agent_config(id) ON DELETE CASCADE,
  name text NOT NULL,
  display_name text NOT NULL,
  description text NOT NULL,
  kind text NOT NULL DEFAULT 'http' CHECK (kind IN ('http', 'webhook_out')),
  method text NOT NULL DEFAULT 'POST' CHECK (method IN ('GET', 'POST', 'PUT')),
  url text NOT NULL,
  headers jsonb NOT NULL DEFAULT '{}'::jsonb,
  input_schema jsonb NOT NULL DEFAULT '{}'::jsonb,
  body_template jsonb,
  permission_level text NOT NULL DEFAULT 'read_only' CHECK (
    permission_level IN ('read_only', 'write_confirm_customer', 'write_require_owner_approval')
  ),
  verified boolean NOT NULL DEFAULT false,
  verified_at timestamptz,
  last_test_status integer,
  last_test_latency_ms integer,
  last_test_sample jsonb,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agent_tools_agent_id_name_key UNIQUE (agent_id, name)
);

CREATE INDEX IF NOT EXISTS idx_agent_tools_company_agent_verified
  ON public.agent_tools (company_id, agent_id)
  WHERE active = true AND verified = true;

ALTER TABLE public.agent_tools ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agent_tools_select_admins ON public.agent_tools;
CREATE POLICY agent_tools_select_admins
  ON public.agent_tools
  FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin()
    OR public.has_company_role(company_id, ARRAY['owner'::text, 'admin'::text])
  );

DROP POLICY IF EXISTS agent_tools_insert_admins ON public.agent_tools;
CREATE POLICY agent_tools_insert_admins
  ON public.agent_tools
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_super_admin()
    OR public.has_company_role(company_id, ARRAY['owner'::text, 'admin'::text])
  );

DROP POLICY IF EXISTS agent_tools_update_admins ON public.agent_tools;
CREATE POLICY agent_tools_update_admins
  ON public.agent_tools
  FOR UPDATE
  TO authenticated
  USING (
    public.is_super_admin()
    OR public.has_company_role(company_id, ARRAY['owner'::text, 'admin'::text])
  )
  WITH CHECK (
    public.is_super_admin()
    OR public.has_company_role(company_id, ARRAY['owner'::text, 'admin'::text])
  );

DROP POLICY IF EXISTS agent_tools_delete_admins ON public.agent_tools;
CREATE POLICY agent_tools_delete_admins
  ON public.agent_tools
  FOR DELETE
  TO authenticated
  USING (
    public.is_super_admin()
    OR public.has_company_role(company_id, ARRAY['owner'::text, 'admin'::text])
  );

-- 2. Tabla public.agent_webhook_outbox (Envío real de webhooks salientes con estado)
CREATE TABLE IF NOT EXISTS public.agent_webhook_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  agent_id uuid,
  tool_id uuid REFERENCES public.agent_tools(id) ON DELETE SET NULL,
  numero text,
  inbound_message_id text,
  event_name text NOT NULL,
  url text NOT NULL,
  method text NOT NULL DEFAULT 'POST',
  headers jsonb NOT NULL DEFAULT '{}'::jsonb,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  http_status integer,
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_webhook_outbox_pending
  ON public.agent_webhook_outbox (status, created_at)
  WHERE status = 'pending';

CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_webhook_outbox_idem
  ON public.agent_webhook_outbox (company_id, inbound_message_id, event_name)
  WHERE inbound_message_id IS NOT NULL;

ALTER TABLE public.agent_webhook_outbox ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agent_webhook_outbox_select_admins ON public.agent_webhook_outbox;
CREATE POLICY agent_webhook_outbox_select_admins
  ON public.agent_webhook_outbox
  FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin()
    OR public.has_company_role(company_id, ARRAY['owner'::text, 'admin'::text])
  );

COMMIT;

NOTIFY pgrst, 'reload schema';
