-- 89 · El cambio de dia de la planta (24-08-2026)
--
-- Soledad libra domingo y lunes; Felipe le cambio los dias: trabaja el
-- 23-24 y descansa el 25-26. El sistema la traia como freelance con
-- monto obligatorio ("es un cambio de dia... deberia asumir que viene
-- de planta"), y la proyeccion anual ademas deshacia el cambio: borraba
-- el dia agregado y recreaba el quitado.
--
-- El ajuste vive en la jornada:
--   'trabaja'  = dia agregado a mano (la proyeccion no lo borra)
--   'descansa' = dia quitado a mano (la proyeccion no lo recrea; las
--                pantallas no lo muestran: ese dia no viene)
-- Regla de origen (Felipe): desde el calendario de la persona es un
-- cambio de dia de planta, sin plata; desde Planificacion sigue siendo
-- refuerzo freelance con monto.

ALTER TABLE public.event_staff
  ADD COLUMN IF NOT EXISTS ajuste text
  CHECK (ajuste IN ('trabaja', 'descansa'));

COMMENT ON COLUMN public.event_staff.ajuste IS
  'Cambio de dia hecho a mano en el calendario de la persona: trabaja (dia agregado, la proyeccion no lo borra) o descansa (dia quitado, la proyeccion no lo recrea y no se muestra). NULL = jornada normal.';
