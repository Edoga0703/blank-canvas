-- Migración para soporte nativo de D-API (WhatsApp QR / Pairing Code y Meta Cloud API)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e 
    JOIN pg_type t ON e.enumtypid = t.oid 
    WHERE t.typname = 'whatsapp_provider_type' AND e.enumlabel = 'dapi'
  ) THEN
    ALTER TYPE public.whatsapp_provider_type ADD VALUE 'dapi';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e 
    JOIN pg_type t ON e.enumtypid = t.oid 
    WHERE t.typname = 'whatsapp_provider_type' AND e.enumlabel = 'dapi_official'
  ) THEN
    ALTER TYPE public.whatsapp_provider_type ADD VALUE 'dapi_official';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
