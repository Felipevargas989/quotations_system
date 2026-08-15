-- ===========================================================================
-- EL DÍA EN LOS RECURSOS DEL EVENTO
--
-- Acordado con Felipe: "se necesitan diez personas, pero NO diez personas
-- el mismo día". La cantidad de una línea SIEMPRE fue el total del evento;
-- lo que faltaba era poder repartirla.
--
-- Una línea por recurso Y DÍA, con la cantidad de ese día. El total del
-- evento es la suma, así que EL COSTO NO CAMBIA al repartir:
--   antes:  Garzón · 9 · $25.000                     = $225.000
--   ahora:  Garzón · jue 3 · vie 2 · sáb 4 · $25.000  = $225.000
--
-- NULL = "todavía sin repartir". Así quedan las 13 líneas que ya existen.
-- Nada se rompe: el cálculo del costo ya suma cantidad × precio por línea.
-- ===========================================================================

ALTER TABLE public.event_resources
  ADD COLUMN IF NOT EXISTS day date;

COMMENT ON COLUMN public.event_resources.day IS
  'Dia del evento al que corresponde esta cantidad. NULL = sin repartir todavia. El total del evento es la suma de los dias; el costo no cambia al repartir.';

CREATE INDEX IF NOT EXISTS event_resources_quotation_day_idx
  ON public.event_resources (quotation_id, day);
