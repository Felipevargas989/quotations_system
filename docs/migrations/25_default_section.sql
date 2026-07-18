-- Sección FIJA de una categoría (a lo más una por categoría).
-- Los servicios de la sección fija se agregan SOLOS a la cotización cuando se
-- selecciona la categoría, y no se pueden quitar mientras la categoría siga en
-- el evento (ej: "pan y pebre" en Almuerzos & Cenas).

ALTER TABLE public.category_sections
  ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false;

-- Una sola sección fija por categoría.
CREATE UNIQUE INDEX IF NOT EXISTS category_sections_one_default
  ON public.category_sections (category_id)
  WHERE is_default;
