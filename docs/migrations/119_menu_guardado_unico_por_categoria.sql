-- Migración 119 — EL NOMBRE DE UN MENÚ GUARDADO ES ÚNICO DENTRO DE SU
-- CATEGORÍA, no en toda la empresa (11-10-2026, Felipe: "hazlo").
--
-- QUÉ RESUELVE: desde la migración 2 el nombre de un menú guardado tenía
-- que ser único en TODA la empresa (service_groups_company_id_name_unique).
-- Valle del Sol tiene cada menú de Almuerzo repetido en Cena (mismos
-- platos, 10-10-2026), y los gemelos tenían que llevar "(almuerzo)" o
-- "(cena)" para no chocar. Al quitarle el sufijo a "Pollo al jugo - Arroz
-- y vino (almuerzo)", el motor respondió "Ya existe un menú guardado con
-- ese nombre" porque el de Cena se llama igual. El mismo choque ya había
-- molestado el 05-08 con "Desayuno de campo" (existía en una categoría
-- vieja).
--
-- REGLA NUEVA: único por (empresa, categoría, nombre). Dos menús de la
-- misma categoría no pueden llamarse igual; uno de Almuerzo y otro de Cena,
-- sí. No confunde: el cotizador muestra solo los menús de la categoría de
-- la caja, y al armar un paquete cada menú lleva su categoría al lado
-- (PkgMenusPicker).
--
-- Segura antes o después del motor: la regla nueva es más permisiva que la
-- vieja (todo lo que existe ya la cumple) y el motor solo cambia el texto
-- del aviso. Idempotente.
-- ============================================================

do $$
begin
  if not exists (select 1 from pg_constraint
                 where conname = 'service_groups_company_category_name_unique') then
    alter table public.service_groups
      add constraint service_groups_company_category_name_unique
      unique (company_id, category, name);
  end if;
end $$;

alter table public.service_groups
  drop constraint if exists service_groups_company_id_name_unique;

-- ============================================================
-- REVERSA (solo si no hay dos menús con el mismo nombre en categorías
-- distintas; si los hay, primero hay que renombrarlos):
--   alter table public.service_groups
--     add constraint service_groups_company_id_name_unique unique (company_id, name);
--   alter table public.service_groups
--     drop constraint if exists service_groups_company_category_name_unique;
