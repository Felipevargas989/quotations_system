-- Estado "realizada" + encuesta al declarar el evento realizado.
-- El estado vive en quotations.quotation_status (texto libre, sin cambio de
-- esquema). Esta columna registra cuándo se envió la encuesta de
-- satisfacción al cliente, para que NUNCA se envíe dos veces aunque el
-- evento cambie de estado y se vuelva a marcar realizado.
-- (El cron que enviaba la encuesta a ciegas 3 días después de la fecha del
-- evento se eliminó del backend: ahora la encuesta sale solo al marcar
-- REALIZADO en Post-Venta.)

ALTER TABLE public.quotations
  ADD COLUMN IF NOT EXISTS survey_sent_at timestamptz;
