-- Preflight para bases v1.3.00 que aun conservan la FK de instance_id.
-- Se ejecuta antes de 120000; idempotente y transaccional.
BEGIN;
DO $do$
DECLARE fk record;
BEGIN
  FOR fk IN
    SELECT c.conname FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attname='instance_id'
    WHERE c.conrelid='public.automation_conversation_control'::regclass
      AND c.confrelid='public.whatsapp_instances'::regclass
      AND c.contype='f' AND a.attnum=ANY(c.conkey)
  LOOP
    EXECUTE format('ALTER TABLE public.automation_conversation_control DROP CONSTRAINT %I',fk.conname);
  END LOOP;
END $do$;
ALTER TABLE public.automation_events
  ADD COLUMN IF NOT EXISTS lease_owner text,
  ADD COLUMN IF NOT EXISTS lease_until timestamptz,
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error text;
COMMIT;
