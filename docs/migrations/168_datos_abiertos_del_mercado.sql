-- ============================================================
-- 168 · EL MERCADO DE TODO CHILE, DESDE LOS DATOS ABIERTOS (28-10-2026)
-- ============================================================
-- Decisión 101 del doc 17. Felipe: "traigamos todas las licitaciones de
-- Chile", "licitaciones y compra agiles... :D". ChileCompra publica gratis
-- un archivo por mes con todas las licitaciones del país (con cada oferta)
-- y otro con todas las cotizaciones de compra ágil. Un cargador del motor
-- los baja de noche, mes a mes, 3 años hacia atrás, y los resume aquí.
--
-- Son datos PÚBLICOS, iguales para todas las empresas: sin company_id
-- (doc 17, regla 4). Lo que se guarda:
--  - Licitaciones: todas, con cada oferta, quién ganó y por cuánto.
--  - Compras ágiles de eventos, banquetería, alimentación y alojamiento:
--    cada solicitud con todas sus cotizaciones. Del resto, solo el total
--    por unidad de compra y por mes (3 años completos serían más de 2 GB).
--  - mercado_cargas: qué mes de qué archivo ya está, para no repetirlo.
--
-- Ninguna entra al respaldo diario (FUERA_DEL_RESPALDO): se vuelven a bajar.
-- Regla de la casa: GRANT y RLS en la misma migración; solo el motor
-- (service_role) las toca. Se aplica antes del deploy del motor que la usa,
-- primero en el laboratorio y después en producción. Idempotente.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Qué mes de qué archivo ya se cargó
-- ------------------------------------------------------------
create table if not exists public.mercado_cargas (
  fuente text not null check (fuente in ('licitaciones', 'compra_agil')),
  mes date not null,
  estado text not null check (estado in ('cargando', 'lista', 'error')),
  -- La fecha del archivo en ChileCompra: si cambia, se vuelve a cargar.
  archivo_modificado text,
  bytes bigint,
  filas integer,
  procesos integer,
  error text,
  empezo_en timestamptz,
  terminada_en timestamptz,
  primary key (fuente, mes)
);

alter table public.mercado_cargas enable row level security;
revoke all on public.mercado_cargas from anon, authenticated;
grant select, insert, update, delete on public.mercado_cargas to service_role;

-- ------------------------------------------------------------
-- 2. Las licitaciones de todo Chile, una fila por licitación
-- ------------------------------------------------------------
create table if not exists public.mercado_licitaciones (
  codigo text primary key,
  -- El mes del archivo de donde salió (el de su publicación).
  mes date not null,
  nombre text,
  tipo text,
  estado text,
  sector text,
  organismo_codigo text,
  organismo text,
  unidad_codigo text,
  unidad text,
  rut_unidad text,
  comuna text,
  region text,
  fecha_publicacion date,
  fecha_cierre date,
  fecha_adjudicacion date,
  moneda text,
  monto_estimado numeric,
  -- Suma de las líneas adjudicadas en pesos (null si no hay o no son CLP).
  monto_adjudicado numeric,
  oferentes integer,
  lineas integer,
  rubros text[] not null default '{}',
  -- Eventos, banquetería, alimentación o alojamiento.
  del_rubro boolean not null default false
);

create index if not exists idx_mercado_licitaciones_mes
  on public.mercado_licitaciones (mes);
create index if not exists idx_mercado_licitaciones_region_mes
  on public.mercado_licitaciones (region, mes);
create index if not exists idx_mercado_licitaciones_organismo
  on public.mercado_licitaciones (organismo_codigo);
create index if not exists idx_mercado_licitaciones_del_rubro
  on public.mercado_licitaciones (mes) where del_rubro;

alter table public.mercado_licitaciones enable row level security;
revoke all on public.mercado_licitaciones from anon, authenticated;
grant select, insert, update, delete on public.mercado_licitaciones to service_role;

-- ------------------------------------------------------------
-- 3. Cada oferta de cada licitación (una fila por proveedor)
-- ------------------------------------------------------------
create table if not exists public.mercado_ofertas (
  codigo text not null,
  rut text not null,
  proveedor text,
  moneda text,
  monto_ofertado numeric,
  monto_adjudicado numeric,
  lineas_ofertadas integer,
  lineas_ganadas integer,
  gano boolean not null default false,
  primary key (codigo, rut)
);

create index if not exists idx_mercado_ofertas_rut
  on public.mercado_ofertas (rut);

alter table public.mercado_ofertas enable row level security;
revoke all on public.mercado_ofertas from anon, authenticated;
grant select, insert, update, delete on public.mercado_ofertas to service_role;

-- ------------------------------------------------------------
-- 4. Las compras ágiles del rubro, una fila por solicitud
-- ------------------------------------------------------------
create table if not exists public.mercado_compras_agiles (
  codigo text primary key,
  mes date not null,
  nombre text,
  organismo text,
  unidad_codigo text,
  unidad text,
  rut_unidad text,
  region text,
  fecha_publicacion date,
  fecha_cierre date,
  moneda text,
  monto_disponible numeric,
  estado text,
  cotizaciones integer,
  rut_elegido text,
  proveedor_elegido text,
  monto_elegido numeric,
  criterio text,
  productos text
);

create index if not exists idx_mercado_compras_agiles_mes
  on public.mercado_compras_agiles (mes);
create index if not exists idx_mercado_compras_agiles_region_mes
  on public.mercado_compras_agiles (region, mes);
create index if not exists idx_mercado_compras_agiles_unidad
  on public.mercado_compras_agiles (unidad_codigo);
create index if not exists idx_mercado_compras_agiles_elegido
  on public.mercado_compras_agiles (rut_elegido);

alter table public.mercado_compras_agiles enable row level security;
revoke all on public.mercado_compras_agiles from anon, authenticated;
grant select, insert, update, delete on public.mercado_compras_agiles to service_role;

-- ------------------------------------------------------------
-- 5. Cada cotización de esas compras ágiles (una fila por proveedor)
-- ------------------------------------------------------------
create table if not exists public.mercado_cotizaciones (
  codigo text not null,
  rut text not null,
  proveedor text,
  tamano text,
  moneda text,
  monto numeric,
  elegida boolean not null default false,
  primary key (codigo, rut)
);

create index if not exists idx_mercado_cotizaciones_rut
  on public.mercado_cotizaciones (rut);

alter table public.mercado_cotizaciones enable row level security;
revoke all on public.mercado_cotizaciones from anon, authenticated;
grant select, insert, update, delete on public.mercado_cotizaciones to service_role;

-- ------------------------------------------------------------
-- 6. Todas las compras ágiles, en totales por unidad de compra y mes
-- ------------------------------------------------------------
create table if not exists public.mercado_compras_agiles_totales (
  mes date not null,
  unidad_codigo text not null,
  rut_unidad text,
  unidad text,
  organismo text,
  region text,
  solicitudes integer not null default 0,
  con_elegido integer not null default 0,
  monto_elegido numeric not null default 0,
  solicitudes_rubro integer not null default 0,
  monto_rubro numeric not null default 0,
  primary key (mes, unidad_codigo)
);

create index if not exists idx_mercado_compras_agiles_totales_region
  on public.mercado_compras_agiles_totales (region, mes);

alter table public.mercado_compras_agiles_totales enable row level security;
revoke all on public.mercado_compras_agiles_totales from anon, authenticated;
grant select, insert, update, delete on public.mercado_compras_agiles_totales to service_role;
