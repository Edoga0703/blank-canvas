CREATE OR REPLACE FUNCTION public.provision_company_atomic(
  _user_id uuid,
  _nome text,
  _slug text,
  _trial_ate timestamptz,
  _plan_slug text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _company_id uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(_user_id::text, 0));

  SELECT cu.company_id
    INTO _company_id
  FROM public.company_user cu
  WHERE cu.user_id = _user_id
    AND cu.ativo = true
  ORDER BY cu.created_at ASC
  LIMIT 1;

  IF _company_id IS NOT NULL THEN
    RETURN _company_id;
  END IF;

  INSERT INTO public.company (
    nome,
    slug,
    primary_color,
    created_by,
    status_cobranca,
    onboarding_completed,
    onboarding_step,
    trial_ate,
    selected_plan_slug
  ) VALUES (
    _nome,
    _slug,
    '#0B22FE',
    _user_id,
    'trial',
    false,
    0,
    _trial_ate,
    _plan_slug
  )
  RETURNING id INTO _company_id;

  RETURN _company_id;
END;
$$;

REVOKE ALL ON FUNCTION public.provision_company_atomic(uuid, text, text, timestamptz, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.provision_company_atomic(uuid, text, text, timestamptz, text) TO service_role;