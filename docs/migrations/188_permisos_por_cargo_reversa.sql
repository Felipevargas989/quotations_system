-- Reversa de la 188 · Permisos por cargo (doc 22).
--
-- Deja todo como antes: sin la tabla, el motor usa lo de fábrica, que es lo
-- de hoy (no se cae). Se pierde lo que cada empresa apartó de fábrica y el
-- registro de cambios: antes de correrla, guardar el antes en
-- 02_RESPALDOS/cambios_de_datos.

drop function if exists
  public.permisos_por_cargo_cambiar(bigint, text, text, boolean, boolean, uuid, text);
drop function if exists
  public.permisos_por_cargo_a_fabrica(bigint, uuid, text);
drop table if exists public.permisos_por_cargo_cambios;
drop table if exists public.permisos_por_cargo;
