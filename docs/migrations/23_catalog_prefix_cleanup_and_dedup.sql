-- Limpieza del catálogo heredado del sistema antiguo (decisiones de Felipe,
-- 18-07-2026). En el sistema viejo los prefijos numéricos ("01 - ", "02 - ")
-- servían para ordenar, y un producto en varias categorías se duplicaba.
-- El sistema nuevo ordena con drag & drop y usa multicategoría, así que:
--   1. Se eliminan los prefijos numéricos de los nombres.
--   2. Los duplicados exactos (nombre normalizado) se fusionan: sobrevive el
--      id menor y hereda las categorías de los eliminados.
--   3. Caso decidido a mano: "Jugo natural" ($1.300 vs $2.000) → $2.000.
-- Ya aplicado en dev. CORRER EN PROD SOLO DESPUÉS de la migración 5
-- (multicategoría), en el deploy.

-- 1. Prefijos numéricos fuera
UPDATE public.variable_services
  SET name = trim(regexp_replace(name, '^\s*\d+\s*-\s*', ''))
  WHERE name ~ '^\s*\d+\s*-\s*';

-- 2. Decisión de precio antes de fusionar
UPDATE public.variable_services
  SET price = 2000
  WHERE lower(trim(name)) = 'jugo natural';

-- 3. Fusión de duplicados exactos (hereda categorías, borra el resto)
WITH d AS (
  SELECT id, first_value(id) OVER (PARTITION BY lower(trim(name)) ORDER BY id) keep
  FROM public.variable_services
), m AS (SELECT id dup, keep FROM d WHERE id <> keep)
INSERT INTO public.variable_service_categories
  (company_id, variable_service_id, category_id, sort_order)
SELECT l.company_id, m.keep, l.category_id, l.sort_order
FROM public.variable_service_categories l JOIN m ON m.dup = l.variable_service_id
WHERE NOT EXISTS (SELECT 1 FROM public.variable_service_categories x
                  WHERE x.variable_service_id = m.keep
                    AND x.category_id = l.category_id);

WITH d AS (
  SELECT id, first_value(id) OVER (PARTITION BY lower(trim(name)) ORDER BY id) keep
  FROM public.variable_services
), m AS (SELECT id dup, keep FROM d WHERE id <> keep)
DELETE FROM public.variable_service_categories
  WHERE variable_service_id IN (SELECT dup FROM m);

WITH d AS (
  SELECT id, first_value(id) OVER (PARTITION BY lower(trim(name)) ORDER BY id) keep
  FROM public.variable_services
), m AS (SELECT id dup, keep FROM d WHERE id <> keep)
DELETE FROM public.variable_services
  WHERE id IN (SELECT dup FROM m);
