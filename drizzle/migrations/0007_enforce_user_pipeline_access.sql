CREATE OR REPLACE FUNCTION public.enforce_user_pipeline_access()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  restricoes int;
BEGIN
  IF auth.uid() IS NULL OR NEW.pipeline_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO restricoes
  FROM public.company_user_pipeline
  WHERE company_id = NEW.company_id AND user_id = auth.uid();

  IF restricoes = 0 THEN
    RETURN NEW;
  END IF;

  IF public.has_company_role(NEW.company_id, ARRAY['owner','admin']) OR public.is_super_admin() THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.company_user_pipeline
    WHERE company_id = NEW.company_id AND user_id = auth.uid() AND pipeline_id = NEW.pipeline_id
  ) THEN
    RAISE EXCEPTION 'Sem acesso a este funil.';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER crm_cards_enforce_pipeline_access
BEFORE INSERT OR UPDATE OF pipeline_id, stage_id ON public.crm_cards
FOR EACH ROW EXECUTE FUNCTION public.enforce_user_pipeline_access();