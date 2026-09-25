CREATE TABLE public.agenda_local (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  nome text NOT NULL,
  endereco text NOT NULL,
  padrao boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX agenda_local_company_idx ON public.agenda_local (company_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agenda_local TO authenticated;
GRANT ALL ON public.agenda_local TO service_role;

ALTER TABLE public.agenda_local ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agenda_local por empresa"
ON public.agenda_local
FOR ALL
TO authenticated
USING (public.has_company_access(company_id))
WITH CHECK (public.has_company_access(company_id));