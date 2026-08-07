-- Reversa de la migración 62. Borra la marca de recontacto.
ALTER TABLE public.quotations
  DROP COLUMN IF EXISTS recontacted_at,
  DROP COLUMN IF EXISTS recontacted_by;
