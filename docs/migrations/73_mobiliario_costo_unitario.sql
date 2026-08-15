-- ===========================================================================
-- INVENTARIO VALORIZADO (Felipe, 15-08)
--
-- Cada ítem de mobiliario puede llevar un costo unitario de reposición, y
-- el módulo Inventario muestra el valorizado: stock × costo por fila.
--
-- ⚠ NO LA CORRE EL SISTEMA. Aplicada y verificada en el laboratorio.
-- ===========================================================================

ALTER TABLE public.furniture_items
  ADD COLUMN IF NOT EXISTS unit_cost numeric;

COMMENT ON COLUMN public.furniture_items.unit_cost IS
  'Costo unitario de reposicion del item. Inventario valorizado = stock x costo.';
