-- ============================================================
-- 80 — EL HORARIO HABITUAL, DÍA POR DÍA (15-08)
--
-- Pedido de Felipe: "en la parte de días trabajados deberíamos
-- poder diferenciar que distintos días llegan a distintas horas".
--
-- Hasta ahora la ficha guardaba UN solo horario habitual
-- (default_starts_at / default_ends_at / default_break_minutes)
-- para todos los días de la semana. Pero el sábado se entra a las
-- 10 y se sale a las 16, y de lunes a viernes es 08 a 18: con un
-- solo horario había que ir corrigiendo día por día en el
-- calendario, que es justo lo que se quería evitar.
--
-- `weekly_schedule` guarda el horario POR DÍA DE LA SEMANA:
--
--   { "1": { "in": "08:00", "out": "18:00", "break": 60 },
--     "6": { "in": "10:00", "out": "16:00", "break": 30 } }
--
-- Las claves son 0=domingo … 6=sábado, las mismas de `days_off`.
--
-- NO reemplaza a nada: es una capa más de la escalera.
--   1. lo del día (event_staff)  manda sobre
--   2. el día de la semana (weekly_schedule)  manda sobre
--   3. el horario único de la ficha (default_starts_at…)  manda sobre
--   4. el estándar de la casa (09:00–19:00, 1 h de colación).
-- Así, quien ya tenía su horario cargado sigue igual hasta que se
-- le ponga uno distinto a un día.
--
-- Quién trabaja y quién no lo sigue diciendo `days_off`: este
-- campo es SOLO horarios.
--
-- Aplicada en LABORATORIO: 15-08-2026.
-- Aplicada en PRODUCCIÓN: pendiente (paquete 68→80).
-- ============================================================

ALTER TABLE public.people
  ADD COLUMN IF NOT EXISTS weekly_schedule jsonb;

COMMENT ON COLUMN public.people.weekly_schedule IS
  'Horario habitual por dia de la semana: {"1":{"in":"08:00","out":"18:00","break":60}}. 0=domingo..6=sabado. Sin entrada = usa el horario unico de la ficha.';
