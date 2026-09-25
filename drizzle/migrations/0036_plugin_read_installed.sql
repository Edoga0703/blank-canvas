CREATE POLICY plugin_read_installed ON public.plugin
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.company_plugin cp
    WHERE cp.plugin_id = plugin.id
      AND cp.company_id = public.current_company_id()
      AND cp.instalado = true
  )
);