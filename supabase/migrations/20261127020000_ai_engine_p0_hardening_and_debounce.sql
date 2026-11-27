-- Migration #13: AI Engine P0 Hardening, RLS Fix, Backlog Cleanup & Durable Debounce
BEGIN;

-- 1. Cerrar hueco RLS en public.agent_config (solo lectura para atendentes; escritura restringida a owner/admin/super_admin)
DROP POLICY IF EXISTS agent_config_company_access ON public.agent_config;
DROP POLICY IF EXISTS agent_config_company_read ON public.agent_config;
CREATE POLICY agent_config_company_read
  ON public.agent_config
  FOR SELECT
  TO authenticated
  USING (public.user_has_company(company_id) OR public.is_super_admin());

DROP POLICY IF EXISTS agent_config_insert_admins ON public.agent_config;
CREATE POLICY agent_config_insert_admins
  ON public.agent_config
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_super_admin()
    OR public.has_company_role(company_id, ARRAY['owner'::text, 'admin'::text])
  );

DROP POLICY IF EXISTS agent_config_update_admins ON public.agent_config;
CREATE POLICY agent_config_update_admins
  ON public.agent_config
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

DROP POLICY IF EXISTS agent_config_delete_admins ON public.agent_config;
CREATE POLICY agent_config_delete_admins
  ON public.agent_config
  FOR DELETE
  TO authenticated
  USING (
    public.is_super_admin()
    OR public.has_company_role(company_id, ARRAY['owner'::text, 'admin'::text])
  );

-- 2. Limpieza segura del backlog histórico acumulado
-- Nota: automation_inbound_fallback_jobs_status_check permite: pending, leased, done, failed
UPDATE public.automation_inbound_fallback_jobs
SET status = 'failed',
    lease_owner = NULL,
    lease_until = NULL,
    last_error = 'expired_historical_backlog'
WHERE status = 'pending'
  AND created_at < now() - interval '15 minutes';

UPDATE public.ai_message_processing
SET status = 'failed',
    error_message = 'stale_processing_cleanup',
    updated_at = now()
WHERE status = 'processing'
  AND created_at < now() - interval '10 minutes';

-- 3. Extensión e índice de rendimiento
CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE INDEX IF NOT EXISTS idx_mensagens_company_numero_instance_created
  ON public.mensagens (company_id, numero, instance_id, created_at DESC);

-- 4. Columnas e índice parcial para debounce durable en public.ai_message_processing
ALTER TABLE public.ai_message_processing
  ADD COLUMN IF NOT EXISTS instance_id uuid,
  ADD COLUMN IF NOT EXISTS channel text,
  ADD COLUMN IF NOT EXISTS provider text,
  ADD COLUMN IF NOT EXISTS external_conversation_id text,
  ADD COLUMN IF NOT EXISTS responder_em_audio boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS incoming_text text,
  ADD COLUMN IF NOT EXISTS debounce_until timestamptz,
  ADD COLUMN IF NOT EXISTS lease_until timestamptz;

ALTER TABLE public.ai_message_processing
  DROP CONSTRAINT IF EXISTS ai_message_processing_status_check;

ALTER TABLE public.ai_message_processing
  ADD CONSTRAINT ai_message_processing_status_check
  CHECK (status = ANY (ARRAY['debouncing'::text, 'processing'::text, 'completed'::text, 'failed'::text, 'skipped'::text]));

CREATE INDEX IF NOT EXISTS idx_ai_msg_proc_debouncing
  ON public.ai_message_processing (debounce_until)
  WHERE status = 'debouncing';

-- 5. RPC atómico para débito de créditos de IA
CREATE OR REPLACE FUNCTION public.debit_ai_credits_atomic(_company_id uuid, _qtd integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _novo integer;
BEGIN
  UPDATE public.company
  SET creditos_saldo = GREATEST(0, COALESCE(creditos_saldo, 0) - GREATEST(1, COALESCE(_qtd, 1)))
  WHERE id = _company_id
  RETURNING creditos_saldo INTO _novo;

  RETURN _novo;
END;
$function$;

-- 6. Normalizar agent_config.canais_ativos incluyendo "messenger"
ALTER TABLE public.agent_config
  ALTER COLUMN canais_ativos SET DEFAULT '{"telegram": true, "whatsapp": true, "instagram": true, "messenger": true}'::jsonb;

UPDATE public.agent_config
SET canais_ativos = COALESCE(canais_ativos, '{}'::jsonb) || '{"messenger": true}'::jsonb
WHERE canais_ativos IS NULL OR NOT (canais_ativos ? 'messenger');

COMMIT;

NOTIFY pgrst, 'reload schema';
