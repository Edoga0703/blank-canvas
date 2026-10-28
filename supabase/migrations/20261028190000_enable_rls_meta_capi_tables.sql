ALTER TABLE public.meta_capi_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_capi_event_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_click_session ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "meta_capi_event_log_select_company" ON public.meta_capi_event_log;
CREATE POLICY "meta_capi_event_log_select_company"
  ON public.meta_capi_event_log
  FOR SELECT
  TO authenticated
  USING (
    company_id IN (
      SELECT cu.company_id FROM public.company_user cu
      WHERE cu.user_id = auth.uid() AND cu.ativo = true
    )
  );
