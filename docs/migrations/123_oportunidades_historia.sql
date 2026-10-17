-- ============================================================
-- 123 · OPORTUNIDADES, SPRINT 1b: LA HISTORIA (17-10-2026)
-- ============================================================
-- Doc 17, decisión 3: "quién ganó el año anterior, a qué valor y con qué
-- servicios". El radar carga 3 años de licitaciones pasadas, un día a la
-- vez (la API de Mercado Público entrega las de una fecha con ?fecha=), de
-- noche y en el tiempo que le sobra a cada corrida. Esta tabla lleva la
-- cuenta de qué días ya se revisaron, para seguir donde quedó.
--
-- Se revisan primero los días cercanos a "hace un año", que son los que
-- sirven para "el año anterior" de lo que está abierto hoy (`prioridad`).
--
-- Dato público, igual para todas las empresas: sin company_id, como las
-- otras mp_*. Va con su RLS, su REVOKE y su GRANT en la misma migración
-- (lección 5 del cuaderno de incidentes). Idempotente.
-- ============================================================

create table if not exists public.mp_historia (
  fecha date primary key,
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'hecha', 'error')),
  -- Días de distancia a "hace un año": se revisa de menor a mayor.
  prioridad integer not null default 0,
  listadas integer,
  candidatas integer,
  guardadas integer,
  error text,
  revisada_en timestamptz
);

create index if not exists idx_mp_historia_pendientes
  on public.mp_historia (prioridad)
  where estado = 'pendiente';

alter table public.mp_historia enable row level security;
revoke all on public.mp_historia from anon, authenticated;
grant select, insert, update, delete on public.mp_historia to service_role;

-- Los 3 años hacia atrás desde ayer (hora de Chile).
insert into public.mp_historia (fecha, prioridad)
select d::date,
       abs(d::date - ((now() at time zone 'America/Santiago')::date - 365))
from generate_series(
  (now() at time zone 'America/Santiago')::date - interval '3 years',
  (now() at time zone 'America/Santiago')::date - interval '1 day',
  interval '1 day'
) as d
on conflict (fecha) do nothing;

-- "El año anterior" busca por organismo comprador.
create index if not exists idx_mp_procesos_organismo
  on public.mp_procesos (organismo_codigo);

-- ============================================================
-- REVERSA:
--   drop index if exists public.idx_mp_procesos_organismo;
--   drop table if exists public.mp_historia;
-- ============================================================
