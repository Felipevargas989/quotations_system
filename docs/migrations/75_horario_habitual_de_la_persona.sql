-- ===========================================================================
-- EL HORARIO HABITUAL DE LA PERSONA (Felipe, 15-08)
--
-- El horario de una asignación viene PUESTO, no vacío. La jerarquía:
--     el día  >  el horario habitual de la persona  >  el estándar
-- donde el estándar es 09:00–19:00 con 1 hora de colación.
--
-- Así la cocinera que siempre entra a las 07:00 llega con su hora puesta,
-- y el 90% de los días no se toca ningún reloj: solo la excepción.
--
-- ⚠ NO LA CORRE EL SISTEMA. Aplicada y verificada en el laboratorio.
-- ===========================================================================

ALTER TABLE public.people
  ADD COLUMN IF NOT EXISTS default_starts_at time,
  ADD COLUMN IF NOT EXISTS default_ends_at time,
  ADD COLUMN IF NOT EXISTS default_break_minutes integer;

COMMENT ON COLUMN public.people.default_starts_at IS
  'Horario habitual: se usa al asignarla a un dia si no se indica otro. Vacio = estandar 09:00.';
