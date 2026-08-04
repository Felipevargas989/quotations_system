-- Reversa de 60: elimina el umbral de alto valor.
ALTER TABLE public.companies DROP COLUMN IF EXISTS high_value_threshold;
