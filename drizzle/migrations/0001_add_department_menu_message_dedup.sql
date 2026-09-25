ALTER TABLE public.department_menu_session
  ADD COLUMN IF NOT EXISTS last_inbound_message_id text;

CREATE UNIQUE INDEX IF NOT EXISTS department_menu_session_message_unique
ON public.department_menu_session (company_id, last_inbound_message_id)
WHERE last_inbound_message_id IS NOT NULL;