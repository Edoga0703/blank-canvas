ALTER TABLE public.prospeccao_lead
  ADD COLUMN IF NOT EXISTS site_status text,
  ADD COLUMN IF NOT EXISTS site_nota int,
  ADD COLUMN IF NOT EXISTS site_diagnostico text,
  ADD COLUMN IF NOT EXISTS site_oportunidades text,
  ADD COLUMN IF NOT EXISTS site_verificado_em timestamptz,
  ADD COLUMN IF NOT EXISTS site_dados jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS prospeccao_lead_site_status_idx ON public.prospeccao_lead (site_status);