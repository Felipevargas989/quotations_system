-- ============================================================
-- 120 · GRUPOS DE PAQUETES (12-10-2026)
-- ============================================================
-- Felipe: "un cliente me pregunta por un paseo y debo tener dos o tres
-- alternativas juntas y si no tengo que estar scrolleando mucho", y después
-- "mejor crear y editar listas, es más fácil que una sección que se arme por
-- el nombre del paquete".
--
-- Un grupo de paquetes es una lista con nombre y orden (Full day,
-- Alojamiento, Graduación, Matrimonio…). Cada paquete puede estar en UN grupo
-- o en ninguno ("Otros", al final de la lista). Borrar un grupo no borra sus
-- paquetes: quedan sin grupo (ON DELETE SET NULL).
--
-- Regla de la casa (lección 5 del cuaderno de incidentes): tabla nueva por
-- SQL directo lleva su GRANT, su secuencia y su RLS en la MISMA migración.
-- Solo el motor (service_role) la toca.
--
-- Orden de la casa: se aplica ANTES del deploy del motor que la usa, primero
-- en el laboratorio y después en producción. Idempotente.
-- ============================================================

create table if not exists public.package_groups (
  id bigint generated always as identity primary key,
  company_id bigint not null references public.companies(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint package_groups_company_name_unique unique (company_id, name)
);

alter table public.package_groups enable row level security;
grant select, insert, update, delete on public.package_groups to service_role;
-- SOLO la secuencia de esta tabla: "ALL ... IN SCHEMA" está prohibido en
-- esta casa desde el incidente de rutina_gym_state (11-09).
grant usage, select on sequence public.package_groups_id_seq to service_role;

alter table public.service_group_collections
  add column if not exists package_group_id bigint
    references public.package_groups(id) on delete set null;

create index if not exists idx_service_group_collections_package_group
  on public.service_group_collections (package_group_id);

-- ------------------------------------------------------------
-- RELLENO: el 12-10 los paquetes de Valle del Sol ya se nombraron
-- "Grupo: qué incluye". Cada prefijo antes de los dos puntos pasa a ser un
-- grupo de su empresa (en orden alfabético; el orden se cambia en la
-- pantalla), y cada paquete queda en el suyo. Los nombres no se tocan.
-- ------------------------------------------------------------
insert into public.package_groups (company_id, name, sort_order)
select company_id, grupo, row_number() over (partition by company_id order by grupo)
from (
  select distinct company_id, btrim(split_part(name, ':', 1)) as grupo
  from public.service_group_collections
  where position(':' in name) > 1
) g
where grupo <> ''
on conflict (company_id, name) do nothing;

update public.service_group_collections c
set package_group_id = g.id
from public.package_groups g
where g.company_id = c.company_id
  and position(':' in c.name) > 1
  and g.name = btrim(split_part(c.name, ':', 1))
  and c.package_group_id is null;

-- ============================================================
-- REVERSA (los paquetes vuelven a no tener grupo; sus nombres no cambian):
--   alter table public.service_group_collections drop column if exists package_group_id;
--   drop table if exists public.package_groups;
-- ============================================================
