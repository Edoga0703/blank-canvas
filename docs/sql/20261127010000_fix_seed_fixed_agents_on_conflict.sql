-- Migration #12: Fix 42P10 in public.seed_fixed_agents and normalize plan order (starter -> pro -> business)
BEGIN;

CREATE OR REPLACE FUNCTION public.seed_fixed_agents(_company_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _uid uuid;
BEGIN
  SELECT user_id INTO _uid FROM public.company_user
    WHERE company_id = _company_id AND ativo = true
    ORDER BY created_at ASC LIMIT 1;

  IF _uid IS NULL THEN
    SELECT created_by INTO _uid FROM public.company WHERE id = _company_id;
  END IF;

  IF _uid IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.agent_config (company_id, user_id, tipo, nome, nome_agente, sistema, is_default, papel_objetivo)
  VALUES
    (_company_id, _uid, 'qualificacao', 'Qualificação', 'Ana',
     true, true, 'Qualificar novos leads, coletar informações e agendar próximos passos com foco em fechar venda.'),
    (_company_id, _uid, 'followup', 'Follow-up', 'Léo',
     true, false, 'Reengajar leads que não responderam, com abordagens curtas e progressivamente diretas.'),
    (_company_id, _uid, 'posvenda', 'Pós-venda', 'Sofia',
     true, false, 'Acompanhar cliente após a venda: onboarding, satisfação, pedir avaliação e detectar oportunidade de recompra.')
  ON CONFLICT DO NOTHING;
END $function$;

UPDATE public.plan SET ordem = 1, updated_at = now() WHERE slug = 'starter';
UPDATE public.plan SET ordem = 2, updated_at = now() WHERE slug = 'pro';
UPDATE public.plan SET ordem = 3, updated_at = now() WHERE slug = 'business';

COMMIT;

NOTIFY pgrst, 'reload schema';
