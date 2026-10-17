-- ============================================================
-- 126 · OPORTUNIDADES: LA EMPRESA COMO OFERENTE (17-10-2026)
-- ============================================================
-- Doc 17, sprint 3, paso 2 (§5.5). Felipe, 17-10: "el rellenado de
-- documentos debe tener primero una forma de meter la información de la
-- empresa, la firma (una foto de la firma)".
--
-- 1) oportunidades_oferente: los datos con que la empresa se presenta a
--    una licitación (razón social, RUT, giro, domicilio, representante
--    legal), lo que la IA usa para escribir (experiencia destacada,
--    instalaciones) y la foto de la firma (su ruta en el balde privado).
--    Lo que ya vive en Configuración de empresa (nombre, datos bancarios,
--    logo) NO se repite aquí: el módulo lo lee de `companies`.
-- 2) oportunidades_documentos: la carpeta de documentos de la empresa
--    (patente, inicio de actividades, programa de integridad, F30,
--    certificado de vigencia, resolución sanitaria...) con su fecha de
--    vencimiento; la pantalla avisa lo que vence (sin correo: decisión 17).
--    Los archivos, en el balde privado: c<empresa>/oferente/...
--
-- De cada empresa: company_id, RLS, REVOKE y GRANT (también la secuencia)
-- en la misma migración (lección 5). Idempotente. Sin datos sembrados:
-- los llena la empresa en la pestaña "Mi empresa".
-- ============================================================

create table if not exists public.oportunidades_oferente (
  company_id bigint primary key
    references public.companies(id) on delete cascade,
  razon_social text,
  rut text,
  giro text,
  direccion text,
  comuna text,
  region text,
  telefono text,
  correo text,
  representante_nombre text,
  representante_rut text,
  representante_cargo text,
  -- Lo que lee la IA para escribir propuestas y anexos.
  experiencia text,
  instalaciones text,
  -- La foto de la firma, en el balde privado (c<empresa>/oferente/...).
  firma_ruta text,
  firma_subida_en timestamptz,
  actualizado_en timestamptz not null default now()
);

alter table public.oportunidades_oferente enable row level security;
revoke all on public.oportunidades_oferente from anon, authenticated;
grant select, insert, update, delete on public.oportunidades_oferente
  to service_role;

create table if not exists public.oportunidades_documentos (
  id bigint generated always as identity primary key,
  company_id bigint not null references public.companies(id) on delete cascade,
  -- patente | inicio_actividades | programa_integridad | f30 | vigencia |
  -- resolucion_sanitaria | dj_trabajadores | otro
  tipo text not null,
  -- El nombre con que se subió, para mostrarlo.
  nombre text not null,
  ruta text not null unique,
  tipo_archivo text not null,
  bytes bigint not null check (bytes > 0),
  -- null = no vence.
  vence date,
  subido_por uuid references public.user_profiles(id) on delete set null,
  creado_en timestamptz not null default now()
);

create index if not exists idx_oportunidades_documentos_empresa
  on public.oportunidades_documentos (company_id, tipo);

alter table public.oportunidades_documentos enable row level security;
revoke all on public.oportunidades_documentos from anon, authenticated;
grant select, insert, update, delete on public.oportunidades_documentos
  to service_role;
grant usage, select on sequence public.oportunidades_documentos_id_seq
  to service_role;

-- ============================================================
-- REVERSA (los archivos del balde no se borran solos; quedan en
-- c<empresa>/oferente/):
--   drop table if exists public.oportunidades_documentos;
--   drop table if exists public.oportunidades_oferente;
-- ============================================================
