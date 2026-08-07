-- Migración 64 — CANDADO DEL ESTADO DE LA COSECHA (07-08-2026, revisión).
--
-- La 63 dejó harvest_status como texto libre: el único guardián era el
-- DTO del backend. Un backfill, una corrección a mano en Supabase o un
-- endpoint futuro que escriba la columna sin pasar por ahí podía dejar
-- "revendida" o "EN_GESTION"; el frontend lo descarta y vuelve a la
-- sugerencia, o sea que el estado puesto a mano desaparecía sin error ni
-- rastro. El candado va donde no se puede eludir.
-- 100 % aditiva: NULL sigue siendo válido (= manda la sugerencia).
ALTER TABLE public.quotations
  DROP CONSTRAINT IF EXISTS quotations_harvest_status_check;

ALTER TABLE public.quotations
  ADD CONSTRAINT quotations_harvest_status_check
  CHECK (harvest_status IS NULL OR harvest_status IN (
    'revendido', 'en_gestion', 'no_ha_vuelto', 'no_se_repite', 'descartado'
  ));
