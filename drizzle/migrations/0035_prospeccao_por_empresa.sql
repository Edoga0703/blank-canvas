ALTER TABLE public.prospeccao_lead ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.company(id) ON DELETE CASCADE;

UPDATE public.prospeccao_lead SET company_id = '9b94d323-1a5b-4462-a2bb-ab6de322c8dc' WHERE company_id IS NULL;

CREATE INDEX IF NOT EXISTS prospeccao_lead_company_idx ON public.prospeccao_lead(company_id);

DROP POLICY IF EXISTS "super admin gerencia prospeccao" ON public.prospeccao_lead;
CREATE POLICY "prospeccao por empresa" ON public.prospeccao_lead
  FOR ALL TO authenticated
  USING (public.is_super_admin() OR company_id = public.current_company_id())
  WITH CHECK (public.is_super_admin() OR company_id = public.current_company_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.prospeccao_lead TO authenticated;
GRANT ALL ON public.prospeccao_lead TO service_role;

INSERT INTO public.plugin (slug, nome, descricao, categoria, status, visivel_para_clientes, gratuito, capacidade_slug, icone)
VALUES ('prospeccao', 'Radar de Prospecção', 'Encontre empresas no Google Maps e na base pública de CNPJ e envie os contatos direto para o CRM.', 'vendas', 'ativo', false, true, 'prospeccao', 'radar')
ON CONFLICT (slug) DO UPDATE SET status = 'ativo', gratuito = true, capacidade_slug = 'prospeccao';

INSERT INTO public.company_plugin (company_id, plugin_id)
SELECT c.id, p.id FROM public.company c, public.plugin p
WHERE p.slug = 'prospeccao'
  AND c.id IN ('9b94d323-1a5b-4462-a2bb-ab6de322c8dc','625268b2-d015-4e44-83b3-78999b65e19e','3c2f4f3c-9dea-479b-975e-5141a791853f')
ON CONFLICT (company_id, plugin_id) DO NOTHING;