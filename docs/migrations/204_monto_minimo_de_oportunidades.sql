-- 204 · EL MONTO MÍNIMO DE OPORTUNIDADES (decisión 129 del doc 17)
--
-- Felipe, 11-11-2026: *"demosle una segunda vuelta al semaforo distingamos
-- mejor cuales me interesan"*. De sus descartes desde el 29-10, el porqué
-- más repetido fue «Muy chica»: 51, todas compras ágiles, con mediana de
-- $370.000; las que marcó «Me interesa» tenían mediana de $2,2 millones.
-- Con la vara a la vista ($700.000 pinta rojas 48 de esas 51 y solo 5 de sus
-- «Me interesa»): *"ok"*.
--
-- `oportunidades_config.monto_minimo`: en pesos. Lo que pide menos queda en
-- rojo al leerlo, aunque la IA lo apruebe, y la razón empieza con «Bajo tu
-- mínimo de $X: pide $Y.» (`aplicarReglas`, `lectura/reglas.ts`). Nulo, sin
-- mínimo. Se cambia en Oportunidades → Configuración.
--
-- Valle del Sol (empresa 1 en las dos bases) parte con $700.000, como su
-- configuración de partida de la 122.
--
-- Solo el motor (service_role), como el resto de la tabla. Se corre a mano
-- en Supabase, en el laboratorio y en producción, ANTES de que llegue el
-- motor que la lee (el motor sin la 204 sigue andando: lee la tabla con `*`
-- y sin la columna no hay mínimo). Idempotente.

alter table public.oportunidades_config
  add column if not exists monto_minimo bigint;

alter table public.oportunidades_config
  drop constraint if exists oportunidades_config_monto_minimo_check;
alter table public.oportunidades_config
  add constraint oportunidades_config_monto_minimo_check
  check (monto_minimo is null or monto_minimo > 0);

comment on column public.oportunidades_config.monto_minimo is
  'Decisión 129: en pesos; lo que pide menos queda en rojo al leerlo. Nulo, sin mínimo.';

update public.oportunidades_config
set monto_minimo = 700000
where company_id = 1
  and monto_minimo is null;

-- Para deshacer:
--   alter table public.oportunidades_config drop column if exists monto_minimo;
