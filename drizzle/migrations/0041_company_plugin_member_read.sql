CREATE POLICY company_plugin_member_read ON public.company_plugin
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.company_user m
  WHERE m.company_id = company_plugin.company_id
    AND m.user_id = auth.uid()
    AND m.ativo = true
));