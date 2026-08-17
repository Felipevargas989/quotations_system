-- ============================================================
-- 85 — LAS SILLAS SIN DÍA CAEN AL PRIMER DÍA DEL EVENTO (17-08)
--
-- Regla de Felipe para el paso a producción: "hoy los garzones no
-- reconocen días; para evitar errores tira todo al primer día del
-- evento, en caso de eventos de un día todo a ese".
--
-- La 81 ya resuelve los eventos de UN día. Esta remata los de varios:
-- toda silla que la 84 dejó "por ubicar" (sin día) cae al primer día.
-- Es solo el punto de partida de la carga — desde Gestión se mueven con
-- el + y el − al día que corresponda, como cualquier silla.
--
-- Medido en producción antes de escribirla: son 4 líneas del plan
-- (17 sillas) en 2 eventos — Iglesia Adventista #394 y Joker #423.
--
-- Aplicada en LABORATORIO: pendiente.
-- Aplicada en PRODUCCIÓN: pendiente (paquete 68→85).
-- ============================================================

UPDATE public.event_staff es
SET day = q.event_date::date
FROM public.quotations q
WHERE es.quotation_id = q.id
  AND es.day IS NULL
  AND es.person_id IS NULL          -- solo sillas vacías: nadie con nombre queda sin día
  AND q.event_date IS NOT NULL;
