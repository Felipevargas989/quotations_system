-- 159: PREGÚNTALE A LA IA SOBRE ESTAS BASES (22-10-2026, decisión 67 del doc 17).
--
-- Felipe: "no tengo cómo preguntar ni interactuar... la idea es poder precisar
-- cosas y que no vuelva a releer todo". Cada fila es una pregunta de una
-- persona sobre las bases de una oportunidad y la respuesta de la IA (Opus
-- 5.5), con sus citas (documento y página). El hilo queda en la oportunidad
-- y lo ve todo el equipo. Los documentos van en caché de contexto de la API
-- (5 minutos): la pregunta siguiente paga solo lo nuevo.

create table if not exists public.oportunidad_preguntas (
  id bigint generated always as identity primary key,
  company_id bigint not null references public.companies(id) on delete cascade,
  oportunidad_id bigint not null references public.oportunidades(id) on delete cascade,
  pregunta text not null,
  estado text not null default 'procesando'
    check (estado in ('procesando', 'listo', 'error')),
  respuesta text,
  -- [{documento, pagina, texto}], hasta 4.
  citas jsonb not null default '[]'::jsonb,
  -- alta: lo dicen los documentos; media: una deducción; baja: no está.
  seguridad text check (seguridad in ('alta', 'media', 'baja')),
  error text,
  modelo text,
  tokens_entrada integer,
  tokens_salida integer,
  tokens_cache_escrita integer,
  tokens_cache_leida integer,
  costo_usd numeric(10, 4),
  preguntado_por uuid references public.user_profiles(id) on delete set null,
  creado_en timestamptz not null default now(),
  terminado_en timestamptz
);

create index if not exists idx_oportunidad_preguntas_hilo
  on public.oportunidad_preguntas (company_id, oportunidad_id, creado_en);

-- Una pregunta a la vez por oportunidad (lo decide la base, no la memoria).
create unique index if not exists oportunidad_preguntas_una_en_curso
  on public.oportunidad_preguntas (oportunidad_id)
  where estado = 'procesando';

alter table public.oportunidad_preguntas enable row level security;
revoke all on public.oportunidad_preguntas from anon, authenticated;
grant select, insert, update, delete on public.oportunidad_preguntas
  to service_role;
