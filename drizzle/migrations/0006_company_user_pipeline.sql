CREATE TABLE public.company_user_pipeline (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  pipeline_id uuid NOT NULL REFERENCES public.crm_pipeline(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, user_id, pipeline_id)
);

CREATE INDEX company_user_pipeline_user_idx ON public.company_user_pipeline (company_id, user_id);

GRANT SELECT ON public.company_user_pipeline TO authenticated;
GRANT ALL ON public.company_user_pipeline TO service_role;

ALTER TABLE public.company_user_pipeline ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read company pipeline access"
ON public.company_user_pipeline
FOR SELECT
TO authenticated
USING (public.has_company_access(company_id));