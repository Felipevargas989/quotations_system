-- ============================================================
-- 81 — LOS CUPOS SIN DÍA DE UN EVENTO DE UN SOLO DÍA (15-08)
--
-- Pedido de Felipe: *"al ser evento de un solo día debería
-- asignarlo automático"*.
--
-- Hasta la migración 70, un recurso de evento decía CUÁNTOS pero
-- no QUÉ DÍA: "10 garzones" y nada más. Al agregar la columna
-- `day`, todo lo viejo quedó en NULL, y la sábana los muestra
-- como "+N sin día" con un aviso para ir a repartirlos.
--
-- En un evento de UN SOLO DÍA ese aviso no tiene sentido: no hay
-- nada que repartir, el cupo va el día del evento y punto. Es
-- trabajo inventado.
--
-- Esta migración cierra ese caso de una vez. Los eventos de
-- VARIOS días NO se tocan: ahí el reparto sí es una decisión
-- (tres el jueves, dos el viernes) y la tiene que tomar Felipe.
--
-- Medido antes de escribirla en el laboratorio: 10 recursos sin
-- día, los 10 de eventos de un solo día. Cero de eventos largos.
--
-- Aplicada en LABORATORIO: 15-08-2026.
-- Aplicada en PRODUCCIÓN: pendiente (paquete 68→81).
-- ============================================================

UPDATE public.event_resources er
SET day = q.event_date::date
FROM public.quotations q
WHERE er.quotation_id = q.id
  AND er.day IS NULL
  AND q.event_date IS NOT NULL
  -- Un solo día: sin fecha de término, o con término igual al inicio.
  AND (
    q.event_end_date IS NULL
    OR q.event_end_date::date = q.event_date::date
  );
