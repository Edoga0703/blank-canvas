-- Migración: Soporte Completo para Meta Conversions API (CAPI) y Business Messaging
-- Versión: 20261026120000_meta_capi_business_messaging.sql

-- 1. Agregar columna meta_conversion_event a crm_stage
ALTER TABLE public.crm_stage 
ADD COLUMN IF NOT EXISTS meta_conversion_event TEXT DEFAULT NULL;

COMMENT ON COLUMN public.crm_stage.meta_conversion_event IS 'Evento de Meta CAPI disparado al entrar a esta etapa (ej: LeadSubmitted, QualifiedLead, Purchase).';

-- 2. Agregar columna meta_dataset_id a whatsapp_instances
ALTER TABLE public.whatsapp_instances 
ADD COLUMN IF NOT EXISTS meta_dataset_id TEXT DEFAULT NULL;

-- 3. Tabla de Configuración de Meta CAPI por Empresa
CREATE TABLE IF NOT EXISTS public.meta_capi_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  ativo BOOLEAN NOT NULL DEFAULT false,
  modo_conexao TEXT NOT NULL DEFAULT 'waba_official', -- 'waba_official' | 'pixel_tradicional'
  access_token TEXT DEFAULT NULL,
  waba_id TEXT DEFAULT NULL,
  page_id TEXT DEFAULT NULL,
  instagram_account_id TEXT DEFAULT NULL,
  dataset_id TEXT DEFAULT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  test_event_code TEXT DEFAULT NULL,
  enable_sha256_fallback BOOLEAN NOT NULL DEFAULT true,
  auto_send_on_stage_change BOOLEAN NOT NULL DEFAULT true,
  auto_send_on_sale BOOLEAN NOT NULL DEFAULT true,
  auto_send_on_appointment BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_meta_capi_config_company UNIQUE (company_id)
);

-- 4. Tabla de Auditoría y Deduplicación de Eventos Meta CAPI
CREATE TABLE IF NOT EXISTS public.meta_capi_event_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  card_id UUID REFERENCES public.crm_cards(id) ON DELETE SET NULL,
  dedup_key TEXT NOT NULL,
  event_name TEXT NOT NULL,
  action_source TEXT NOT NULL,
  messaging_channel TEXT DEFAULT NULL,
  dataset_id TEXT NOT NULL,
  ctwa_clid TEXT DEFAULT NULL,
  value NUMERIC DEFAULT NULL,
  currency TEXT DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'pending', -- 'sent', 'failed', 'skipped'
  fbtrace_id TEXT DEFAULT NULL,
  error_message TEXT DEFAULT NULL,
  request_payload JSONB DEFAULT NULL,
  response_payload JSONB DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_meta_capi_event_dedup UNIQUE (company_id, dedup_key)
);

-- 5. Tabla de Sesiones de Clics para Links Rastreables con Protocolo
CREATE TABLE IF NOT EXISTS public.lead_click_session (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  slug TEXT DEFAULT NULL,
  fbclid TEXT DEFAULT NULL,
  gclid TEXT DEFAULT NULL,
  fbc TEXT DEFAULT NULL,
  fbp TEXT DEFAULT NULL,
  utm_source TEXT DEFAULT NULL,
  utm_medium TEXT DEFAULT NULL,
  utm_campaign TEXT DEFAULT NULL,
  utm_term TEXT DEFAULT NULL,
  utm_content TEXT DEFAULT NULL,
  client_ip TEXT DEFAULT NULL,
  client_user_agent TEXT DEFAULT NULL,
  referrer TEXT DEFAULT NULL,
  first_page TEXT DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_lead_click_session_code UNIQUE (company_id, code)
);

-- 6. Índices para Alto Rendimiento
CREATE INDEX IF NOT EXISTS idx_meta_capi_event_log_company ON public.meta_capi_event_log(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_click_session_lookup ON public.lead_click_session(company_id, code);

ALTER TABLE public.meta_capi_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_capi_event_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_click_session ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS meta_capi_event_log_select_company ON public.meta_capi_event_log;
CREATE POLICY meta_capi_event_log_select_company
  ON public.meta_capi_event_log
  FOR SELECT
  TO authenticated
  USING (
    company_id IN (
      SELECT cu.company_id FROM public.company_user cu
      WHERE cu.user_id = auth.uid() AND cu.ativo = true
    )
  );
