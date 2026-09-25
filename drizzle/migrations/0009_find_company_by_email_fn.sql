CREATE OR REPLACE FUNCTION public.find_company_by_email(_email text)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT cu.company_id
  FROM auth.users u
  JOIN public.company_user cu ON cu.user_id = u.id AND cu.ativo = true
  WHERE lower(u.email) = lower(_email)
  ORDER BY cu.created_at ASC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.find_company_by_email(text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.find_company_by_email(text) TO service_role;

-- backfill profiles faltantes (cadastros onde o trigger não gravou)
INSERT INTO public.profiles (user_id, email)
SELECT u.id, u.email FROM auth.users u
WHERE u.email IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = u.id)
ON CONFLICT (user_id) DO NOTHING;