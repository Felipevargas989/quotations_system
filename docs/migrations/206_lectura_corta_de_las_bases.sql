-- 206 · LA LECTURA CORTA DE LAS BASES (decisión 132 del doc 17)
--
-- Felipe, 12-11-2026: no quiere gastar los dólares del motor en leer bases
-- con Opus (los quiere para BelIA y los seguimientos): *"intentemos hacerlo
-- con un modelo barato, una lectura que diga ¿es para mí o no es para mí?"*;
-- y para empezar, *"Haz la prueba ahora con la lectura barata. Y ver si esas
-- 9 quedarían afuera"*.
--
-- `oportunidades_lectura_corta`: una fila por oportunidad que Haiku 5.5 leyó,
-- agrupadas por `lote` (cada vez que se lanza la prueba). Guarda el
-- veredicto (es_para_ti, no_es_para_ti o dudoso), el porqué en una línea,
-- la cita literal de las bases, dónde piden el servicio, lo que leyó y lo
-- que costó. Por ahora solo la escribe la prueba (`origen = 'prueba'`,
-- `POST /oportunidades/lectura-corta/prueba`); si la prueba acierta, la
-- misma tabla guardará la lectura de cada pasada del radar (`'radar'`).
-- Nada más cambia: ni la oportunidad, ni su análisis, ni la bandeja.
--
-- Datos de cada empresa, con company_id: RLS sin políticas, nada para anon
-- ni authenticated; solo el motor (service_role), sin borrar (producción le
-- da todo a service_role en cada tabla nueva: se le quita a mano).
-- Idempotente; primero en el laboratorio y después en producción.

create table if not exists public.oportunidades_lectura_corta (
  id bigint generated always as identity primary key,
  company_id bigint not null,
  oportunidad_id bigint not null
    references public.oportunidades (id) on delete cascade,
  codigo text not null,
  lote text not null,
  origen text not null default 'prueba'
    check (origen in ('prueba', 'radar')),
  estado text not null default 'procesando'
    check (estado in ('procesando', 'listo', 'error')),
  modelo text,
  veredicto text
    check (veredicto in ('es_para_ti', 'no_es_para_ti', 'dudoso')),
  porque text,
  cita jsonb,
  lugar text,
  archivos jsonb not null default '[]'::jsonb,
  no_leidos jsonb not null default '[]'::jsonb,
  tokens_entrada integer,
  tokens_salida integer,
  costo_usd numeric(10, 4),
  error text,
  creado_en timestamptz not null default now(),
  terminado_en timestamptz
);

create index if not exists idx_lectura_corta_lote
  on public.oportunidades_lectura_corta (company_id, lote);
create index if not exists idx_lectura_corta_oportunidad
  on public.oportunidades_lectura_corta (oportunidad_id, creado_en desc);

comment on table public.oportunidades_lectura_corta is
  'Decisión 132: la lectura corta de las bases con Haiku (¿es para la empresa?), una fila por oportunidad y lote. La escribe solo el motor; por ahora, solo la prueba.';
comment on column public.oportunidades_lectura_corta.veredicto is
  'es_para_ti, no_es_para_ti (solo si las bases lo dejan claro) o dudoso (ante la duda).';
comment on column public.oportunidades_lectura_corta.cita is
  '{texto, documento, pagina}: el texto literal de las bases que sostiene el veredicto.';
comment on column public.oportunidades_lectura_corta.lote is
  'Cada lanzamiento de la prueba: la hora en que partió (ISO).';

alter table public.oportunidades_lectura_corta enable row level security;
revoke all on public.oportunidades_lectura_corta from anon, authenticated;
grant select, insert, update on public.oportunidades_lectura_corta
  to service_role;
revoke delete, truncate on public.oportunidades_lectura_corta
  from service_role;

-- Para deshacer:
--   drop table if exists public.oportunidades_lectura_corta;
