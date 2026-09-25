-- Colunas aditivas em mensagem_agendada
ALTER TABLE public.mensagem_agendada
  ADD COLUMN IF NOT EXISTS tipo_id uuid,
  ADD COLUMN IF NOT EXISTS recorrencia_id uuid,
  ADD COLUMN IF NOT EXISTS fim_em timestamptz,
  ADD COLUMN IF NOT EXISTS empresa_nome text,
  ADD COLUMN IF NOT EXISTS observacoes_internas text,
  ADD COLUMN IF NOT EXISTS tags text[],
  ADD COLUMN IF NOT EXISTS cancelado_em timestamptz,
  ADD COLUMN IF NOT EXISTS concluido_em timestamptz,
  ADD COLUMN IF NOT EXISTS canal text,
  ADD COLUMN IF NOT EXISTS appointment_id uuid,
  ADD COLUMN IF NOT EXISTS motivo_falha text;

CREATE INDEX IF NOT EXISTS idx_msg_agendada_appointment ON public.mensagem_agendada(appointment_id);
CREATE INDEX IF NOT EXISTS idx_msg_agendada_recorrencia ON public.mensagem_agendada(recorrencia_id);

-- Tipos de agendamento
CREATE TABLE IF NOT EXISTS public.agenda_tipo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  nome text NOT NULL,
  cor text NOT NULL DEFAULT '#0B22FE',
  icone text,
  duracao_padrao_min integer NOT NULL DEFAULT 30,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agenda_tipo TO authenticated;
GRANT ALL ON public.agenda_tipo TO service_role;
ALTER TABLE public.agenda_tipo ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agenda_tipo company" ON public.agenda_tipo FOR ALL TO authenticated
  USING (public.has_company_access(company_id)) WITH CHECK (public.has_company_access(company_id));
CREATE INDEX IF NOT EXISTS idx_agenda_tipo_company ON public.agenda_tipo(company_id);

-- Recorrência
CREATE TABLE IF NOT EXISTS public.agenda_recorrencia (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  frequencia text NOT NULL DEFAULT 'semanal',
  intervalo integer NOT NULL DEFAULT 1,
  dias_semana integer[],
  ocorrencias integer,
  ate_data date,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agenda_recorrencia TO authenticated;
GRANT ALL ON public.agenda_recorrencia TO service_role;
ALTER TABLE public.agenda_recorrencia ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agenda_recorrencia company" ON public.agenda_recorrencia FOR ALL TO authenticated
  USING (public.has_company_access(company_id)) WITH CHECK (public.has_company_access(company_id));

-- Disponibilidade
CREATE TABLE IF NOT EXISTS public.agenda_disponibilidade (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  user_id uuid,
  weekday integer NOT NULL,
  start_time time NOT NULL DEFAULT '08:00',
  end_time time NOT NULL DEFAULT '18:00',
  interval_start time,
  interval_end time,
  timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
  duracao_padrao_min integer NOT NULL DEFAULT 30,
  folga_min integer NOT NULL DEFAULT 0,
  antecedencia_min_min integer NOT NULL DEFAULT 0,
  antecedencia_max_dias integer NOT NULL DEFAULT 60,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agenda_disponibilidade TO authenticated;
GRANT ALL ON public.agenda_disponibilidade TO service_role;
ALTER TABLE public.agenda_disponibilidade ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agenda_disp company" ON public.agenda_disponibilidade FOR ALL TO authenticated
  USING (public.has_company_access(company_id)) WITH CHECK (public.has_company_access(company_id));
CREATE INDEX IF NOT EXISTS idx_agenda_disp_company_user ON public.agenda_disponibilidade(company_id, user_id);

-- Bloqueios
CREATE TABLE IF NOT EXISTS public.agenda_bloqueio (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  user_id uuid,
  inicio timestamptz NOT NULL,
  fim timestamptz NOT NULL,
  motivo text,
  tipo text NOT NULL DEFAULT 'bloqueio',
  recorrencia_id uuid REFERENCES public.agenda_recorrencia(id) ON DELETE SET NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agenda_bloqueio TO authenticated;
GRANT ALL ON public.agenda_bloqueio TO service_role;
ALTER TABLE public.agenda_bloqueio ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agenda_bloqueio company" ON public.agenda_bloqueio FOR ALL TO authenticated
  USING (public.has_company_access(company_id)) WITH CHECK (public.has_company_access(company_id));
CREATE INDEX IF NOT EXISTS idx_agenda_bloqueio_periodo ON public.agenda_bloqueio(company_id, inicio, fim);

-- Participantes
CREATE TABLE IF NOT EXISTS public.agenda_participante (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  appointment_id uuid NOT NULL REFERENCES public.mensagem_agendada(id) ON DELETE CASCADE,
  user_id uuid,
  card_id uuid,
  nome text,
  tipo text NOT NULL DEFAULT 'interno',
  confirmacao text NOT NULL DEFAULT 'pendente',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agenda_participante TO authenticated;
GRANT ALL ON public.agenda_participante TO service_role;
ALTER TABLE public.agenda_participante ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agenda_part company" ON public.agenda_participante FOR ALL TO authenticated
  USING (public.has_company_access(company_id)) WITH CHECK (public.has_company_access(company_id));
CREATE INDEX IF NOT EXISTS idx_agenda_part_appt ON public.agenda_participante(appointment_id);

-- Histórico
CREATE TABLE IF NOT EXISTS public.agenda_historico (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  acao text NOT NULL,
  dados_anteriores jsonb,
  dados_novos jsonb,
  user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.agenda_historico TO authenticated;
GRANT ALL ON public.agenda_historico TO service_role;
ALTER TABLE public.agenda_historico ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agenda_hist select" ON public.agenda_historico FOR SELECT TO authenticated
  USING (public.has_company_access(company_id));
CREATE POLICY "agenda_hist insert" ON public.agenda_historico FOR INSERT TO authenticated
  WITH CHECK (public.has_company_access(company_id));
CREATE INDEX IF NOT EXISTS idx_agenda_hist_entity ON public.agenda_historico(company_id, entity_type, entity_id);