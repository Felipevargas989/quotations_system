-- Reversa de la migración 63.
ALTER TABLE public.quotations
  DROP COLUMN IF EXISTS harvest_status;
