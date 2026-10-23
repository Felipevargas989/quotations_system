-- 163: EL MAPA DE TU COMPETENCIA Y QUIÉN GANA LO QUE TÚ HACES
-- (23-10-2026, decisión 71 del doc 17).
--
-- Felipe, al ver «Tus competidores»: "mis competidores son esos": los que
-- ofertaron donde ofertó la empresa, ganara o perdiera, "y luego traer la
-- información de ellos, todas las licitaciones en las que participan... es
-- como un estudio de mercado"; "quién gana en mi zona es quién gana los
-- servicios que a mí me interesa participar... catering, celebraciones,
-- cenas, paseos, fiestas de funcionarios"; "la lectura de actas debería ser
-- automática"; "las 5 están bien".
--
-- 1. oportunidades_rubro: lo que la IA dijo de cada licitación adjudicada
--    de la zona, para cada empresa: si es de su rubro (sí, en parte, no),
--    qué líneas, y quién ganó esas líneas (para «Quién gana en tu zona» sin
--    volver a leer el detalle). Lleva company_id: el rubro es de cada una.
-- 2. mp_procesos.cotizantes y cotizantes_leidos_en: quién cotizó en una
--    compra ágil cerrada, crudo, tal como lo da Mercado Público (es la
--    medición: mientras está abierta la lista viene vacía). Aparte de
--    `detalle`, que el radar reescribe.
--
-- oportunidades_competidores.parecido y parecido_razon (migración 162)
-- quedan sin uso: «Parecido a ti» se sacó el 23-10.

create table if not exists public.oportunidades_rubro (
  company_id bigint not null references public.companies(id) on delete cascade,
  codigo text not null,
  del_rubro text not null check (del_rubro in ('si', 'parcial', 'no')),
  -- Las líneas del rubro (su posición en la licitación, desde 1).
  lineas integer[] not null default '{}',
  -- Quién ganó esas líneas: [{rut, nombre, monto}].
  ganadores jsonb not null default '[]'::jsonb,
  razon text,
  nombre text,
  organismo text,
  comuna text,
  region text,
  fecha date,
  modelo text,
  clasificado_en timestamptz not null default now(),
  primary key (company_id, codigo)
);

create index if not exists idx_oportunidades_rubro_zona
  on public.oportunidades_rubro (company_id, del_rubro, fecha desc);

alter table public.oportunidades_rubro enable row level security;
revoke all on public.oportunidades_rubro from anon, authenticated;
grant select, insert, update, delete on public.oportunidades_rubro
  to service_role;

alter table public.mp_procesos
  add column if not exists cotizantes jsonb,
  add column if not exists cotizantes_leidos_en timestamptz;

comment on column public.mp_procesos.cotizantes is
  'Compra ágil cerrada: quién cotizó, crudo, de Mercado Público (decisión 71). Nulo: no se ha revisado.';
