-- Capiversa CRM — Fase 1: Pool Multi-Llave de IA (Drael/Multi-Provider) + Telemetría Unificada
BEGIN;

CREATE TABLE IF NOT EXISTS public.ai_provider_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL CHECK (provider IN ('drael', 'gemini', 'openai', 'anthropic', 'groq')),
  alias text NOT NULL,
  api_key text NOT NULL,
  max_concurrency int4 NOT NULL DEFAULT 4 CHECK (max_concurrency >= 1 AND max_concurrency <= 50),
  active boolean NOT NULL DEFAULT true,
  priority int4 NOT NULL DEFAULT 1,
  cooldown_until timestamptz,
  last_used_at timestamptz,
  last_error text,
  total_requests int8 NOT NULL DEFAULT 0,
  rate_limit_hits int4 NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_provider_keys_active
  ON public.ai_provider_keys (provider, active, priority);

CREATE TABLE IF NOT EXISTS public.ai_key_leases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key_id uuid NOT NULL REFERENCES public.ai_provider_keys(id) ON DELETE CASCADE,
  holder_id text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_key_leases_key_exp
  ON public.ai_key_leases (key_id, expires_at);

CREATE TABLE IF NOT EXISTS public.ai_usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.company(id) ON DELETE CASCADE,
  user_id uuid,
  agent_id uuid,
  provider text NOT NULL,
  model text NOT NULL,
  key_id uuid REFERENCES public.ai_provider_keys(id) ON DELETE SET NULL,
  key_alias text,
  feature text NOT NULL DEFAULT 'chat_agent',
  input_tokens int4 NOT NULL DEFAULT 0,
  output_tokens int4 NOT NULL DEFAULT 0,
  audio_seconds int4 NOT NULL DEFAULT 0,
  credits_charged int4 NOT NULL DEFAULT 1,
  cost_usd_micros int8 NOT NULL DEFAULT 0,
  latency_ms int4 NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'ok' CHECK (status IN ('ok', 'rate_limited', 'error')),
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_events_company_date
  ON public.ai_usage_events (company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_usage_events_provider_date
  ON public.ai_usage_events (provider, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_usage_events_user_date
  ON public.ai_usage_events (company_id, user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

ALTER TABLE public.ai_provider_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_key_leases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_usage_events ENABLE ROW LEVEL SECURITY;

-- Solo service_role manipula keys y leases; empresas autenticadas pueden leer solo sus propios eventos de uso (sin exponer cost_usd_micros en la API cliente)
DROP POLICY IF EXISTS "ai_usage_events_company_read" ON public.ai_usage_events;
CREATE POLICY "ai_usage_events_company_read"
  ON public.ai_usage_events
  FOR SELECT TO authenticated
  USING (company_id IN (
    SELECT cu.company_id FROM public.company_user cu
    WHERE cu.user_id = auth.uid() AND cu.ativo = true
  ));

-- RPC atómica para adquirir 1 turno (slot) en la llave menos cargada del pool (Least-Loaded Round-Robin)
CREATE OR REPLACE FUNCTION public.acquire_ai_pool_slot(
  p_provider text,
  p_holder_id text,
  p_lease_seconds int4 DEFAULT 45,
  p_exclude_key_ids uuid[] DEFAULT ARRAY[]::uuid[]
) RETURNS TABLE(lease_id uuid, key_id uuid, alias text, api_key text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE
  v_key record;
  v_lease_id uuid;
  v_now timestamptz := now();
BEGIN
  -- Limpiar leases vencidos del proveedor
  DELETE FROM public.ai_key_leases l
  USING public.ai_provider_keys k
  WHERE l.key_id = k.id AND k.provider = p_provider AND l.expires_at <= v_now;

  -- Seleccionar la llave activa, fuera de cooldown, con menor carga activa (< max_concurrency) y menos usada recientemente
  SELECT k.id, k.alias, k.api_key
  INTO v_key
  FROM public.ai_provider_keys k
  LEFT JOIN LATERAL (
    SELECT count(*)::int4 AS active_slots
    FROM public.ai_key_leases l
    WHERE l.key_id = k.id AND l.expires_at > v_now
  ) s ON true
  WHERE k.provider = p_provider
    AND k.active = true
    AND (k.cooldown_until IS NULL OR k.cooldown_until <= v_now)
    AND NOT (k.id = ANY(COALESCE(p_exclude_key_ids, ARRAY[]::uuid[])))
    AND COALESCE(s.active_slots, 0) < k.max_concurrency
  ORDER BY COALESCE(s.active_slots, 0) ASC, k.priority ASC, k.last_used_at ASC NULLS FIRST
  LIMIT 1
  FOR UPDATE OF k SKIP LOCKED;

  IF v_key.id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.ai_key_leases (key_id, holder_id, expires_at)
  VALUES (v_key.id, p_holder_id, v_now + make_interval(secs => GREATEST(10, LEAST(p_lease_seconds, 180))))
  RETURNING id INTO v_lease_id;

  UPDATE public.ai_provider_keys
  SET last_used_at = v_now, total_requests = total_requests + 1, updated_at = v_now
  WHERE id = v_key.id;

  RETURN QUERY SELECT v_lease_id, v_key.id, v_key.alias, v_key.api_key;
END $fn$;

CREATE OR REPLACE FUNCTION public.release_ai_pool_slot(p_lease_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
BEGIN
  DELETE FROM public.ai_key_leases WHERE id = p_lease_id;
END $fn$;

CREATE OR REPLACE FUNCTION public.cooldown_ai_pool_key(
  p_key_id uuid,
  p_cooldown_seconds int4 DEFAULT 15,
  p_error text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
BEGIN
  UPDATE public.ai_provider_keys
  SET cooldown_until = now() + make_interval(secs => GREATEST(5, LEAST(p_cooldown_seconds, 3600))),
      rate_limit_hits = rate_limit_hits + 1,
      last_error = LEFT(COALESCE(p_error, last_error), 400),
      updated_at = now()
  WHERE id = p_key_id;
END $fn$;

REVOKE ALL ON FUNCTION public.acquire_ai_pool_slot(text,text,int4,uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_ai_pool_slot(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cooldown_ai_pool_key(uuid,int4,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.acquire_ai_pool_slot(text,text,int4,uuid[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_ai_pool_slot(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.cooldown_ai_pool_key(uuid,int4,text) TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
