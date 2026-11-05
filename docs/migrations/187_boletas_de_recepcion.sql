-- ============================================================
-- 187 · LAS BOLETAS DE RECEPCIÓN (doc 19 §9.4 y §9.16, paso 3)
--
-- Felipe, 04-11: *"la recepcionista debería poder ver el módulo de
-- facturación para poder hacer la emisión de boletas (…) de las cabañas
-- (…) que yo le pueda colocar como el total y que ella coloque la
-- facturación por cabaña"*. Y al decidir la D3 (04-11, en la noche):
-- *"tarifario aparte puede ser cabañas, ticket diario, otros"*; la cabaña
-- la escribe recepción.
--
--  1. `tarifario_de_boletas`: lo que se boletea suelto (cabañas, ticket
--     diario, tinaja…), con su precio CON IVA. Aparte del catálogo del
--     cotizador. Lo escribe el administrador; recepción solo elige.
--  2. `cobros_por_boletear`: el total que deja el administrador, desde
--     el evento (el alojamiento de una delegación) o suelto.
--  3. `cobros_por_boletear_lineas`: cómo lo reparte recepción, una línea
--     por cabaña (escrita por ella), con el correo del huésped si lo da.
--     Al emitir, la línea apunta a su boleta en `documentos_tributarios`
--     (migración 184).
--  4. `cobros_por_boletear_cambios`: E3, *"debe ser editable"* y queda
--     anotado quién cambió qué. Solo se agrega: no se edita ni se borra.
--
-- Una línea con boleta no se edita ni se quita, y un cobro con boletas
-- no se borra: lo cuida el motor (`facturacion/boletas/`), y la llave a
-- `documentos_tributarios` no tiene cascada (L6). Cerradas a la llave
-- pública como la 184: solo el motor, que filtra por company_id.
-- Idempotente. Va DESPUÉS de la 184 (usa `documentos_tributarios`), en el
-- laboratorio primero y en producción antes del motor que la usa. Número
-- reservado el 04-11 con la sesión «Eventia (Full)».
-- ============================================================

-- 1 · El tarifario --------------------------------------------------------

