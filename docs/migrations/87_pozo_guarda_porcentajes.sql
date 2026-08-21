-- 87 · El pozo guarda los porcentajes de su reparto (21-08-2026)
--
-- El reparto pasa a ser POR PUNTOS: el porcentaje de un cargo es el
-- valor de su hora, no su tajada del pozo (Felipe, 21-08: "es lo mas
-- defendible y refleja mejor el espiritu de como queremos repartir").
-- La pantalla deducia los porcentajes de cuanto se llevo cada cargo;
-- con puntos esa cuenta ya no devuelve lo escrito, asi que se guardan.

ALTER TABLE public.tip_pools
  ADD COLUMN IF NOT EXISTS porcentajes jsonb;

COMMENT ON COLUMN public.tip_pools.porcentajes IS
  'Porcentajes del ultimo reparto, [{role_id, pct}]. Con el reparto por puntos el pct es el valor de la hora del cargo. NULL = sin repartir o anterior a la migracion 87.';
