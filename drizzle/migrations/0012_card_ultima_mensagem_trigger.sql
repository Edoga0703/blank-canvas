ALTER TABLE public.crm_cards ADD COLUMN IF NOT EXISTS ultima_direcao text NOT NULL DEFAULT 'entrada';

CREATE OR REPLACE FUNCTION public.tg_card_ultima_mensagem()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  preview text;
BEGIN
  preview := NULLIF(btrim(COALESCE(NEW.texto, '')), '');
  IF preview IS NULL THEN
    preview := CASE
      WHEN NEW.midia_tipo ILIKE '%audio%' THEN '🎤 Áudio'
      WHEN NEW.midia_tipo ILIKE '%image%' OR NEW.midia_tipo ILIKE '%imagem%' THEN '🖼️ Imagem'
      WHEN NEW.midia_tipo ILIKE '%video%' THEN '🎬 Vídeo'
      WHEN NEW.midia_tipo ILIKE '%local%' THEN '📍 Localização'
      WHEN NEW.midia_tipo IS NOT NULL THEN '📎 Arquivo'
      ELSE NULL
    END;
  END IF;

  IF preview IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public.crm_cards
     SET ultima_mensagem = left(preview, 240),
         ultima_em = NEW.created_at,
         ultima_direcao = NEW.direcao
   WHERE company_id = NEW.company_id
     AND numero = NEW.numero;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_card_ultima_mensagem ON public.mensagens;
CREATE TRIGGER trg_card_ultima_mensagem
AFTER INSERT ON public.mensagens
FOR EACH ROW EXECUTE FUNCTION public.tg_card_ultima_mensagem();