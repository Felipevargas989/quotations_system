-- ============================================================
-- 122 · OPORTUNIDADES, SPRINT 1: EL RADAR (16-10-2026)
-- ============================================================
-- Felipe: "nuestro problema no trabajamos con una base de datos". El bot de
-- GitHub preguntaba "las licitaciones de hoy" y lo que no salía en esa lista
-- en ese momento se perdía para siempre (el Día del Profesor y el Día del
-- Funcionario de Quillón, 9-10). Desde ahora Eventia guarda todo en su
-- propia base y solo pide lo que no tiene. Plan completo:
-- docs/arquitectura/17_MODULO_DE_OPORTUNIDADES.md.
--
-- Dos clases de tabla (doc 17, regla 4):
--  - mp_*: datos PÚBLICOS de Mercado Público, iguales para todas las
--    empresas. Por eso no llevan company_id.
--  - oportunidades*: lo de CADA empresa (la lectura de la IA, su decisión,
--    su configuración). Llevan company_id y el motor filtra por él.
--
-- Regla de la casa (lección 5 del cuaderno de incidentes): tabla nueva por
-- SQL directo lleva su GRANT, su secuencia y su RLS en la MISMA migración.
-- Solo el motor (service_role) las toca. El REVOKE a anon/authenticated es
-- un cinturón extra: la migración 108 ya cerró el grifo en producción, pero
-- ninguna de estas tablas debe nacer abierta aunque el grifo se reabra.
--
-- Orden de la casa: se aplica ANTES del deploy del motor que la usa, primero
-- en el laboratorio y después en producción. Idempotente.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Los procesos de Mercado Público (licitaciones y compras ágiles)
-- ------------------------------------------------------------
create table if not exists public.mp_procesos (
  codigo text primary key,
  tipo text not null check (tipo in ('licitacion', 'compra_agil')),
  nombre text not null,
  descripcion text,
  organismo text,
  organismo_codigo text,
  unidad text,
  region text,
  comuna text,
  monto numeric,
  moneda text,
  estado text,
  fecha_publicacion timestamptz,
  fecha_cierre timestamptz,
  -- Preguntas, respuestas, aperturas, adjudicación… tal como vienen.
  fechas jsonb not null default '{}'::jsonb,
  productos jsonb not null default '[]'::jsonb,
  -- Quién ganó, a qué precio y cuántos ofertaron (se llena al cerrar).
  adjudicacion jsonb,
  -- La respuesta completa de la API, para no tener que volver a pedirla.
  detalle jsonb,
  primera_vez_visto timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create index if not exists idx_mp_procesos_fecha_cierre
  on public.mp_procesos (fecha_cierre);
create index if not exists idx_mp_procesos_region
  on public.mp_procesos (region);
create index if not exists idx_mp_procesos_primera_vez
  on public.mp_procesos (primera_vez_visto desc);

alter table public.mp_procesos enable row level security;
revoke all on public.mp_procesos from anon, authenticated;
grant select, insert, update, delete on public.mp_procesos to service_role;

-- ------------------------------------------------------------
-- 2. El historial de cambios ("ojo si se reabre", Felipe)
-- ------------------------------------------------------------
create table if not exists public.mp_cambios (
  id bigint generated always as identity primary key,
  codigo text not null references public.mp_procesos(codigo) on delete cascade,
  -- fecha_cierre | estado | reapertura
  tipo text not null,
  antes jsonb,
  despues jsonb,
  creado_en timestamptz not null default now()
);

create index if not exists idx_mp_cambios_codigo
  on public.mp_cambios (codigo, creado_en desc);

alter table public.mp_cambios enable row level security;
revoke all on public.mp_cambios from anon, authenticated;
grant select, insert, update, delete on public.mp_cambios to service_role;
-- SOLO la secuencia de esta tabla: "ALL ... IN SCHEMA" está prohibido en
-- esta casa desde el incidente de rutina_gym_state (11-09).
grant usage, select on sequence public.mp_cambios_id_seq to service_role;

-- ------------------------------------------------------------
-- 3. Las corridas del radar: bitácora y candado
-- ------------------------------------------------------------
create table if not exists public.mp_radar_corridas (
  id bigint generated always as identity primary key,
  -- reloj | manual | arranque
  origen text not null,
  estado text not null default 'corriendo'
    check (estado in ('corriendo', 'ok', 'error', 'abandonada')),
  empezo_en timestamptz not null default now(),
  termino_en timestamptz,
  resumen jsonb not null default '{}'::jsonb,
  error text
);

-- El candado: solo puede haber UNA fila "corriendo". El motor no confía en
-- su memoria para esto (zona 10 del mapa: con dos réplicas, la memoria no
-- sirve de candado).
create unique index if not exists mp_radar_una_corriendo
  on public.mp_radar_corridas ((true))
  where estado = 'corriendo';

alter table public.mp_radar_corridas enable row level security;
revoke all on public.mp_radar_corridas from anon, authenticated;
grant select, insert, update, delete on public.mp_radar_corridas to service_role;
grant usage, select on sequence public.mp_radar_corridas_id_seq to service_role;

-- ------------------------------------------------------------
-- 4. Lo de cada empresa: la lectura de la IA y su decisión
-- ------------------------------------------------------------
create table if not exists public.oportunidades (
  id bigint generated always as identity primary key,
  company_id bigint not null references public.companies(id) on delete cascade,
  codigo text not null references public.mp_procesos(codigo) on delete cascade,
  semaforo text check (semaforo in ('verde', 'amarillo', 'rojo')),
  etiquetas text[] not null default '{}',
  se_hace_en_el_complejo text
    check (se_hace_en_el_complejo in ('si', 'no', 'dudoso')),
  razon text,
  -- comuna_cercana | alto_valor
  alertas text[] not null default '{}',
  leida_con text,
  leida_en timestamptz,
  estado text not null default 'nueva'
    check (estado in ('nueva', 'en_estudio', 'postulada', 'ganada', 'perdida', 'descartada')),
  responsable_id uuid references public.user_profiles(id) on delete set null,
  notas text,
  quotation_id uuid references public.quotations(id) on delete set null,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint oportunidades_empresa_codigo_unique unique (company_id, codigo)
);

create index if not exists idx_oportunidades_empresa_semaforo
  on public.oportunidades (company_id, semaforo);
create index if not exists idx_oportunidades_empresa_estado
  on public.oportunidades (company_id, estado);

alter table public.oportunidades enable row level security;
revoke all on public.oportunidades from anon, authenticated;
grant select, insert, update, delete on public.oportunidades to service_role;
grant usage, select on sequence public.oportunidades_id_seq to service_role;

-- ------------------------------------------------------------
-- 5. La configuración del módulo, por empresa (doc 17 §5.7)
-- ------------------------------------------------------------
-- Tabla aparte y no columnas en companies: cada campo nuevo de companies
-- queda editable desde la Torre (mapa 15). El monto de alto valor y el
-- correo de avisos NO van aquí: ya existen en companies y no se duplican.
create table if not exists public.oportunidades_config (
  company_id bigint primary key references public.companies(id) on delete cascade,
  regiones text[] not null default '{}',
  comunas_cercanas text[] not null default '{}',
  -- Qué vende la empresa y qué no, en palabras. La IA lo lee junto al
  -- catálogo para decidir el semáforo.
  perfil text,
  actualizado_en timestamptz not null default now()
);

alter table public.oportunidades_config enable row level security;
revoke all on public.oportunidades_config from anon, authenticated;
grant select, insert, update, delete on public.oportunidades_config to service_role;

-- ------------------------------------------------------------
-- 6. Valle del Sol (empresa 1 en las dos bases, medido el 16-10): el
--    derecho y su configuración de partida
-- ------------------------------------------------------------
update public.companies
set modulos_propios = array_append(coalesce(modulos_propios, '{}'), 'oportunidades')
where id = 1
  and not ('oportunidades' = any (coalesce(modulos_propios, '{}')));

insert into public.oportunidades_config (company_id, regiones, comunas_cercanas, perfil)
values (
  1,
  array['Ñuble', 'Biobío'],
  -- La lista del bot de GitHub (config_compra_agil.py, COMUNAS_VIP).
  array['Quillón', 'Bulnes', 'Ránquil', 'Portezuelo', 'San Ignacio', 'El Carmen',
        'Pemuco', 'Coelemu', 'Ninhue', 'Treguaco', 'Florida', 'Yumbel', 'Cabrero'],
  'Valle del Sol es un complejo turístico, gastronómico y de eventos en Quillón, '
  || 'Región de Ñuble. Vende: arriendo del recinto y de sus salones; eventos, '
  || 'celebraciones, aniversarios y ceremonias; paseos (también los de fin de año); '
  || 'jornadas y capacitaciones hechas EN el complejo; cócteles con salón; '
  || 'almuerzos, cenas, banquetería y alimentación servidas DENTRO del complejo; '
  || 'alojamiento en cabañas. Puede producir el evento completo (montaje, '
  || 'amplificación y sonido se subcontratan cuando el evento es en el complejo). '
  || 'NO vende: catering, coffee break o alimentación a domicilio o en las '
  || 'dependencias del comprador; delivery; producción de eventos fuera del '
  || 'complejo; ni compra de insumos, artículos o productos sueltos.'
)
on conflict (company_id) do nothing;

-- ============================================================
-- REVERSA (borra el módulo entero; los datos de Mercado Público se pueden
-- volver a traer, la lectura de la IA se vuelve a pagar):
--   update public.companies
--     set modulos_propios = array_remove(modulos_propios, 'oportunidades')
--     where id = 1;
--   drop table if exists public.oportunidades_config;
--   drop table if exists public.oportunidades;
--   drop table if exists public.mp_radar_corridas;
--   drop table if exists public.mp_cambios;
--   drop table if exists public.mp_procesos;
-- ============================================================
