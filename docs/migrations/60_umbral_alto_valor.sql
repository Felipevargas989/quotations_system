-- Migración 60 — umbral de cotización de ALTO VALOR por empresa
-- (04-08-2026, decisión de Felipe: un monto configurable es simple y
-- predecible; el promedio automático era magia inestable). NULL o 0 =
-- sin marca. Las tarjetas del tablero con monto >= umbral llevan 💎.
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS high_value_threshold bigint;
