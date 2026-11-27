-- Capiversa CRM — Fase 3: Permisos Granulares por Sub-usuario (permissions_override)
BEGIN;

ALTER TABLE public.company_user
  ADD COLUMN IF NOT EXISTS permissions_override jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.company_user.permissions_override IS
  'Sobrescritas booleanas de permissões granulares por módulo/ação aplicadas sobre o papel base ou company_role do usuário.';

COMMIT;

NOTIFY pgrst, 'reload schema';
