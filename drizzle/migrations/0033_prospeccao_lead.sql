CREATE TABLE public.prospeccao_lead (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fonte text NOT NULL DEFAULT 'google',
  busca text,
  nome text NOT NULL,
  telefone text,
  email text,
  site text,
  endereco text,
  cidade text,
  uf text,
  categoria text,
  cnpj text,
  rating numeric,
  avaliacoes integer,
  place_id text,
  dados jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'novo',
  card_id uuid,
  criado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX prospeccao_lead_place_uk ON public.prospeccao_lead (place_id) WHERE place_id IS NOT NULL;
CREATE INDEX prospeccao_lead_created_idx ON public.prospeccao_lead (created_at DESC);
CREATE INDEX prospeccao_lead_tel_idx ON public.prospeccao_lead (telefone);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.prospeccao_lead TO authenticated;
GRANT ALL ON public.prospeccao_lead TO service_role;

ALTER TABLE public.prospeccao_lead ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super admin gerencia prospeccao"
ON public.prospeccao_lead
FOR ALL
TO authenticated
USING (public.is_super_admin())
WITH CHECK (public.is_super_admin());