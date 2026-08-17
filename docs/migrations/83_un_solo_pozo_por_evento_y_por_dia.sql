-- ============================================================
-- 83 — UN SOLO POZO DE PROPINA POR EVENTO Y POR DÍA (16-08)
--
-- Encontrado en la revisión previa a producción.
--
-- tip_pools nació sin ninguna llave única, y la pantalla muestra UN
-- solo pozo por evento: `pools.find(...)` se queda con el primero. Si
-- alguna vez se crearon dos —pasó: escribir el monto tecla por tecla
-- creaba un pozo por dígito, por eso hoy el campo usa onCommit— los de
-- sobra quedan invisibles: no se ven, no se editan y no se borran desde
-- ninguna pantalla.
--
-- Y no son inofensivos. Cerrar la ficha suma TODOS los pozos del evento
-- y se niega mientras alguno con monto siga sin repartir. Como el pozo
-- de sobra no se puede alcanzar, la ficha no cierra nunca; y como a la
-- nómina solo entra lo liquidado, NADIE de ese evento se puede pagar
-- jamás. En el laboratorio estaba pasando: la cotización
-- 7b5833f2 tenía cinco pozos ($5 repartido, más $50, $500, $5.000 y
-- $50.000 fantasma) y su ficha llevaba días trabada en "armando".
--
-- El arreglo es la restricción que faltaba. Antes hay que limpiar, y se
-- limpia solo lo que no le quita plata a nadie: pozos sin repartir y
-- sin ninguna fila de personal colgando.
--
-- En PRODUCCIÓN la tabla todavía no existe (llega con la 77 en este
-- mismo paquete), así que nacerá vacía y el DELETE no tocará nada.
--
-- Aplicada en LABORATORIO: pendiente.
-- Aplicada en PRODUCCIÓN: pendiente (paquete 68→83).
-- ============================================================

-- 1) Los duplicados que no le pertenecen a nadie.
--    Se conserva el repartido; si ninguno lo está, el más antiguo.
DELETE FROM public.tip_pools tp
WHERE tp.distributed_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.event_staff es WHERE es.tip_pool_id = tp.id
  )
  AND EXISTS (
    SELECT 1
    FROM public.tip_pools otro
    WHERE otro.company_id = tp.company_id
      AND otro.id <> tp.id
      AND (
        (tp.quotation_id IS NOT NULL AND otro.quotation_id = tp.quotation_id)
        OR (tp.quotation_id IS NULL AND tp.day IS NOT NULL AND otro.day = tp.day
            AND otro.quotation_id IS NULL)
      )
      AND (
        otro.distributed_at IS NOT NULL
        OR otro.created_at < tp.created_at
        OR (otro.created_at = tp.created_at AND otro.id < tp.id)
      )
  );

-- 2) La restricción que faltaba. Son dos índices parciales porque un
--    pozo es de un evento O de un día, nunca de los dos (CHECK de la 77).
CREATE UNIQUE INDEX IF NOT EXISTS tip_pools_uno_por_evento
  ON public.tip_pools (company_id, quotation_id)
  WHERE quotation_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS tip_pools_uno_por_dia
  ON public.tip_pools (company_id, day)
  WHERE quotation_id IS NULL AND day IS NOT NULL;

COMMENT ON INDEX public.tip_pools_uno_por_evento IS
  'Un evento tiene UN pozo. Los de sobra quedan invisibles y traban el cierre de la ficha.';
COMMENT ON INDEX public.tip_pools_uno_por_dia IS
  'Un dia de restaurante tiene UN pozo por la misma razon.';
