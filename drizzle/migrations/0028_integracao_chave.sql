CREATE TABLE public.integracao_chave (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  servico text NOT NULL,
  credencial text NOT NULL DEFAULT '',
  extra jsonb NOT NULL DEFAULT '{}'::jsonb,
  conectado boolean NOT NULL DEFAULT false,
  auto_envio boolean NOT NULL DEFAULT true,
  ultima_sync timestamptz,
  ultimo_resultado text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, servico)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.integracao_chave TO authenticated;
GRANT ALL ON public.integracao_chave TO service_role;

ALTER TABLE public.integracao_chave ENABLE ROW LEVEL SECURITY;

CREATE POLICY "integracao_chave por empresa" ON public.integracao_chave
  FOR ALL TO authenticated
  USING (public.has_company_access(company_id))
  WITH CHECK (public.has_company_access(company_id));

CREATE TRIGGER integracao_chave_updated_at
  BEFORE UPDATE ON public.integracao_chave
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_integracao_chave_company ON public.integracao_chave (company_id, servico);
