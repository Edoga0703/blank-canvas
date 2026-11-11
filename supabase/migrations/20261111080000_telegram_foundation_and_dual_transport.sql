-- ==============================================================================
-- Migración: Fundación e Infraestructura de Telegram (Business Bot + MTProto QR)
-- Arquitectura dual:
--   1. Business Bot: Mensajería privada y atención al cliente en /app/conversas
--   2. MTProto Account: Publicaciones, canales, álbumes e hilos de discusión
-- ==============================================================================

-- 1. Ampliación de tablas sociales para soportar Telegram en el módulo de contenido
ALTER TABLE public.meta_social_accounts DROP CONSTRAINT IF EXISTS meta_social_accounts_network_check;
ALTER TABLE public.meta_social_accounts ADD CONSTRAINT meta_social_accounts_network_check 
  CHECK (network IN ('facebook', 'instagram', 'tiktok', 'youtube', 'telegram'));

ALTER TABLE public.meta_content_posts DROP CONSTRAINT IF EXISTS meta_content_posts_network_check;
ALTER TABLE public.meta_content_posts ADD CONSTRAINT meta_content_posts_network_check 
  CHECK (network IN ('facebook', 'instagram', 'tiktok', 'youtube', 'telegram'));

ALTER TABLE public.meta_content_comments DROP CONSTRAINT IF EXISTS meta_content_comments_network_check;
ALTER TABLE public.meta_content_comments ADD CONSTRAINT meta_content_comments_network_check 
  CHECK (network IN ('facebook', 'instagram', 'tiktok', 'youtube', 'telegram'));

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'content_post_targets_platform_check'
  ) THEN
    ALTER TABLE public.content_post_targets DROP CONSTRAINT content_post_targets_platform_check;
    ALTER TABLE public.content_post_targets ADD CONSTRAINT content_post_targets_platform_check 
      CHECK (platform IN ('facebook', 'instagram', 'tiktok', 'youtube', 'telegram'));
  END IF;
END $$;

-- 2. Tabla de Conexiones de Telegram (Aislada de whatsapp_instances)
CREATE TABLE IF NOT EXISTS public.telegram_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  legacy_instance_id uuid UNIQUE REFERENCES public.whatsapp_instances(id) ON DELETE SET NULL,
  transport text NOT NULL CHECK (transport IN ('business_bot', 'mtproto_account')),
  telegram_actor_id text,         -- ID numérico de Telegram guardado como texto para evitar desbordamiento int64
  display_name text,
  username text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'active', 'degraded', 'revoked', 'disconnected', 'legacy_pending_migration')),
  secret_ref text,                 -- Referencia al secreto en el vault del servidor
  encrypted_session_token text,    -- Sesión cifrada para cliente MTProto
  webhook_endpoint_key text UNIQUE, -- Clave opaca de URL pública sin tokens expuestos
  webhook_secret_hash text,        -- Hash SHA-256 de x-telegram-bot-api-secret-token
  rights jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, transport, telegram_actor_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS telegram_actor_one_owner
  ON public.telegram_connections(transport, telegram_actor_id)
  WHERE telegram_actor_id IS NOT NULL AND status <> 'disconnected';

-- 3. Vinculaciones de Telegram Business (Connected Business Bot)
CREATE TABLE IF NOT EXISTS public.telegram_business_bindings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  connection_id uuid NOT NULL REFERENCES public.telegram_connections(id) ON DELETE CASCADE,
  business_connection_id text NOT NULL,
  business_user_id text NOT NULL,
  can_reply boolean NOT NULL DEFAULT false,
  rights jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (connection_id, business_connection_id)
);

-- 4. Canales de Telegram para Publicación de Contenido
CREATE TABLE IF NOT EXISTS public.telegram_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  telegram_channel_id text NOT NULL,
  social_account_id uuid UNIQUE REFERENCES public.meta_social_accounts(id) ON DELETE SET NULL,
  username text,
  title text NOT NULL,
  visibility text NOT NULL CHECK (visibility IN ('public', 'private')),
  discussion_chat_id text,
  member_count bigint DEFAULT 0,
  member_count_observed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, telegram_channel_id)
);

