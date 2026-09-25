ALTER TABLE public.agent_config
  ADD COLUMN IF NOT EXISTS menu_setores_ativo boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS menu_setores_texto text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS menu_setores_opcoes jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS public.department_menu_session (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  agent_config_id uuid NOT NULL REFERENCES public.agent_config(id) ON DELETE CASCADE,
  numero text NOT NULL,
  status text NOT NULL DEFAULT 'aguardando' CHECK (status IN ('aguardando', 'encaminhado')),
  department_id uuid REFERENCES public.department(id) ON DELETE SET NULL,
  last_menu_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, numero)
);

GRANT SELECT ON public.department_menu_session TO authenticated;
GRANT ALL ON public.department_menu_session TO service_role;

ALTER TABLE public.department_menu_session ENABLE ROW LEVEL SECURITY;

CREATE POLICY "department_menu_session_select_members"
ON public.department_menu_session
FOR SELECT
TO authenticated
USING (public.has_company_access(company_id));

CREATE INDEX IF NOT EXISTS idx_department_menu_session_waiting
ON public.department_menu_session (company_id, status, last_menu_at);

CREATE TRIGGER department_menu_session_set_updated_at
BEFORE UPDATE ON public.department_menu_session
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();