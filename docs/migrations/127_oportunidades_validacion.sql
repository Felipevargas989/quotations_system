-- ============================================================
-- 127 · OPORTUNIDADES: MI POSTULACIÓN Y VALIDAR DOCUMENTOS (17-10-2026)
-- ============================================================
-- Doc 17, sprint 3, paso 3. Felipe, 17-10: "y lo más importante validar
-- documentos".
--
-- 1) Los archivos de una oportunidad ganan `seccion`: 'bases' (lo que
--    publicó el comprador en Mercado Público, como hasta ahora) o
--    'postulacion' (lo que la empresa va a presentar: anexos firmados,
--    propuesta, oferta). Lo que ya existe queda en 'bases'.
-- 2) oportunidad_validacion: cada vez que se aprieta "Validar documentos",
--    Claude Opus 5.5 cruza el checklist de las bases (el último análisis,
--    migración 125) con los documentos de la postulación, la carpeta de la
--    empresa y sus datos (migración 126), y dice requisito por requisito:
--    cumple, falta, vencido o revisar. Corre por detrás, como el análisis,
--    y queda guardado con lo que costó. Uno a la vez por oportunidad.
--
-- De cada empresa: company_id, RLS, REVOKE y GRANT (también la secuencia)
-- en la misma migración (lección 5). Idempotente. Va DESPUÉS de la 125 y
-- la 126.
-- ============================================================

alter table public.oportunidad_adjuntos
  add column if not exists seccion text not null default 'bases';
alter table public.oportunidad_adjuntos
  drop constraint if exists oportunidad_adjuntos_seccion_check;
alter table public.oportunidad_adjuntos
  add constraint oportunidad_adjuntos_seccion_check
  check (seccion in ('bases', 'postulacion'));

create table if not exists public.oportunidad_validacion (
  id bigint generated always as identity primary key,
  company_id bigint not null references public.companies(id) on delete cascade,
  oportunidad_id bigint not null
    references public.oportunidades(id) on delete cascade,
  -- El análisis de bases cuyo checklist se validó.
  analisis_id bigint references public.oportunidad_analisis(id)
    on delete set null,
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

create index if not exists idx_oportunidad_validacion_oportunidad
  on public.oportunidad_validacion (company_id, oportunidad_id, creado_en desc);

create unique index if not exists oportunidad_validacion_una_en_curso
  on public.oportunidad_validacion (oportunidad_id)
  where estado = 'procesando';

alter table public.oportunidad_validacion enable row level security;
revoke all on public.oportunidad_validacion from anon, authenticated;
grant select, insert, update, delete on public.oportunidad_validacion
  to service_role;
grant usage, select on sequence public.oportunidad_validacion_id_seq
  to service_role;

-- ============================================================
-- REVERSA:
--   drop table if exists public.oportunidad_validacion;
--   alter table public.oportunidad_adjuntos
--     drop constraint if exists oportunidad_adjuntos_seccion_check;
--   alter table public.oportunidad_adjuntos drop column if exists seccion;
-- ============================================================
