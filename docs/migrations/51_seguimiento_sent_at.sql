-- Migración 51 — SEGUIMIENTO COMERCIAL (30-07-2026, diseño de Felipe).
-- Para preguntar "¿pudiste revisarla?" a los 7 y 14 días hay que saber
-- CUÁNDO se envió cada cotización. Columna nueva sent_at: la llena el
-- backend al marcar "enviada"; las enviadas actuales se rellenan con
-- su última modificación (aproximación honesta — es la fecha en que
-- alguien la tocó por última vez, normalmente el envío mismo).

ALTER TABLE public.quotations
  ADD COLUMN IF NOT EXISTS sent_at timestamptz;

UPDATE public.quotations
SET sent_at = updated_at
WHERE sent_at IS NULL
  AND quotation_status = 'enviada';
