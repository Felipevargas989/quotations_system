-- REVERSA migración 46: elimina el subtítulo y los datos de cobro.
ALTER TABLE public.companies
  DROP COLUMN IF EXISTS tagline,
  DROP COLUMN IF EXISTS bank_details;
