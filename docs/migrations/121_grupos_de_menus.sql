-- ============================================================
-- 121 · GRUPOS DE MENÚS GUARDADOS (12-10-2026)
-- ============================================================
-- Felipe, al ver los grupos de paquetes en el laboratorio: "podría este
-- tener el mismo diseño… así podemos ordenar también los menús guardados de
-- cada categoría". Mismo mecanismo que la migración 120, pero cada grupo
-- pertenece a UNA categoría (Almuerzo: Nivel 1, Nivel 2, Nivel 3…): la
-- categoría va como TEXTO, igual que en service_groups.category.
--
-- Un menú puede estar en un grupo de su categoría o en ninguno ("Otros", al
-- final de "Usar menú guardado"). Borrar un grupo no borra sus menús: quedan
-- sin grupo (ON DELETE SET NULL). Que el grupo sea de la misma categoría del
-- menú lo exige el motor (ServiceGroupsService.asignarGrupo).
--
-- Regla de la casa (lección 5): GRANT, secuencia y RLS en la MISMA
-- migración; solo el motor (service_role) la toca. Sin relleno: los grupos
-- de cada empresa se arman desde la pantalla ("Ordenar grupos…").
--
-- Orden de la casa: ANTES del deploy del motor que la usa, primero en el
-- laboratorio y después en producción. Idempotente.
-- ============================================================

create table if not exists public.menu_groups (
  id bigint generated always as identity primary key,
  company_id bigint not null references public.companies(id) on delete cascade,
  category text not null,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint menu_groups_company_category_name_unique unique (company_id, category, name)
);

alter table public.menu_groups enable row level security;
grant select, insert, update, delete on public.menu_groups to service_role;
-- SOLO la secuencia de esta tabla ("ALL ... IN SCHEMA" prohibido, 11-09).
grant usage, select on sequence public.menu_groups_id_seq to service_role;

alter table public.service_groups
  add column if not exists menu_group_id bigint
    references public.menu_groups(id) on delete set null;

create index if not exists idx_service_groups_menu_group
  on public.service_groups (menu_group_id);

-- ============================================================
-- REVERSA (los menús vuelven a no tener grupo; nada más cambia):
--   alter table public.service_groups drop column if exists menu_group_id;
--   drop table if exists public.menu_groups;
-- ============================================================
