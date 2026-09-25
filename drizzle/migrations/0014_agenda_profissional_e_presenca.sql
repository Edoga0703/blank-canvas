-- Agenda por profissional + controle de presença nos compromissos
ALTER TABLE public.mensagem_agendada
  ADD COLUMN IF NOT EXISTS profissional_id uuid,
  ADD COLUMN IF NOT EXISTS presenca text;

CREATE INDEX IF NOT EXISTS idx_mensagem_agendada_prof
  ON public.mensagem_agendada (company_id, profissional_id, agendado_para);

-- Horários individuais de atendimento por membro da equipe (nulo = herda o da empresa)
ALTER TABLE public.company_user
  ADD COLUMN IF NOT EXISTS horarios jsonb;