ALTER TABLE public.crm_pipeline ADD COLUMN IF NOT EXISTS entrada BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.company ADD COLUMN IF NOT EXISTS distribuicao_manual BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.department ADD COLUMN IF NOT EXISTS pipeline_id UUID REFERENCES public.crm_pipeline(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS crm_pipeline_entrada_unica ON public.crm_pipeline (company_id) WHERE entrada;