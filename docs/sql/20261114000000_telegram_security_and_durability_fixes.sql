-- =========================================================================
-- Capiversa CRM — Migración Incremental de Seguridad y Durabilidad Telegram
-- Versión: v1.3.07 (14 de noviembre de 2026)
-- Corrige:
-- 1. P0-6: Restricción RLS estricta para telegram_connections.
-- 2. P0-3: Columnas de trazabilidad y errores en outbox de eventos entrantes.
-- 3. P0-4: Trazabilidad de fallos en social_backfill_state.
-- 4. P1-3: Soporte para identidades cualificadas por canal en publicaciones y comentarios.
-- =========================================================================

-- 1. Asegurar columnas de auditoría y error en telegram_business_bindings
ALTER TABLE public.telegram_business_bindings
  ADD COLUMN IF NOT EXISTS rights jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS last_error text;

-- 2. Asegurar columnas de auditoría y error en telegram_inbound_events
ALTER TABLE public.telegram_inbound_events
  ADD COLUMN IF NOT EXISTS last_error text;

CREATE INDEX IF NOT EXISTS idx_telegram_inbound_events_status
  ON public.telegram_inbound_events(connection_id, state);

-- 3. Asegurar columnas de auditoría y error en social_backfill_state
ALTER TABLE public.social_backfill_state
  ADD COLUMN IF NOT EXISTS last_error text;

-- 4. Refuerzo de Seguridad RLS en telegram_connections (P0-6)
-- Solo roles administrativos (owner/admin) pueden crear, modificar o eliminar conexiones técnicas de Telegram.
-- Las operaciones con el Bot Token (secret_ref) quedan restringidas a nivel administrativo y servidor (service_role).

DROP POLICY IF EXISTS telegram_connections_company_all ON public.telegram_connections;
DROP POLICY IF EXISTS telegram_connections_admin_all ON public.telegram_connections;
DROP POLICY IF EXISTS telegram_connections_member_select ON public.telegram_connections;

-- Política de lectura para miembros activos de la empresa
CREATE POLICY telegram_connections_member_select ON public.telegram_connections
FOR SELECT TO authenticated
USING (
  public.user_has_company(company_id)
);

-- Política de modificación exclusiva para administradores y propietarios
DROP POLICY IF EXISTS telegram_connections_admin_write ON public.telegram_connections;
CREATE POLICY telegram_connections_admin_write ON public.telegram_connections
FOR ALL TO authenticated
USING (
  public.user_company_role(company_id) IN ('owner', 'admin')
)
WITH CHECK (
  public.user_company_role(company_id) IN ('owner', 'admin')
);

-- Refuerzo de RLS en rutas de canales de Telegram
DROP POLICY IF EXISTS telegram_channel_routes_company_all ON public.telegram_channel_routes;
DROP POLICY IF EXISTS telegram_channel_routes_member_select ON public.telegram_channel_routes;
DROP POLICY IF EXISTS telegram_channel_routes_admin_write ON public.telegram_channel_routes;
CREATE POLICY telegram_channel_routes_member_select ON public.telegram_channel_routes
FOR SELECT TO authenticated
USING (
  public.user_has_company(company_id)
);

CREATE POLICY telegram_channel_routes_admin_write ON public.telegram_channel_routes
FOR ALL TO authenticated
USING (
  public.user_company_role(company_id) IN ('owner', 'admin')
)
WITH CHECK (
  public.user_company_role(company_id) IN ('owner', 'admin')
);

-- 5. Vista segura que excluye secret_ref para consumo de interfaz (P0-1: security_invoker = true)
CREATE OR REPLACE VIEW public.telegram_connections_safe
WITH (security_invoker = true) AS
SELECT
  id,
  company_id,
  transport,
  status,
  telegram_actor_id,
  display_name,
  username,
  rights,
  created_at,
  updated_at
FROM public.telegram_connections;

GRANT SELECT ON public.telegram_connections_safe TO authenticated;
