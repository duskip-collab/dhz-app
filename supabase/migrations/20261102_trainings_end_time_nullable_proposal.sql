-- Idempotent proposal: allow nullable end_time for trainings
ALTER TABLE public.trainings ALTER COLUMN end_time DROP NOT NULL;

DO $$
DECLARE
  def text;
BEGIN
  SELECT pg_get_constraintdef(c.oid)
    INTO def
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE c.conname = 'chk_training_time'
    AND t.relname = 'trainings'
    AND n.nspname = 'public';

  IF def IS NULL THEN
    ALTER TABLE public.trainings
      ADD CONSTRAINT chk_training_time CHECK (end_time IS NULL OR end_time > start_time);
  ELSIF def <> 'CHECK (end_time IS NULL OR end_time > start_time)' THEN
    ALTER TABLE public.trainings DROP CONSTRAINT chk_training_time;
    ALTER TABLE public.trainings
      ADD CONSTRAINT chk_training_time CHECK (end_time IS NULL OR end_time > start_time);
  END IF;
END
$$;