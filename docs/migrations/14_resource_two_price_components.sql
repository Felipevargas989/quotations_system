-- Módulo Logística: el precio de lista de un recurso pasa a tener DOS
-- componentes no excluyentes, espejo del modelo de cobro de los servicios
-- fijos (fijo / fijo + variable):
--   list_price_fixed:      componente fijo por evento (ej: transporte $100.000)
--   list_price_per_person: componente por persona (ej: silla $1.500 c/u)
-- Caso real: FL cobra las sillas a $1.500 por silla + $100.000 de transporte.
-- Ambos opcionales (el staff sigue sin precio: se asigna por evento).
-- Reemplaza a charge_mode + list_price (datos migrados automáticamente).

ALTER TABLE public.management_resources
  ADD COLUMN IF NOT EXISTS list_price_fixed numeric,
  ADD COLUMN IF NOT EXISTS list_price_per_person numeric;

UPDATE public.management_resources
  SET list_price_fixed = CASE WHEN charge_mode = 'por_evento'
        THEN list_price ELSE list_price_fixed END,
      list_price_per_person = CASE WHEN charge_mode = 'por_persona'
        THEN list_price ELSE list_price_per_person END
  WHERE list_price IS NOT NULL;

ALTER TABLE public.management_resources
  DROP COLUMN IF EXISTS charge_mode,
  DROP COLUMN IF EXISTS list_price;
