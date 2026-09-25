DROP POLICY IF EXISTS crm_stage_access ON public.crm_stage;

CREATE POLICY crm_stage_select ON public.crm_stage
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR public.has_company_access(company_id));

CREATE POLICY crm_stage_insert ON public.crm_stage
  FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin() OR public.has_company_role(company_id, ARRAY['owner','admin']));

CREATE POLICY crm_stage_update ON public.crm_stage
  FOR UPDATE TO authenticated
  USING (public.is_super_admin() OR public.has_company_role(company_id, ARRAY['owner','admin']))
  WITH CHECK (public.is_super_admin() OR public.has_company_role(company_id, ARRAY['owner','admin']));

CREATE POLICY crm_stage_delete ON public.crm_stage
  FOR DELETE TO authenticated
  USING (public.is_super_admin() OR public.has_company_role(company_id, ARRAY['owner','admin']));