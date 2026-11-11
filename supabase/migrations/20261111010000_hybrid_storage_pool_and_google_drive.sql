-- ==============================================================================
-- Migração: Pool Rotativo de Almacenamiento Híbrido (Cloudflare R2 + Google Drive)
-- Soporta:
--   1. Pool multi-cuenta de Cloudflare R2 con rotación inteligente (Hot Tier)
--   2. Bóveda fría masiva en Google Drive (Cold Tier)
--   3. Mapeo jerárquico Empresa -> Clientes -> Archivos
--   4. RLS blindada: CERO exposición de secretos globales a clientes
--   5. 100% retrocompatible con cuentas y archivos existentes
-- ==============================================================================

-- 1. Tabla de Cuentas de Almacenamiento (Pool R2 y Bóvedas Drive)
CREATE TABLE IF NOT EXISTS public.storage_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.company(id) ON DELETE CASCADE, -- NULL = Pool global del sistema (solo accesible por service_role)
  provider text NOT NULL CHECK (provider IN ('cloudflare_r2', 'google_drive', 's3_compatible')),
  label text NOT NULL,
  role text NOT NULL DEFAULT 'hot_pool' CHECK (role IN ('hot_pool', 'cold_archive', 'backup')),
  is_active boolean NOT NULL DEFAULT true,
  priority integer NOT NULL DEFAULT 1, -- 1 = máxima prioridad en failover

  -- Credenciales Cloudflare R2 / S3
  account_id text,
  access_key_id text,
  secret_access_key text,
  bucket_name text,
  public_domain text,
  region text DEFAULT 'auto',
  endpoint text,

  -- Credenciales Google Drive
  google_service_account jsonb,
  google_root_folder_id text,

  -- Capacidad y Métricas de Uso
  max_capacity_bytes bigint NOT NULL DEFAULT 8589934592, -- 8 GB (umbral seguro para no exceder 10 GB gratis)
  current_usage_bytes bigint NOT NULL DEFAULT 0,
  file_count bigint NOT NULL DEFAULT 0,

  -- Estado de Salud y Monitoreo
  status text NOT NULL DEFAULT 'ready' CHECK (status IN ('ready', 'warning', 'full', 'error', 'syncing')),
  health_status text NOT NULL DEFAULT 'ok',
  last_health_check_at timestamptz,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Tabla de Configuración de Estrategia del Pool
CREATE TABLE IF NOT EXISTS public.storage_pool_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.company(id) ON DELETE CASCADE, -- NULL = Configuración global
  rotation_strategy text NOT NULL DEFAULT 'smart_failover' CHECK (rotation_strategy IN ('smart_failover', 'round_robin', 'least_used')),
  hot_retention_days integer NOT NULL DEFAULT 30,
  auto_archive_enabled boolean NOT NULL DEFAULT true,
  warning_threshold_percent integer NOT NULL DEFAULT 80,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Extensión de message_attachments para Hot/Cold Tiering
ALTER TABLE public.message_attachments 
  ADD COLUMN IF NOT EXISTS storage_tier text DEFAULT 'hot_r2',
  ADD COLUMN IF NOT EXISTS storage_account_id uuid REFERENCES public.storage_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cold_storage_file_id text,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

-- 4. Extensión de content_posts para Hot/Cold Tiering
ALTER TABLE public.content_posts 
  ADD COLUMN IF NOT EXISTS storage_tier text DEFAULT 'hot_r2',
  ADD COLUMN IF NOT EXISTS storage_account_id uuid REFERENCES public.storage_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cold_storage_file_id text,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

-- 5. Extensión para carpetas jerárquicas en Google Drive (Empresa y Cliente)
ALTER TABLE public.company 
  ADD COLUMN IF NOT EXISTS drive_folder_id text;

ALTER TABLE public.crm_cards 
  ADD COLUMN IF NOT EXISTS drive_folder_id text;

