-- Decisión 113, al probarla en el laboratorio el 29-10-2026: la bandeja de
-- Oportunidades se quedaba en «Cargando…» (en el laboratorio cortaba a los
-- 9,7 s; en producción pasó de 0,5 s a entre 1,5 y 9,9 s desde la 109).
--
-- La culpa era «quién ganó el año anterior» (`historialDeOrganismos`): pide
-- las licitaciones del rubro con ganador de los compradores de la bandeja,
-- de a mil y en orden de código. La base creía que esas filas estaban
-- repartidas parejo y recorría la tabla entera por su llave: medio millón
-- de filas para traer 2.173 (17 s por página, medido en el laboratorio).
--
-- Este índice tiene solo las licitaciones del rubro con ganador (unas
-- 20 mil) y en el mismo orden de código: la base recorre esas y no la
-- tabla entera. No cambia el código ni lo que se muestra.

create index if not exists idx_mercado_compras_rubro_con_ganador
  on public.mercado_compras (codigo)
  where tipo = 'licitacion' and del_rubro and ganadores is not null;
