-- ============================================================
-- 124 · OPORTUNIDADES: LAS BASES Y ANEXOS QUE SUBE LA EMPRESA (17-10-2026)
-- ============================================================
-- Doc 17 §12 punto 8, opción (d). Felipe, 17-10: "ok dale con el botón y
-- arrastro". Mercado Público protege su lista de adjuntos con un control
-- antirrobots que esta casa no esquiva: los archivos los baja una persona
-- desde su navegador y los arrastra a la ficha de la oportunidad.
--
-- El archivo vive en el balde privado de la empresa (`payment-receipts`, el
-- mismo de los comprobantes y documentos de evento: misión storage,
-- migración 42), con la ruta c<empresa>/oportunidades/<id>/... Esta tabla
-- guarda de qué oportunidad es, su nombre original, quién lo subió y
-- cuándo. Ese registro es la base del sprint 3, que lee las bases con IA.
--
-- Es de cada empresa: lleva company_id y el motor filtra por él. Va con su
-- RLS, su REVOKE y su GRANT (también a la secuencia) en la misma migración
-- (lección 5 del cuaderno de incidentes). Idempotente.
-- ============================================================

create table if not exists public.oportunidad_adjuntos (
  id bigint generated always as identity primary key,
  company_id bigint not null references public.companies(id) on delete cascade,
  oportunidad_id bigint not null
    references public.oportunidades(id) on delete cascade,
  -- El nombre con el que se subió, para mostrarlo (con tildes y espacios).
  nombre text not null,
  -- Dónde quedó en el balde privado.
  ruta text not null unique,
  tipo text not null,
  bytes bigint not null check (bytes > 0),
  subido_por uuid references public.user_profiles(id) on delete set null,
  creado_en timestamptz not null default now()
);

create index if not exists idx_oportunidad_adjuntos_oportunidad
  on public.oportunidad_adjuntos (company_id, oportunidad_id);

alter table public.oportunidad_adjuntos enable row level security;
revoke all on public.oportunidad_adjuntos from anon, authenticated;
grant select, insert, update, delete on public.oportunidad_adjuntos
  to service_role;
grant usage, select on sequence public.oportunidad_adjuntos_id_seq
  to service_role;

-- ============================================================
-- REVERSA (los archivos del balde no se borran solos; quedan en
-- c<empresa>/oportunidades/):
--   drop table if exists public.oportunidad_adjuntos;
-- ============================================================
