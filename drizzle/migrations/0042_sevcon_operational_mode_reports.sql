ALTER TABLE public.company ADD COLUMN IF NOT EXISTS atendimento_operacional boolean NOT NULL DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS csat_auto_finalizar boolean;

UPDATE public.company
SET atendimento_operacional = true
WHERE id = '0b2e15e9-3be9-4923-a6ff-67b1ce4c53e1';

UPDATE public.profiles p
SET csat_auto_finalizar = CASE
  WHEN lower(coalesce(p.nome, '')) = 'katharina alencar' THEN false
  ELSE true
END
WHERE EXISTS (
  SELECT 1 FROM public.company_user cu
  WHERE cu.user_id = p.user_id
    AND cu.company_id = '0b2e15e9-3be9-4923-a6ff-67b1ce4c53e1'
);

UPDATE public.crm_cards
SET campos_extras = jsonb_set(
  coalesce(campos_extras, '{}'::jsonb),
  '{personalizados}',
  coalesce(campos_extras->'personalizados', '[]'::jsonb) || jsonb_build_array(
    jsonb_build_object('label', 'Senha Meu Gov', 'valor', '', 'origem', 'sevcon_padrao')
  ),
  true
)
WHERE company_id = '0b2e15e9-3be9-4923-a6ff-67b1ce4c53e1'
  AND NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(coalesce(campos_extras->'personalizados', '[]'::jsonb)) item
    WHERE lower(item->>'label') = lower('Senha Meu Gov')
  );

CREATE OR REPLACE FUNCTION public.sevcon_ensure_default_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.company_id = '0b2e15e9-3be9-4923-a6ff-67b1ce4c53e1'
     AND NOT EXISTS (
       SELECT 1
       FROM jsonb_array_elements(coalesce(NEW.campos_extras->'personalizados', '[]'::jsonb)) item
       WHERE lower(item->>'label') = lower('Senha Meu Gov')
     ) THEN
    NEW.campos_extras := jsonb_set(
      coalesce(NEW.campos_extras, '{}'::jsonb),
      '{personalizados}',
      coalesce(NEW.campos_extras->'personalizados', '[]'::jsonb) || jsonb_build_array(
        jsonb_build_object('label', 'Senha Meu Gov', 'valor', '', 'origem', 'sevcon_padrao')
      ),
      true
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER crm_cards_sevcon_default_fields
BEFORE INSERT OR UPDATE OF campos_extras ON public.crm_cards
FOR EACH ROW EXECUTE FUNCTION public.sevcon_ensure_default_fields();

CREATE TABLE public.atendimento_relatorio (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  card_id uuid REFERENCES public.crm_cards(id) ON DELETE SET NULL,
  numero text NOT NULL,
  contato_nome text,
  solicitacao text NOT NULL DEFAULT '',
  resolucao text NOT NULL DEFAULT '',
  situacao text NOT NULL DEFAULT 'pendente' CHECK (situacao IN ('resolvido', 'pendente')),
  resolvido_por uuid,
  pendente_com uuid,
  setor_id uuid REFERENCES public.department(id) ON DELETE SET NULL,
  atendente_id uuid,
  criado_por uuid NOT NULL,
  revisado_por uuid,
  iniciado_em timestamptz,
  finalizado_em timestamptz NOT NULL DEFAULT now(),
  revisado_em timestamptz,
  ai_sugerido boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.atendimento_relatorio TO authenticated;
GRANT ALL ON public.atendimento_relatorio TO service_role;

ALTER TABLE public.atendimento_relatorio ENABLE ROW LEVEL SECURITY;

CREATE POLICY atendimento_relatorio_select_company
ON public.atendimento_relatorio FOR SELECT TO authenticated
USING (public.has_company_access(company_id));

CREATE POLICY atendimento_relatorio_insert_company
ON public.atendimento_relatorio FOR INSERT TO authenticated
WITH CHECK (public.has_company_access(company_id) AND criado_por = auth.uid());

CREATE POLICY atendimento_relatorio_update_manager
ON public.atendimento_relatorio FOR UPDATE TO authenticated
USING (public.has_company_role(company_id, ARRAY['owner','admin']))
WITH CHECK (public.has_company_role(company_id, ARRAY['owner','admin']));

CREATE INDEX atendimento_relatorio_company_finalizado_idx
ON public.atendimento_relatorio(company_id, finalizado_em DESC);

CREATE INDEX atendimento_relatorio_atendente_idx
ON public.atendimento_relatorio(company_id, atendente_id, finalizado_em DESC);