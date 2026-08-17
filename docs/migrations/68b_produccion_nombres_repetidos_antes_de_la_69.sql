-- ============================================================
-- 68b — PRODUCCIÓN: fundir los recursos con nombre repetido ANTES de la 69
--
-- Se corre SOLO en producción, entre la 68 y la 69.
--
-- La 69 crea un índice único por (empresa, tipo, nombre sin mayúsculas).
-- Medido en producción el 17-08 antes de subir: hay UN par que choca —
--   id 22 "Servicio de Masajes" (arriendo, usado en 2 eventos)
--   id 28 "Servicio de masajes" (arriendo, sin usos)
-- Con ese par presente la 69 aborta a mitad de camino y deja el paquete
-- a medias. Es el hallazgo de la revisión del 16-08 que se había
-- descartado como falsa alarma: era real, para exactamente un caso.
--
-- Son el mismo servicio escrito dos veces. Lo correcto es FUNDIRLOS —
-- mover cualquier uso del repetido al original y apagar el repetido —
-- y no relajar el índice, que existe justamente para que esto no vuelva
-- a pasar.
--
-- Escrito genérico (por nombre, no por id) para que sirva aunque el
-- día del despliegue haya aparecido otro par: conserva el de menor id,
-- que es el más antiguo.
-- ============================================================

BEGIN;

-- 1) Los pares: para cada (empresa, tipo, nombre normalizado) con más de
--    uno, el original es el de menor id.
CREATE TEMP TABLE pares ON COMMIT DROP AS
SELECT mr.id AS repetido,
       (SELECT min(o.id) FROM public.management_resources o
         WHERE o.company_id = mr.company_id
           AND o.type = mr.type
           AND lower(btrim(o.name)) = lower(btrim(mr.name))) AS original
FROM public.management_resources mr
WHERE mr.id <> (SELECT min(o.id) FROM public.management_resources o
                 WHERE o.company_id = mr.company_id
                   AND o.type = mr.type
                   AND lower(btrim(o.name)) = lower(btrim(mr.name)));

-- 2) Cualquier uso del repetido pasa al original.
UPDATE public.event_resources er
SET resource_id = p.original
FROM pares p
WHERE er.resource_id = p.repetido;

-- 3) El repetido se apaga y queda marcado, no se borra: la historia se
--    conserva y se ve que fue fundido.
UPDATE public.management_resources mr
SET is_active = false,
    name = mr.name || ' (fundido en #' || p.original::text || ')'
FROM pares p
WHERE mr.id = p.repetido;

-- 4) Comprobación: si queda algún par, la transacción se cae acá y no
--    después, a mitad de la 69.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM (
    SELECT company_id, type, lower(btrim(name))
    FROM public.management_resources
    GROUP BY 1,2,3 HAVING count(*) > 1
  ) x;
  IF n > 0 THEN
    RAISE EXCEPTION 'Quedan % nombres repetidos: la 69 abortaría', n;
  END IF;
END $$;

COMMIT;
