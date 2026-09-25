-- Ninguém que já usa os recursos Google pode perder acesso: instala os plugins automaticamente.
-- Drive: empresas de quem já conectou a conta do Drive.
INSERT INTO public.company_plugin (company_id, plugin_id)
SELECT DISTINCT cu.company_id, p.id
FROM public.app_user_connections ac
JOIN public.company_user cu ON cu.user_id = ac.user_id
JOIN public.plugin p ON p.slug = 'google_drive'
WHERE ac.connector_id = 'google_drive'
ON CONFLICT (company_id, plugin_id) DO NOTHING;

-- Agenda/Meet: empresa que já possui integração Google registrada.
INSERT INTO public.company_plugin (company_id, plugin_id)
SELECT DISTINCT gi.company_id, p.id
FROM public.google_integration gi
JOIN public.plugin p ON p.slug IN ('google-calendar', 'google-meet')
ON CONFLICT (company_id, plugin_id) DO NOTHING;