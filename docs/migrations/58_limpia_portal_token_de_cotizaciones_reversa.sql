-- Reversa de 58: recrea la columna (VACÍA — los tokens viejos de la 47
-- no se restauran; el portal vigente no los usa: vive en la persona).
ALTER TABLE public.quotations ADD COLUMN IF NOT EXISTS portal_token text UNIQUE;
