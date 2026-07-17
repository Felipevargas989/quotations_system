-- Migración 6: soporte de descuento en pesos (además del porcentaje).
-- Agrega la columna discount_amount a quotations para poder guardar el
-- descuento como monto fijo en $ (exacto), sin forzarlo a % equivalente.
-- Convención: si discount_amount > 0 se usa el monto; si no, se usa
-- discount_percentage. Aditiva y no destructiva.

ALTER TABLE public.quotations
  ADD COLUMN IF NOT EXISTS discount_amount numeric NOT NULL DEFAULT 0;
