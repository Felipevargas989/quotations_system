-- ============================================================
-- 175 · EL REGISTRO DE LAS DECISIONES (29-10-2026)
-- ============================================================
-- Decisión 113 del doc 17, el ciclo de aprendizaje del semáforo. Felipe:
-- «vayamos dejando registro de todas las licitaciones que he ido
-- descartando, de todas las que me interesa y saco las bases y de todas las
-- que he postulado para identificar patrones y poder afinar el semáforo»;
-- y con el plan a la vista: «me parece perfecto. Pongamos esto».
--
-- Cada decisión queda en `oportunidades_decisiones`, con el color y la
-- razón que tenía la oportunidad en ese momento: así se puede comparar lo
-- que dijo la IA con lo que hizo la empresa aunque después se relea.
--   - Cada cambio de estado (descartar, «Me interesa», seguir, postular,
--     ganar, perder, recuperar), venga de la pantalla o del motor.
--   - «estudiada»: la primera vez que se suben o se traen las bases o se
--     pide el análisis de las bases.
--   - `motivo`: el porqué de un descarte, opcional, de un clic.
-- Lo anotan dos triggers de la base, así ningún camino se queda afuera; sus
-- funciones corren como dueñas de la tabla (security definer), para que
-- anotar no dependa de quién hizo el cambio.
-- Lo que ya había hasta hoy entra como `origen = 'historia'`: el estado
-- actual de cada oportunidad, con su fecha de actualización, y la primera
-- vez que se estudiaron sus bases.
--
-- Datos de cada empresa, con company_id: RLS sin políticas, nada para anon
-- ni authenticated; solo el motor (service_role). Idempotente; primero en
-- el laboratorio y después en producción.
-- ============================================================

create table if not exists public.oportunidades_decisiones (
  id bigint generated always as identity primary key,
  company_id bigint not null,
  oportunidad_id bigint not null
    references public.oportunidades (id) on delete cascade,
  codigo text not null,
  -- El estado nuevo (descartada, en_estudio, seguida, postulada, ganada,
  -- perdida, nueva si se recuperó) o «estudiada».
  decision text not null,
  -- El estado de antes; null en «estudiada» y en lo que vino de la historia.
  antes text,
  -- El color y la razón de la IA en ese momento.
  semaforo text,
  razon text,
  -- El porqué de un descarte (decisión 113): opcional.
  motivo text check (motivo in (
    'muy_chica', 'muy_lejos', 'no_es_lo_mio', 'no_alcanzo', 'otro')),
  -- 'registro' = anotado al pasar; 'historia' = lo que había el 29-10.
  origen text not null default 'registro'
    check (origen in ('registro', 'historia')),
  creado_en timestamptz not null default now()
);

create index if not exists idx_oportunidades_decisiones_empresa
  on public.oportunidades_decisiones (company_id, creado_en desc);
create index if not exists idx_oportunidades_decisiones_oportunidad
  on public.oportunidades_decisiones (oportunidad_id, creado_en desc);

-- ------------------------------------------------------------
-- 1. Cada cambio de estado
-- ------------------------------------------------------------
create or replace function public.oportunidades_anotar_cambio_de_estado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.estado is distinct from old.estado then
    insert into oportunidades_decisiones (company_id, oportunidad_id, codigo,
      decision, antes, semaforo, razon)
    values (new.company_id, new.id, new.codigo, new.estado, old.estado,
      new.semaforo, new.razon);
  end if;
  return new;
end
$$;

drop trigger if exists anotar_cambio_de_estado on public.oportunidades;
create trigger anotar_cambio_de_estado
  after update of estado on public.oportunidades
  for each row execute function public.oportunidades_anotar_cambio_de_estado();

-- ------------------------------------------------------------
-- 2. La primera vez que se estudian las bases
-- ------------------------------------------------------------
create or replace function public.oportunidades_anotar_estudio()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into oportunidades_decisiones (company_id, oportunidad_id, codigo,
    decision, semaforo, razon)
  select o.company_id, o.id, o.codigo, 'estudiada', o.semaforo, o.razon
  from oportunidades o
  where o.id = new.oportunidad_id
    and not exists (
      select 1 from oportunidades_decisiones d
      where d.oportunidad_id = o.id and d.decision = 'estudiada');
  return new;
end
$$;

drop trigger if exists anotar_estudio_por_bases on public.oportunidad_adjuntos;
create trigger anotar_estudio_por_bases
  after insert on public.oportunidad_adjuntos
  for each row when (new.seccion = 'bases')
  execute function public.oportunidades_anotar_estudio();

drop trigger if exists anotar_estudio_por_analisis on public.oportunidad_analisis;
create trigger anotar_estudio_por_analisis
  after insert on public.oportunidad_analisis
  for each row execute function public.oportunidades_anotar_estudio();

-- ------------------------------------------------------------
-- 3. Lo que ya había (origen 'historia')
-- ------------------------------------------------------------
insert into public.oportunidades_decisiones (company_id, oportunidad_id,
  codigo, decision, semaforo, razon, origen, creado_en)
select o.company_id, o.id, o.codigo, o.estado, o.semaforo, o.razon,
  'historia', o.actualizado_en
from public.oportunidades o
where o.estado <> 'nueva'
  and not exists (
    select 1 from public.oportunidades_decisiones d
    where d.oportunidad_id = o.id and d.origen = 'historia'
      and d.decision = o.estado);

insert into public.oportunidades_decisiones (company_id, oportunidad_id,
  codigo, decision, semaforo, razon, origen, creado_en)
select o.company_id, o.id, o.codigo, 'estudiada', o.semaforo, o.razon,
  'historia', e.primera
from public.oportunidades o
join (
  select oportunidad_id, min(creado_en) as primera
  from (
    select oportunidad_id, creado_en from public.oportunidad_adjuntos
    where seccion = 'bases'
    union all
    select oportunidad_id, creado_en from public.oportunidad_analisis
  ) x
  group by oportunidad_id
) e on e.oportunidad_id = o.id
where not exists (
  select 1 from public.oportunidades_decisiones d
  where d.oportunidad_id = o.id and d.decision = 'estudiada');

-- ------------------------------------------------------------
-- 4. Qué es cada cosa
-- ------------------------------------------------------------
comment on table public.oportunidades_decisiones is
  'Cada decisión de la empresa sobre una oportunidad, con el color y la razón de la IA en ese momento: lo que mira el ciclo de aprendizaje del semáforo (decisión 113). La escriben dos triggers; el motor solo pone el motivo de un descarte.';
comment on column public.oportunidades_decisiones.decision is
  'El estado nuevo (descartada, en_estudio, seguida, postulada, ganada, perdida, nueva si se recuperó) o «estudiada»: la primera vez que se suben las bases o se pide su análisis.';
comment on column public.oportunidades_decisiones.motivo is
  'El porqué de un descarte, opcional: muy_chica, muy_lejos, no_es_lo_mio, no_alcanzo u otro.';
comment on column public.oportunidades_decisiones.origen is
  'registro = anotado al pasar; historia = lo que había el 29-10-2026, con la fecha de actualización de la oportunidad.';

-- ------------------------------------------------------------
-- 5. Permisos: solo el motor
-- ------------------------------------------------------------
alter table public.oportunidades_decisiones enable row level security;
revoke all on public.oportunidades_decisiones from anon, authenticated;
grant select, insert, update on public.oportunidades_decisiones
  to service_role;

revoke execute on function public.oportunidades_anotar_cambio_de_estado(),
  public.oportunidades_anotar_estudio()
  from public, anon, authenticated;
