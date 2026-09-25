ALTER TABLE public.prospeccao_lead
  ADD COLUMN IF NOT EXISTS lote_id uuid,
  ADD COLUMN IF NOT EXISTS lote_em timestamptz,
  ADD COLUMN IF NOT EXISTS abordagem_texto text,
  ADD COLUMN IF NOT EXISTS abordagem_foco text,
  ADD COLUMN IF NOT EXISTS abordagem_analise text,
  ADD COLUMN IF NOT EXISTS abordagem_em timestamptz,
  ADD COLUMN IF NOT EXISTS disparo_em timestamptz,
  ADD COLUMN IF NOT EXISTS disparo_por uuid;

CREATE INDEX IF NOT EXISTS prospeccao_lead_lote_idx ON public.prospeccao_lead (company_id, lote_id);
CREATE INDEX IF NOT EXISTS prospeccao_lead_disparo_idx ON public.prospeccao_lead (company_id, disparo_em);