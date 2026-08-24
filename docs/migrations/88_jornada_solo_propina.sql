-- 88 · La jornada solo-de-propina (24-08-2026)
--
-- Regla de Felipe: el garzon que viene a un evento tiene UN turno --
-- "primero atiende al grupo y despues las mesas que llegaron". No hay
-- doble jornada ni doble pago, pero el pozo del dia de restaurante
-- tambien es suyo. Como la propina vive en la jornada y la del evento
-- ya carga la propina del evento, al incluirlo en el reparto del dia
-- el sistema le crea por dentro una fila solo-de-propina: sin pago
-- (amount null), invisible en planificacion y calendario, con el mismo
-- horario del evento. La nomina la suma como cualquier propina.

ALTER TABLE public.event_staff
  ADD COLUMN IF NOT EXISTS solo_propina boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.event_staff.solo_propina IS
  'Fila creada por el reparto del dia de restaurante para una persona que vino a un evento: solo carga su propina del dia. Sin pago de jornada; no aparece en planificacion ni calendario.';
