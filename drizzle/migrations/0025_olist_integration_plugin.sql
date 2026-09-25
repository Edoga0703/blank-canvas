CREATE TABLE IF NOT EXISTS public.olist_integration (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  token text NOT NULL,
  conectado boolean NOT NULL DEFAULT true,
  ultima_sync timestamptz,
  ultimo_resultado text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.olist_integration TO authenticated;
GRANT ALL ON public.olist_integration TO service_role;

ALTER TABLE public.olist_integration ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "olist by company" ON public.olist_integration;
CREATE POLICY "olist by company" ON public.olist_integration
  FOR ALL TO authenticated
  USING (public.has_company_access(company_id))
  WITH CHECK (public.has_company_access(company_id));

DROP TRIGGER IF EXISTS tg_olist_updated_at ON public.olist_integration;
CREATE TRIGGER tg_olist_updated_at BEFORE UPDATE ON public.olist_integration
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.plugin (slug, nome, descricao, categoria, status, tipo_efeito, capacidade_slug, gratuito, visivel_para_clientes, icone)
VALUES ('olist', 'Olist ERP (Tiny)', 'Importe clientes e pedidos da sua conta Olist ERP (Tiny) direto para o funil do CRM usando o Token de acesso da API.', 'integracao', 'ativo', 'capacidade', 'olist', true, true, 'ShoppingBag')
ON CONFLICT (slug) DO UPDATE SET
  nome = EXCLUDED.nome,
  descricao = EXCLUDED.descricao,
  categoria = EXCLUDED.categoria,
  status = 'ativo',
  tipo_efeito = 'capacidade',
  capacidade_slug = 'olist',
  gratuito = true,
  visivel_para_clientes = true;