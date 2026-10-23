-- 162: COMPETIDORES REALES (22-10-2026, decisión 70 del doc 17).
--
-- Felipe: "en mis competidores, podemos hacerle seguimiento a las empresas
-- con las que he competido... también busca empresas similares, complejos
-- turísticos o restaurantes que hayan postulado a servicios públicos a los
-- que yo postulo... debería haber un botón de «no es mi competidor» (con un
-- confirmar)"; "ok con competidores".
--
-- 1. mp_ofertas: cada oferta de un proveedor en una licitación, leída del
--    acta pública de adjudicación (la página se abre sin código; trae todas
--    las ofertas con RUT, precio y si ganó). Una fila por licitación y RUT,
--    con lo del proceso repetido (comprador, comuna, fecha) para consultar
--    sin cruces. Es de todos (como mp_procesos): el acta es pública.
-- 2. oportunidades_competidores: lo que cada empresa marca de un proveedor
--    («Seguir», «No es mi competidor») y si la IA lo ve parecido a ella.
-- 3. mp_procesos.ofertas_leidas_en: cuándo pasaron sus ofertas a
--    mp_ofertas. No basta con acta_leida_en: «Seguir» (decisión 30) guarda
--    el acta sin pasar sus ofertas; esas se pasan desde el acta guardada,
--    sin volver a bajarla.

create table if not exists public.mp_ofertas (
  codigo text not null,
  -- Sin puntos y con K mayúscula (normalizarRut).
  rut text not null,
  proveedor text not null,
  -- Neto: precio unitario por la cantidad pedida, sumado en sus líneas.
  total_ofertado numeric,
  total_adjudicado numeric not null default 0,
  adjudicada boolean not null default false,
  lineas integer not null default 0,
  -- Lo que escribió de su oferta (corto): sirve para saber a qué se dedica.
  detalle text,
  proceso text,
  organismo_codigo text,
  organismo text,
  region text,
  comuna text,
  fecha date,
  leida_en timestamptz not null default now(),
  primary key (codigo, rut)
);

create index if not exists idx_mp_ofertas_rut on public.mp_ofertas (rut);
create index if not exists idx_mp_ofertas_comprador
  on public.mp_ofertas (organismo_codigo, fecha desc);

alter table public.mp_ofertas enable row level security;
revoke all on public.mp_ofertas from anon, authenticated;
grant select, insert, update, delete on public.mp_ofertas to service_role;

create table if not exists public.oportunidades_competidores (
  company_id bigint not null references public.companies(id) on delete cascade,
  rut text not null,
  nombre text,
  seguido boolean not null default false,
  -- «No es mi competidor»: sale de la lista y no vuelve (se puede recuperar).
  descartado boolean not null default false,
  -- La IA: ¿es un negocio parecido al de la empresa?
  similar text check (similar in ('si', 'no')),
  similar_razon text,
  clasificado_con text,
  clasificado_en timestamptz,
  actualizado_en timestamptz not null default now(),
  primary key (company_id, rut)
);

alter table public.oportunidades_competidores enable row level security;
revoke all on public.oportunidades_competidores from anon, authenticated;
grant select, insert, update, delete on public.oportunidades_competidores
  to service_role;

alter table public.mp_procesos
  add column if not exists ofertas_leidas_en timestamptz;

comment on column public.mp_procesos.ofertas_leidas_en is
  'Cuándo pasaron las ofertas de su acta a mp_ofertas (decisión 70). Nulo: por pasar.';
