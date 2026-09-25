DROP INDEX IF EXISTS public.prospeccao_lead_place_uk;
CREATE UNIQUE INDEX IF NOT EXISTS prospeccao_lead_place_company_uk
  ON public.prospeccao_lead (company_id, place_id)
  WHERE place_id IS NOT NULL;