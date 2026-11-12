-- ==============================================================================
-- CAPIVERSA CRM v1.3.07 — MIGRACIÓN: Publicación Multicanal Telegram y Backfill
-- Fecha: 12 de noviembre de 2026
-- ==============================================================================

-- 1. Ampliación de CHECK de plataforma en social_post_identity para admitir Telegram
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'social_post_identity_platform_check'
  ) THEN
    ALTER TABLE public.social_post_identity DROP CONSTRAINT social_post_identity_platform_check;
    ALTER TABLE public.social_post_identity ADD CONSTRAINT social_post_identity_platform_check 
      CHECK (platform IN ('instagram', 'facebook', 'tiktok', 'youtube', 'telegram'));
  END IF;

  -- 2. Ampliación de CHECK de plataforma en social_backfill_state para admitir Telegram
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'social_backfill_state_platform_check'
  ) THEN
    ALTER TABLE public.social_backfill_state DROP CONSTRAINT social_backfill_state_platform_check;
    ALTER TABLE public.social_backfill_state ADD CONSTRAINT social_backfill_state_platform_check 
      CHECK (platform IN ('instagram', 'facebook', 'tiktok', 'youtube', 'telegram'));
  END IF;
END $$;

-- 3. Índices de optimización para búsqueda rápida de ítems de publicación de Telegram
CREATE INDEX IF NOT EXISTS idx_telegram_post_items_target 
  ON public.telegram_post_items(target_id) WHERE target_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_telegram_post_items_channel 
  ON public.telegram_post_items(channel_id, published_at DESC);
