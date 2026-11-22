-- 20261121100000_automation_quick_rules_and_ui_mode.sql
-- Adiciona suporte a ui_mode para distinguir Reglas Rápidas (quick_rule) de Canvas Avançado (canvas)

ALTER TABLE public.automation_workflows 
  ADD COLUMN IF NOT EXISTS ui_mode text DEFAULT 'canvas'
  CHECK (ui_mode IN ('quick_rule', 'canvas'));

COMMENT ON COLUMN public.automation_workflows.ui_mode IS 
  'Modo de interface: quick_rule (asistente guiado sin código) o canvas (editor visual avanzado React Flow). Se editado no canvas, bloqueia sobreescrita acidental pelo assistente simples.';
