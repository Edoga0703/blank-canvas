ALTER TABLE public.company
  ADD COLUMN IF NOT EXISTS csat_formato TEXT NOT NULL DEFAULT 'link',
  ADD COLUMN IF NOT EXISTS csat_pedir_comentario BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS csat_texto_comentario TEXT,
  ADD COLUMN IF NOT EXISTS csat_texto_agradecimento TEXT,
  ADD COLUMN IF NOT EXISTS csat_enviar_ao_finalizar BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.csat_response
  ADD COLUMN IF NOT EXISTS canal TEXT NOT NULL DEFAULT 'link',
  ADD COLUMN IF NOT EXISTS estado TEXT,
  ADD COLUMN IF NOT EXISTS expira_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS tentativas SMALLINT NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS csat_response_pendente_idx
  ON public.csat_response (company_id, numero, estado);