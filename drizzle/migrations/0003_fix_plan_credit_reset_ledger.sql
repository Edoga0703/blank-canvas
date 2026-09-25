CREATE OR REPLACE FUNCTION public.topup_plan_credits(_company_id uuid, _plan_slug text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _qtd integer;
  _anterior integer;
  _novo integer;
BEGIN
  SELECT creditos_mensais
    INTO _qtd
    FROM public.plan
   WHERE slug = _plan_slug
     AND ativo = true;

  IF _qtd IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT creditos_saldo
    INTO _anterior
    FROM public.company
   WHERE id = _company_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  UPDATE public.company
     SET creditos_saldo = _qtd,
         creditos_origem = 'plano',
         creditos_resetam_em = now() + interval '30 days'
   WHERE id = _company_id
   RETURNING creditos_saldo INTO _novo;

  INSERT INTO public.credit_ledger(company_id, delta, saldo_apos, motivo, ref)
  VALUES (_company_id, _novo - COALESCE(_anterior, 0), _novo, 'plan_topup', _plan_slug);

  RETURN _novo;
END
$function$;

REVOKE ALL ON FUNCTION public.topup_plan_credits(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.topup_plan_credits(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.topup_plan_credits(uuid, text) TO service_role;