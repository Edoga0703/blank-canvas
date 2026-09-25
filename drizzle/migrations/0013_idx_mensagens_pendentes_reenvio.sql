CREATE INDEX IF NOT EXISTS idx_mensagens_pendentes_reenvio
  ON public.mensagens (created_at)
  WHERE direcao = 'saida' AND status_envio = 'pendente' AND whatsapp_message_id IS NOT NULL;