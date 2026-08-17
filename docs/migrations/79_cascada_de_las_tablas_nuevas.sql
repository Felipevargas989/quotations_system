-- ============================================================
-- 79 — LAS TABLAS NUEVAS SE VAN CON SU COTIZACIÓN (15-08)
--
-- Las cuatro tablas creadas en las migraciones 77 y 78 apuntan a
-- `quotations` SIN "ON DELETE CASCADE", y son las únicas del
-- sistema que se lo saltan: todas las demás (8, 16, 17, 22, 28,
-- 49, 59, 71) lo llevan.
--
-- La consecuencia es concreta y ya pasa en el laboratorio: basta
-- abrir la Ficha de Personal de un evento —eso escribe una fila
-- en staff_sheets— para que esa cotización NO SE PUEDA BORRAR
-- nunca más. El error de la base sale como un 500 sin explicar
-- nada, y en pantalla se lee "vuelve a intentarlo", que es
-- justamente lo que no sirve.
--
-- Se arregla antes de que el paquete llegue a producción.
--
-- Aplicada en LABORATORIO: 15-08-2026.
-- Aplicada en PRODUCCIÓN: pendiente (paquete 68→79).
-- ============================================================

ALTER TABLE public.staff_sheets
  DROP CONSTRAINT IF EXISTS staff_sheets_quotation_id_fkey,
  ADD CONSTRAINT staff_sheets_quotation_id_fkey
    FOREIGN KEY (quotation_id) REFERENCES public.quotations(id) ON DELETE CASCADE;

ALTER TABLE public.tip_pools
  DROP CONSTRAINT IF EXISTS tip_pools_quotation_id_fkey,
  ADD CONSTRAINT tip_pools_quotation_id_fkey
    FOREIGN KEY (quotation_id) REFERENCES public.quotations(id) ON DELETE CASCADE;

ALTER TABLE public.person_reviews
  DROP CONSTRAINT IF EXISTS person_reviews_quotation_id_fkey,
  ADD CONSTRAINT person_reviews_quotation_id_fkey
    FOREIGN KEY (quotation_id) REFERENCES public.quotations(id) ON DELETE CASCADE;

ALTER TABLE public.day_notes
  DROP CONSTRAINT IF EXISTS day_notes_quotation_id_fkey,
  ADD CONSTRAINT day_notes_quotation_id_fkey
    FOREIGN KEY (quotation_id) REFERENCES public.quotations(id) ON DELETE CASCADE;
