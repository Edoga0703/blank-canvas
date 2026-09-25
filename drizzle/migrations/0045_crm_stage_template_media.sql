ALTER TABLE public.crm_stage
  ADD COLUMN IF NOT EXISTS mensagem_midia_url text,
  ADD COLUMN IF NOT EXISTS mensagem_midia_tipo text,
  ADD COLUMN IF NOT EXISTS mensagem_midia_mime text,
  ADD COLUMN IF NOT EXISTS mensagem_midia_nome text;

ALTER TABLE public.crm_stage
  ADD CONSTRAINT crm_stage_mensagem_midia_tipo_check
  CHECK (mensagem_midia_tipo IS NULL OR mensagem_midia_tipo IN ('image', 'video', 'audio', 'document')) NOT VALID;

ALTER TABLE public.crm_stage
  VALIDATE CONSTRAINT crm_stage_mensagem_midia_tipo_check;

COMMENT ON COLUMN public.crm_stage.mensagem_midia_url IS 'URL assinada do anexo opcional enviado pelo template fixo da automação.';
COMMENT ON COLUMN public.crm_stage.mensagem_midia_tipo IS 'Tipo do anexo do template: image, video, audio ou document.';
COMMENT ON COLUMN public.crm_stage.mensagem_midia_mime IS 'MIME type original do anexo do template.';
COMMENT ON COLUMN public.crm_stage.mensagem_midia_nome IS 'Nome original do arquivo anexado ao template.';