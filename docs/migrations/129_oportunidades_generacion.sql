-- ============================================================
-- 129 · OPORTUNIDADES: ANEXOS LLENOS CON IA, FIRMA Y PROPUESTA TÉCNICA
--       (17-10-2026)
-- ============================================================
-- Doc 17, sprint 3, paso 4. Felipe, 17-10: "1.- si 2.- si 3.- si, pero
-- primero dejemos todo listo y luego testeamos con estas licitaciones".
-- Lo decidido: el Word ORIGINAL del comprador, llenado por Claude con
-- ejecución de código; la firma en dos tiempos (primero se genera sin
-- firma, se revisa, y recién ahí "Firmar" pone la foto); se parte por la
-- propuesta técnica.
--
-- 1) oportunidad_generacion: cada vez que se aprieta "Generar anexos",
--    "Firmar" o "Crear propuesta técnica". La misma forma que el análisis
--    (125) y la validación (127), más `tipo` y `parametros` (lo que se
--    pidió: el monto de la oferta, los archivos elegidos). Corre por
--    detrás y queda guardado con lo que costó. Uno a la vez por
--    oportunidad y por tipo.
-- 2) oportunidad_adjuntos gana de dónde salió cada archivo:
--    - origen: 'subido' (lo subió una persona, lo de siempre), 'generado'
--      (lo hizo la IA, SIN firma) o 'firmado' (la versión con la foto de
--      la firma);
--    - viene_de: el archivo del que salió (el anexo del comprador, para
--      uno generado; el generado, para uno firmado);
--    - generacion_id: el trabajo que lo hizo.
--    Lo que ya existe queda 'subido'.
--
-- De cada empresa: company_id, RLS, REVOKE y GRANT (también la secuencia)
-- en la misma migración (lección 5). Idempotente. Va DESPUÉS de la 125,
-- la 126 y la 127. El número 128 lo tomó el comentario interno de las
-- cotizaciones (otra rama, ya aplicado en el laboratorio): por eso 129.
-- ============================================================

create table if not exists public.oportunidad_generacion (
  id bigint generated always as identity primary key,
  company_id bigint not null references public.companies(id) on delete cascade,
  oportunidad_id bigint not null
    references public.oportunidades(id) on delete cascade,
  tipo text not null check (tipo in ('anexos', 'firma', 'propuesta')),
  -- El análisis de bases que se usó (si había uno listo).
  analisis_id bigint references public.oportunidad_analisis(id)
    on delete set null,
  -- Lo que se pidió: monto de la oferta, archivos elegidos.
  parametros jsonb not null default '{}'::jsonb,
  estado text not null default 'procesando'
    check (estado in ('procesando', 'listo', 'error')),
  resultado jsonb,
  archivos jsonb not null default '[]'::jsonb,
  no_leidos jsonb not null default '[]'::jsonb,
  modelo text,
  tokens_entrada integer,
  tokens_salida integer,
  costo_usd numeric(10, 4),
  error text,
  pedido_por uuid references public.user_profiles(id) on delete set null,
  creado_en timestamptz not null default now(),
  terminado_en timestamptz
);

create index if not exists idx_oportunidad_generacion_oportunidad
  on public.oportunidad_generacion
  (company_id, oportunidad_id, tipo, creado_en desc);

create unique index if not exists oportunidad_generacion_una_en_curso
  on public.oportunidad_generacion (oportunidad_id, tipo)
  where estado = 'procesando';

alter table public.oportunidad_generacion enable row level security;
revoke all on public.oportunidad_generacion from anon, authenticated;
grant select, insert, update, delete on public.oportunidad_generacion
  to service_role;
grant usage, select on sequence public.oportunidad_generacion_id_seq
  to service_role;

alter table public.oportunidad_adjuntos
  add column if not exists origen text not null default 'subido';
alter table public.oportunidad_adjuntos
  drop constraint if exists oportunidad_adjuntos_origen_check;
alter table public.oportunidad_adjuntos
  add constraint oportunidad_adjuntos_origen_check
  check (origen in ('subido', 'generado', 'firmado'));
alter table public.oportunidad_adjuntos
  add column if not exists viene_de bigint
    references public.oportunidad_adjuntos(id) on delete set null;
alter table public.oportunidad_adjuntos
  add column if not exists generacion_id bigint
    references public.oportunidad_generacion(id) on delete set null;

-- ============================================================
-- REVERSA:
--   alter table public.oportunidad_adjuntos
--     drop column if exists generacion_id;
--   alter table public.oportunidad_adjuntos drop column if exists viene_de;
--   alter table public.oportunidad_adjuntos
--     drop constraint if exists oportunidad_adjuntos_origen_check;
--   alter table public.oportunidad_adjuntos drop column if exists origen;
--   drop table if exists public.oportunidad_generacion;
-- ============================================================