-- 5. Rutas de Publicación y Cuentas Autorizadas por Canal
CREATE TABLE IF NOT EXISTS public.telegram_channel_routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  channel_id uuid NOT NULL REFERENCES public.telegram_channels(id) ON DELETE CASCADE,
  connection_id uuid NOT NULL REFERENCES public.telegram_connections(id) ON DELETE CASCADE,
  can_post boolean NOT NULL DEFAULT false,
  can_edit boolean NOT NULL DEFAULT false,
  can_delete boolean NOT NULL DEFAULT false,
  can_manage_discussion boolean NOT NULL DEFAULT false,
  preferred boolean NOT NULL DEFAULT false,
  rights_checked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (channel_id, connection_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS telegram_channel_one_preferred_route
  ON public.telegram_channel_routes(channel_id) WHERE preferred;

-- 6. Cola Durable de Eventos Inbound de Telegram
CREATE TABLE IF NOT EXISTS public.telegram_inbound_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  connection_id uuid NOT NULL REFERENCES public.telegram_connections(id) ON DELETE CASCADE,
  source text NOT NULL CHECK (source IN ('bot_webhook', 'tdlib_update', 'teleproto_update')),
  event_key text NOT NULL,
  payload jsonb NOT NULL,
  state text NOT NULL DEFAULT 'pending'
    CHECK (state IN ('pending', 'processing', 'processed', 'retry_wait', 'dead')),
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz,
  lease_owner text,
  lease_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (connection_id, event_key)
);

CREATE INDEX IF NOT EXISTS telegram_inbound_claim_idx
  ON public.telegram_inbound_events(state, next_attempt_at, lease_until);

-- 7. Ítems de Publicación de Canales (Soporte Completo de Álbumes / Media Groups)
CREATE TABLE IF NOT EXISTS public.telegram_post_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  target_id uuid REFERENCES public.content_post_targets(id) ON DELETE SET NULL,
  channel_id uuid NOT NULL REFERENCES public.telegram_channels(id) ON DELETE CASCADE,
  item_index integer NOT NULL DEFAULT 0 CHECK (item_index >= 0),
  telegram_message_id text NOT NULL,
  media_group_id text,
  published_at timestamptz NOT NULL DEFAULT now(),
  edited_at timestamptz,
  deleted_at timestamptz,
  UNIQUE (channel_id, telegram_message_id)
);

-- 8. Hilos de Comentarios y Discusión Vinculados a Canales
CREATE TABLE IF NOT EXISTS public.telegram_comment_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  channel_id uuid NOT NULL REFERENCES public.telegram_channels(id) ON DELETE CASCADE,
  channel_message_id text NOT NULL,
  discussion_chat_id text NOT NULL,
  root_message_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (channel_id, channel_message_id),
  UNIQUE (discussion_chat_id, root_message_id, company_id)
);

-- 9. Métricas Observadas de Publicaciones en Telegram
CREATE TABLE IF NOT EXISTS public.telegram_post_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  channel_id uuid NOT NULL REFERENCES public.telegram_channels(id) ON DELETE CASCADE,
  telegram_message_id text NOT NULL,
  observed_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL CHECK (source IN ('mtproto_message', 'mtproto_stats', 'own_analytics')),
  views bigint DEFAULT 0,
  forwards bigint DEFAULT 0,
  replies bigint DEFAULT 0,
  reactions jsonb DEFAULT '{}'::jsonb,
  metrics_available jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (channel_id, telegram_message_id, observed_at, source)
);

-- 10. Políticas RLS de Seguridad Multi-Tenant
ALTER TABLE public.telegram_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telegram_business_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telegram_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telegram_channel_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telegram_inbound_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telegram_post_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telegram_comment_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telegram_post_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS telegram_connections_company_all ON public.telegram_connections;
CREATE POLICY telegram_connections_company_all ON public.telegram_connections
FOR ALL TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.company_user cu
  WHERE cu.company_id = telegram_connections.company_id
    AND cu.user_id = auth.uid() AND cu.ativo = true
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.company_user cu
  WHERE cu.company_id = telegram_connections.company_id
    AND cu.user_id = auth.uid() AND cu.ativo = true
));

