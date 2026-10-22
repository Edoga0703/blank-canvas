-- 20261022190000_storage_buckets_and_cron_parity.sql
-- Garantiza la existencia de los 10 buckets de Supabase Storage requeridos por la aplicación
-- y sus políticas de acceso RLS.

INSERT INTO storage.buckets (id, name, public)
VALUES 
  ('avatars', 'avatars', true),
  ('public-media', 'public-media', true),
  ('feedback-attachments', 'feedback-attachments', true),
  ('support-attachments', 'support-attachments', true),
  ('plugin-assets', 'plugin-assets', true),
  ('public-assets', 'public-assets', true),
  ('campaign-media', 'campaign-media', true),
  ('chat-media', 'chat-media', true),
  ('agent-avatars', 'agent-avatars', true),
  ('agent-knowledge', 'agent-knowledge', false)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public;

-- Políticas de RLS para storage.objects
DO $$
BEGIN
  -- Lectura pública para buckets públicos
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Public Access for Public Buckets'
  ) THEN
    CREATE POLICY "Public Access for Public Buckets" ON storage.objects
      FOR SELECT USING (
        bucket_id IN (
          'avatars', 'public-media', 'feedback-attachments', 'support-attachments',
          'plugin-assets', 'public-assets', 'campaign-media', 'chat-media', 'agent-avatars'
        )
      );
  END IF;

  -- Subida para usuarios autenticados
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Authenticated Users Upload'
  ) THEN
    CREATE POLICY "Authenticated Users Upload" ON storage.objects
      FOR INSERT WITH CHECK (
        auth.role() = 'authenticated'
      );
  END IF;

  -- Actualización y borrado para usuarios autenticados
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Authenticated Users Modify'
  ) THEN
    CREATE POLICY "Authenticated Users Modify" ON storage.objects
      FOR ALL USING (
        auth.role() = 'authenticated'
      );
  END IF;
END $$;
