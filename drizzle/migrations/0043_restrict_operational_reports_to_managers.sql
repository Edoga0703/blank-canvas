CREATE OR REPLACE FUNCTION public.can_manage_operational_reports(_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_company_role(_company_id, ARRAY['owner','admin'])
     AND EXISTS (
       SELECT 1 FROM public.company c
       WHERE c.id = _company_id
         AND c.atendimento_operacional = true
     )
$$;

CREATE POLICY atendimento_relatorio_select_manager
ON public.atendimento_relatorio
AS RESTRICTIVE
FOR SELECT
TO authenticated
USING (public.can_manage_operational_reports(company_id));