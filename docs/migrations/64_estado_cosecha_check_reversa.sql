-- Reversa de la migración 64: suelta el candado, la columna sigue.
ALTER TABLE public.quotations
  DROP CONSTRAINT IF EXISTS quotations_harvest_status_check;
