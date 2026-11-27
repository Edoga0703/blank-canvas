-- Capiversa CRM — Fase 2: Planes Unificados (QR vs. API Oficial, BRL/USD, Créditos), Cierre RLS Telemetría IA
BEGIN;

-- 1) Cerrar lectura directa de ai_usage_events desde el navegador (evita exponer cost_usd_micros y key_alias vía PostgREST; el cliente lee solo por getMyCompanyAiUsageFn)
DROP POLICY IF EXISTS "ai_usage_events_company_read" ON public.ai_usage_events;

-- 2) Extender public.plan in-place conservando los UUID existentes
ALTER TABLE public.plan
  ADD COLUMN IF NOT EXISTS limite_conexoes_oficiais int4 NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS preco_usd_cents int4 NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS preco_anual_brl_cents int4 NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS preco_anual_usd_cents int4 NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS desconto_anual_pct int4 NOT NULL DEFAULT 20;

-- 3) Extender public.subscription in-place
ALTER TABLE public.subscription
  ADD COLUMN IF NOT EXISTS moeda text NOT NULL DEFAULT 'BRL',
  ADD COLUMN IF NOT EXISTS extra_conexoes_oficiais int4 NOT NULL DEFAULT 0;

-- 4) Normalizar plan.features a objeto JSONB canónico donde hoy es array [] y corregir creditos_mensais = 0
UPDATE public.plan
SET
  creditos_mensais = CASE
    WHEN creditos_mensais > 0 THEN creditos_mensais
    WHEN slug = 'starter' THEN 1500
    WHEN slug = 'pro' THEN 5000
    WHEN slug = 'business' THEN 15000
    ELSE 1500
  END,
  creditos_trial = CASE
    WHEN creditos_trial > 0 THEN creditos_trial
    ELSE 300
  END,
  preco_usd_cents = CASE
    WHEN preco_usd_cents > 0 THEN preco_usd_cents
    WHEN slug = 'starter' THEN 3900
    WHEN slug = 'pro' THEN 7900
    WHEN slug = 'business' THEN 14900
    ELSE ROUND(preco_cents / 5.8)::int4
  END,
  preco_anual_brl_cents = CASE
    WHEN preco_anual_brl_cents > 0 THEN preco_anual_brl_cents
    ELSE ROUND(preco_cents * 0.80)::int4
  END,
  preco_anual_usd_cents = CASE
    WHEN preco_anual_usd_cents > 0 THEN preco_anual_usd_cents
    WHEN slug = 'starter' THEN 3100
    WHEN slug = 'pro' THEN 6300
    WHEN slug = 'business' THEN 11900
    ELSE ROUND((preco_cents / 5.8) * 0.80)::int4
  END,
  limite_conexoes_oficiais = CASE
    WHEN slug = 'starter' THEN 2
    WHEN slug = 'pro' THEN 10
    WHEN slug = 'business' THEN 50
    ELSE 10
  END,
  features = CASE
    WHEN jsonb_typeof(features) = 'object' THEN features
    WHEN slug = 'starter' THEN '{"whatsapp_dapi":true,"whatsapp_oficial":true,"instagram":true,"facebook":true,"telegram":true,"ia":true,"automacoes":true,"campanhas":true,"meta_publicacoes":false,"meta_capi":false,"api_webhooks":false,"radar":false,"r2_storage":true,"treinamentos":true,"permite_dapi_trial":false}'::jsonb
    WHEN slug = 'pro' THEN '{"whatsapp_dapi":true,"whatsapp_oficial":true,"instagram":true,"facebook":true,"telegram":true,"ia":true,"automacoes":true,"campanhas":true,"meta_publicacoes":true,"meta_capi":false,"api_webhooks":true,"radar":true,"r2_storage":true,"treinamentos":true,"permite_dapi_trial":false}'::jsonb
    ELSE '{"whatsapp_dapi":true,"whatsapp_oficial":true,"instagram":true,"facebook":true,"telegram":true,"ia":true,"automacoes":true,"campanhas":true,"meta_publicacoes":true,"meta_capi":true,"api_webhooks":true,"radar":true,"r2_storage":true,"treinamentos":true,"permite_dapi_trial":false}'::jsonb
  END,
  updated_at = now()
WHERE slug IS NOT NULL;

COMMIT;

NOTIFY pgrst, 'reload schema';
