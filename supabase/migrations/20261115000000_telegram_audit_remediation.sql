-- =========================================================================
-- Capiversa CRM — Migración Incremental de Remediación de Auditoría
-- Versión: v1.3.07 (15 de noviembre de 2026)
-- Corrige:
-- 1. P0-1: Asegurar security_invoker = true en public.telegram_connections_safe
-- 2. P0-3: Agregar columna updated_at y ampliar CHECK de estado en telegram_inbound_events
-- 3. P2: Idempotencia estricta en políticas RLS de conexiones y rutas
-- =========================================================================

-- 1. Asegurar columna updated_at en telegram_inbound_events (P0-3)
ALTER TABLE public.telegram_inbound_events
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- 2. Permitir estado 'failed' en el CHECK constraint de telegram_inbound_events (P0-3)
DO $$
BEGIN
  ALTER TABLE public.telegram_inbound_events
    DROP CONSTRAINT IF EXISTS telegram_inbound_events_state_check;
  
  ALTER TABLE public.telegram_inbound_events
    ADD CONSTRAINT telegram_inbound_events_state_check
    CHECK (state IN ('pending', 'processing', 'processed', 'retry_wait', 'dead', 'failed'));
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

-- 3. Asegurar security_invoker = true en la vista segura (P0-1)
-- Garantiza que la vista ejecute con las políticas RLS del usuario autenticado y aísle por empresa
DO $$
BEGIN
  ALTER VIEW public.telegram_connections_safe SET (security_invoker = true);
EXCEPTION
  WHEN OTHERS THEN
    CREATE OR REPLACE VIEW public.telegram_connections_safe
    WITH (security_invoker = true) AS
    SELECT
      id, company_id, transport, status, telegram_actor_id,
      display_name, username, rights, created_at, updated_at
    FROM public.telegram_connections;
END $$;

-- 4. Idempotencia en políticas RLS (P2)
DROP POLICY IF EXISTS telegram_connections_admin_write ON public.telegram_connections;
CREATE POLICY telegram_connections_admin_write ON public.telegram_connections
FOR ALL TO authenticated
USING (
  public.user_company_role(company_id) IN ('owner', 'admin')
)
WITH CHECK (
  public.user_company_role(company_id) IN ('owner', 'admin')
);

DROP POLICY IF EXISTS telegram_channel_routes_member_select ON public.telegram_channel_routes;
CREATE POLICY telegram_channel_routes_member_select ON public.telegram_channel_routes
FOR SELECT TO authenticated
USING (
  public.user_has_company(company_id)
);

DROP POLICY IF EXISTS telegram_channel_routes_admin_write ON public.telegram_channel_routes;
CREATE POLICY telegram_channel_routes_admin_write ON public.telegram_channel_routes
FOR ALL TO authenticated
USING (
  public.user_company_role(company_id) IN ('owner', 'admin')
)
WITH CHECK (
  public.user_company_role(company_id) IN ('owner', 'admin')
);