-- 6. Índices para consultas ultra rápidas
CREATE INDEX IF NOT EXISTS idx_storage_accounts_lookup 
  ON public.storage_accounts (provider, is_active, role, priority);

CREATE INDEX IF NOT EXISTS idx_storage_accounts_company 
  ON public.storage_accounts (company_id);

CREATE INDEX IF NOT EXISTS idx_message_attachments_tier 
  ON public.message_attachments (storage_tier, created_at);

CREATE INDEX IF NOT EXISTS idx_content_posts_tier 
  ON public.content_posts (storage_tier, created_at);

CREATE INDEX IF NOT EXISTS idx_crm_cards_drive_folder 
  ON public.crm_cards (company_id, drive_folder_id);

-- 7. RLS (Row Level Security) - BLINDAJE ESTRICTO MULTI-TENANT
ALTER TABLE public.storage_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storage_pool_settings ENABLE ROW LEVEL SECURITY;

-- Políticas de Seguridad para storage_accounts:
-- Los usuarios autenticados NUNCA tienen acceso a filas globales (company_id IS NULL)
-- Solo pueden ver y manipular filas explícitamente pertenecientes a su empresa si tienen rol 'owner' o 'admin'
DROP POLICY IF EXISTS storage_accounts_owner_admin ON public.storage_accounts;
DROP POLICY IF EXISTS storage_accounts_tenant_select ON public.storage_accounts;
DROP POLICY IF EXISTS storage_accounts_tenant_mutation ON public.storage_accounts;

CREATE POLICY storage_accounts_tenant_select ON public.storage_accounts
  FOR SELECT TO authenticated
  USING (
    company_id IS NOT NULL AND 
    EXISTS (
      SELECT 1 FROM public.company_user cu 
      WHERE cu.company_id = storage_accounts.company_id 
        AND cu.user_id = auth.uid() 
        AND cu.role IN ('owner', 'admin')
    )
  );

CREATE POLICY storage_accounts_tenant_mutation ON public.storage_accounts
  FOR ALL TO authenticated
  USING (
    company_id IS NOT NULL AND 
    EXISTS (
      SELECT 1 FROM public.company_user cu 
      WHERE cu.company_id = storage_accounts.company_id 
        AND cu.user_id = auth.uid() 
        AND cu.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    company_id IS NOT NULL AND 
    EXISTS (
      SELECT 1 FROM public.company_user cu 
      WHERE cu.company_id = storage_accounts.company_id 
        AND cu.user_id = auth.uid() 
        AND cu.role IN ('owner', 'admin')
    )
  );

-- Políticas de Seguridad para storage_pool_settings:
DROP POLICY IF EXISTS storage_pool_settings_owner_admin ON public.storage_pool_settings;
DROP POLICY IF EXISTS storage_pool_settings_tenant_select ON public.storage_pool_settings;
DROP POLICY IF EXISTS storage_pool_settings_tenant_mutation ON public.storage_pool_settings;

CREATE POLICY storage_pool_settings_tenant_select ON public.storage_pool_settings
  FOR SELECT TO authenticated
  USING (
    company_id IS NOT NULL AND 
    EXISTS (
      SELECT 1 FROM public.company_user cu 
      WHERE cu.company_id = storage_pool_settings.company_id 
        AND cu.user_id = auth.uid() 
        AND cu.role IN ('owner', 'admin')
    )
  );

CREATE POLICY storage_pool_settings_tenant_mutation ON public.storage_pool_settings
  FOR ALL TO authenticated
  USING (
    company_id IS NOT NULL AND 
    EXISTS (
      SELECT 1 FROM public.company_user cu 
      WHERE cu.company_id = storage_pool_settings.company_id 
        AND cu.user_id = auth.uid() 
        AND cu.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    company_id IS NOT NULL AND 
    EXISTS (
      SELECT 1 FROM public.company_user cu 
      WHERE cu.company_id = storage_pool_settings.company_id 
        AND cu.user_id = auth.uid() 
        AND cu.role IN ('owner', 'admin')
    )
  );
