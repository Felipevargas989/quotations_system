-- 157 — «SE VIENE»: SI SE REPITE, SEGÚN LA IA, Y DESCARTAR (decisión 63 del
-- doc 17, 20-10-2026).
--
-- Felipe: "dos licitaciones con nombres similares, con montos similares,
-- debería ser considerado una repetición; por eso es que usamos IA y no un
-- bot... para que si el nombre cambia un poco, identifique que son las
-- mismas"; y "el botón descartar, si es que yo siento que no se va a
-- repetir". «Se viene» agrupaba solo por palabras en común: si el nombre
-- cambiaba, la serie se partía y decía «salió una vez».
--
-- Se suma a la lectura de cada serie (migración 156): qué licitaciones de
-- años anteriores del mismo comprador son ediciones del mismo evento, según
-- la IA, y si la empresa la descartó.

alter table public.oportunidades_se_viene
  -- Los códigos de las ediciones anteriores del mismo evento; null: la IA
  -- todavía no lo revisa; vacío: salió una sola vez.
  add column if not exists ediciones text[],
  -- Por qué, en una frase.
  add column if not exists repeticion text,
  -- La empresa la sacó de «Se viene» («no creo que se repita»).
  add column if not exists descartada_en timestamptz;
