-- 86 · Los cierres administrativos no son historia (21-08-2026)
--
-- El 17 y 18-08 se cerraron por SQL 110 fichas de eventos historicos,
-- anteriores al modulo, todos sin una sola persona: no habia nada que
-- liquidar y Felipe pidio "dejarlos como liquidados y ya". Pero la
-- pantalla los listaba como "14 ya liquidados", mezclados con el
-- historial real. Felipe (21-08): "queria tener el historial de lo que
-- voy liquidando, pero esos 14 son anteriores a esta implementacion".
--
-- Se marcan explicitamente. NO se usa "sin gente" como regla: un evento
-- que Felipe liquide vacio manana SI es historia suya y debe verse.

ALTER TABLE public.staff_sheets
  ADD COLUMN IF NOT EXISTS cierre_administrativo boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.staff_sheets.cierre_administrativo IS
  'Cerrada por SQL al arrancar el modulo (17/18-08-2026), sin gente ni plata. La pantalla no la lista como historial.';

UPDATE public.staff_sheets ss
SET cierre_administrativo = true
WHERE ss.closed_at IS NOT NULL
  AND ss.closed_at < '2026-08-19'
  AND NOT EXISTS (
    SELECT 1 FROM public.event_staff es
    WHERE es.quotation_id = ss.quotation_id AND es.person_id IS NOT NULL
  );
