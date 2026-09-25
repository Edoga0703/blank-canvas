CREATE TABLE IF NOT EXISTS public.atendimento_live_analise (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  numero text NOT NULL,
  contato_nome text,
  solicitacao text NOT NULL DEFAULT '',
  andamento text NOT NULL DEFAULT '',
  situacao text NOT NULL DEFAULT 'em_andamento',
  ultima_em_analisada timestamptz,
  analisado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, numero)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.atendimento_live_analise TO authenticated;
GRANT ALL ON public.atendimento_live_analise TO service_role;

ALTER TABLE public.atendimento_live_analise ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS live_analise_company_member ON public.atendimento_live_analise;
CREATE POLICY live_analise_company_member ON public.atendimento_live_analise
  FOR ALL TO authenticated
  USING (public.has_company_access(company_id))
  WITH CHECK (public.has_company_access(company_id));

CREATE INDEX IF NOT EXISTS idx_live_analise_company ON public.atendimento_live_analise (company_id, analisado_em DESC);