create table if not exists public.tarifario_de_boletas (
  id bigint generated always as identity primary key,
  company_id bigint not null references public.companies(id) on delete cascade,
  -- Lo que sale en la boleta: «Cabaña 4 personas temporada alta»,
  -- «Ticket diario»…
  nombre text not null check (char_length(nombre) between 1 and 60),
  -- CON IVA, en pesos: la boleta va con IVA incluido (IndMntNeto 0).
  precio bigint not null check (precio > 0),
  -- Por noche, por persona, por día…: para la glosa y la cantidad.
  unidad text not null default 'unidad'
    check (char_length(unidad) between 1 and 20),
  activo boolean not null default true,
  orden integer not null default 0,
  creado_por uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_tarifario_de_boletas_empresa
  on public.tarifario_de_boletas (company_id, orden, id);

-- 2 · Los cobros por boletear ---------------------------------------------

create table if not exists public.cobros_por_boletear (
  id bigint generated always as identity primary key,
  company_id bigint not null references public.companies(id) on delete cascade,
  -- El evento, si viene de uno. Un evento con boletas no se borra: la
  -- guardia de borrado cuenta `documentos_tributarios`.
  quotation_id uuid references public.quotations(id) on delete cascade,
  -- «Delegación Vilcún · alojamiento 12 al 15-11». Cabe con la cabaña en
  -- la glosa de 80 de la boleta.
  descripcion text not null check (char_length(descripcion) between 1 and 55),
  -- CON IVA: lo repartido por cabaña tiene que sumar esto para emitir.
  total bigint not null check (total > 0),
  -- Id de SESIÓN, sin llave, y el nombre congelado: «Total puesto por
  -- Felipe» (maqueta del 04-11).
  creado_por uuid,
  creado_por_nombre text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_cobros_por_boletear_empresa
  on public.cobros_por_boletear (company_id, created_at desc);
create index if not exists idx_cobros_por_boletear_cotizacion
  on public.cobros_por_boletear (quotation_id)
  where quotation_id is not null;

-- 3 · El reparto por cabaña -----------------------------------------------

create table if not exists public.cobros_por_boletear_lineas (
  id bigint generated always as identity primary key,
  company_id bigint not null references public.companies(id) on delete cascade,
  cobro_id bigint not null
    references public.cobros_por_boletear(id) on delete cascade,
  -- La escribe recepción: «Cabaña 4».
  cabana text not null check (char_length(cabana) between 1 and 22),
  -- CON IVA.
  monto bigint not null check (monto > 0),
  -- El del huésped, si lo da: facturacion.cl le manda la boleta (L11).
  correo text check (correo is null or char_length(correo) <= 200),
  -- La boleta, al emitirla. Sin cascada: un documento tributario no se
  -- borra (L6).
  documento_id bigint references public.documentos_tributarios(id),
  creado_por uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_cobros_por_boletear_lineas_cobro
  on public.cobros_por_boletear_lineas (cobro_id, id);
create unique index if not exists cobros_por_boletear_lineas_documento_uniq
  on public.cobros_por_boletear_lineas (documento_id)
  where documento_id is not null;

-- 4 · Quién cambió qué (E3) ----------------------------------------------

create table if not exists public.cobros_por_boletear_cambios (
  id bigint generated always as identity primary key,
  company_id bigint not null references public.companies(id) on delete cascade,
  cobro_id bigint not null
    references public.cobros_por_boletear(id) on delete cascade,
  -- Sin llave: si la línea se quita, su cambio queda.
  linea_id bigint,
  -- 'total', 'descripcion', 'agrega', 'cabana', 'monto', 'correo',
  -- 'quita' o 'emite'.
  que text not null check (
    que in ('total', 'descripcion', 'agrega', 'cabana', 'monto', 'correo', 'quita', 'emite')
  ),
  antes text,
  despues text,
  -- Id de SESIÓN, sin llave, y el nombre congelado al escribir.
  usuario uuid,
  nombre text,
  created_at timestamptz not null default now()
);

create index if not exists idx_cobros_por_boletear_cambios_cobro
  on public.cobros_por_boletear_cambios (cobro_id, created_at);

-- Permisos ----------------------------------------------------------------

alter table public.tarifario_de_boletas enable row level security;
alter table public.cobros_por_boletear enable row level security;
alter table public.cobros_por_boletear_lineas enable row level security;
alter table public.cobros_por_boletear_cambios enable row level security;

revoke all on public.tarifario_de_boletas from anon, authenticated;
revoke all on public.cobros_por_boletear from anon, authenticated;
revoke all on public.cobros_por_boletear_lineas from anon, authenticated;
revoke all on public.cobros_por_boletear_cambios from anon, authenticated;

grant select, insert, update, delete on public.tarifario_de_boletas
  to service_role;
grant select, insert, update, delete on public.cobros_por_boletear
  to service_role;
grant select, insert, update, delete on public.cobros_por_boletear_lineas
  to service_role;
-- Lo que se anotó no se reescribe.
grant select, insert on public.cobros_por_boletear_cambios to service_role;

grant usage, select on sequence public.tarifario_de_boletas_id_seq
  to service_role;
grant usage, select on sequence public.cobros_por_boletear_id_seq
  to service_role;
grant usage, select on sequence public.cobros_por_boletear_lineas_id_seq
  to service_role;
grant usage, select on sequence public.cobros_por_boletear_cambios_id_seq
  to service_role;

-- ============================================================
-- Reversa (solo si no hay boletas emitidas desde un cobro):
--   drop table if exists public.cobros_por_boletear_cambios;
--   drop table if exists public.cobros_por_boletear_lineas;
--   drop table if exists public.cobros_por_boletear;
--   drop table if exists public.tarifario_de_boletas;
-- ============================================================