DROP POLICY IF EXISTS telegram_channels_company_all ON public.telegram_channels;
CREATE POLICY telegram_channels_company_all ON public.telegram_channels
FOR ALL TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.company_user cu
  WHERE cu.company_id = telegram_channels.company_id
    AND cu.user_id = auth.uid() AND cu.ativo = true
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.company_user cu
  WHERE cu.company_id = telegram_channels.company_id
    AND cu.user_id = auth.uid() AND cu.ativo = true
));

DROP POLICY IF EXISTS telegram_channel_routes_company_all ON public.telegram_channel_routes;
CREATE POLICY telegram_channel_routes_company_all ON public.telegram_channel_routes
FOR ALL TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.company_user cu
  WHERE cu.company_id = telegram_channel_routes.company_id
    AND cu.user_id = auth.uid() AND cu.ativo = true
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.company_user cu
  WHERE cu.company_id = telegram_channel_routes.company_id
    AND cu.user_id = auth.uid() AND cu.ativo = true
));

DROP POLICY IF EXISTS telegram_business_bindings_company_all ON public.telegram_business_bindings;
CREATE POLICY telegram_business_bindings_company_all ON public.telegram_business_bindings
FOR ALL TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.company_user cu
  WHERE cu.company_id = telegram_business_bindings.company_id
    AND cu.user_id = auth.uid() AND cu.ativo = true
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.company_user cu
  WHERE cu.company_id = telegram_business_bindings.company_id
    AND cu.user_id = auth.uid() AND cu.ativo = true
));

DROP POLICY IF EXISTS telegram_post_items_company_all ON public.telegram_post_items;
CREATE POLICY telegram_post_items_company_all ON public.telegram_post_items
FOR ALL TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.company_user cu
  WHERE cu.company_id = telegram_post_items.company_id
    AND cu.user_id = auth.uid() AND cu.ativo = true
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.company_user cu
  WHERE cu.company_id = telegram_post_items.company_id
    AND cu.user_id = auth.uid() AND cu.ativo = true
));

DROP POLICY IF EXISTS telegram_comment_threads_company_all ON public.telegram_comment_threads;
CREATE POLICY telegram_comment_threads_company_all ON public.telegram_comment_threads
FOR ALL TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.company_user cu
  WHERE cu.company_id = telegram_comment_threads.company_id
    AND cu.user_id = auth.uid() AND cu.ativo = true
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.company_user cu
  WHERE cu.company_id = telegram_comment_threads.company_id
    AND cu.user_id = auth.uid() AND cu.ativo = true
));

DROP POLICY IF EXISTS telegram_post_metrics_company_all ON public.telegram_post_metrics;
CREATE POLICY telegram_post_metrics_company_all ON public.telegram_post_metrics
FOR ALL TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.company_user cu
  WHERE cu.company_id = telegram_post_metrics.company_id
    AND cu.user_id = auth.uid() AND cu.ativo = true
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.company_user cu
  WHERE cu.company_id = telegram_post_metrics.company_id
    AND cu.user_id = auth.uid() AND cu.ativo = true
));

-- La cola interna de eventos solo es accesible por el servicio/admin
REVOKE ALL ON public.telegram_inbound_events FROM anon, authenticated;

-- 11. Migración Asistida de Registros Legados (Desde whatsapp_instances)
INSERT INTO public.telegram_connections (
  company_id,
  legacy_instance_id,
  transport,
  telegram_actor_id,
  display_name,
  status,
  webhook_endpoint_key,
  rights
)
SELECT 
  wi.company_id,
  wi.id,
  'business_bot' AS transport,
  wi.numero AS telegram_actor_id,
  COALESCE(wi.display_name, 'Telegram Bot Legado') AS display_name,
  'legacy_pending_migration' AS status,
  wi.webhook_token AS webhook_endpoint_key,
  jsonb_build_object('migrated_from_whatsapp_instances', true, 'legacy_instance_name', wi.instance_name)
FROM public.whatsapp_instances wi
WHERE (wi.provider = 'telegram' OR wi.provider_type = 'telegram')
ON CONFLICT DO NOTHING;
