ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS assinatura_ativa boolean NOT NULL DEFAULT true;

ALTER TABLE public.crm_cards ADD COLUMN IF NOT EXISTS transfer_para_user_id uuid;
ALTER TABLE public.crm_cards ADD COLUMN IF NOT EXISTS transfer_de_user_id uuid;
ALTER TABLE public.crm_cards ADD COLUMN IF NOT EXISTS transfer_status text;
ALTER TABLE public.crm_cards ADD COLUMN IF NOT EXISTS transfer_em timestamptz;

ALTER TABLE public.mensagens ADD COLUMN IF NOT EXISTS grupo_jid text;
ALTER TABLE public.mensagens ADD COLUMN IF NOT EXISTS remetente_nome text;
CREATE INDEX IF NOT EXISTS mensagens_grupo_idx ON public.mensagens (company_id, grupo_jid, created_at DESC);

ALTER TABLE public.company ADD COLUMN IF NOT EXISTS grupos_ativos boolean NOT NULL DEFAULT false;
ALTER TABLE public.company ADD COLUMN IF NOT EXISTS dashboard_individual boolean NOT NULL DEFAULT false;
ALTER TABLE public.company ADD COLUMN IF NOT EXISTS funcoes_individuais boolean NOT NULL DEFAULT false;

ALTER TABLE public.agendamento ADD COLUMN IF NOT EXISTS created_by uuid;

CREATE TABLE IF NOT EXISTS public.whatsapp_grupo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  instance_id uuid,
  jid text NOT NULL,
  nome text,
  foto_url text,
  participantes integer,
  ultima_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, jid)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_grupo TO authenticated;
GRANT ALL ON public.whatsapp_grupo TO service_role;

ALTER TABLE public.whatsapp_grupo ENABLE ROW LEVEL SECURITY;

CREATE POLICY "grupo_company_access" ON public.whatsapp_grupo
  FOR ALL TO authenticated
  USING (public.has_company_access(company_id))
  WITH CHECK (public.has_company_access(company_id));