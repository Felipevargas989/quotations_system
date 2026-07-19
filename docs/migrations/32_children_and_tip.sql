-- Cotizador 2.0 · primera pieza: niños/adultos + propina (mockup v1).
--
-- 1) children_count: cuántos de los asistentes son niños (0 = evento solo
--    adultos, todo como antes). people_count SIGUE siendo el TOTAL de
--    asistentes (adultos = people_count - children_count) para no romper
--    listas, PDF ni lógica existente.
-- 2) tip_percentage: propina opcional sobre los servicios variables,
--    DESPUÉS del IVA (no lleva IVA, va directa al equipo). NULL = sin
--    propina. El monto se recalcula, no se guarda.
--
-- La audiencia (adultos/niños) y las personas de CADA servicio viven en
-- el snapshot JSON de items (variable_services[].audience / .people),
-- como el día — sin columnas nuevas.

ALTER TABLE public.quotations
  ADD COLUMN IF NOT EXISTS children_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tip_percentage numeric;
