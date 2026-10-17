-- ============================================================
-- 125 · OPORTUNIDADES: LA IA LEE LAS BASES (17-10-2026)
-- ============================================================
-- Doc 17, sprint 3, paso 1. Felipe, 17-10: "vamos". El botón "Analizar
-- bases" de la ficha manda las bases y anexos que subió la empresa
-- (migración 124) a Claude Opus 5.5. Opus devuelve el resumen, el checklist
-- de lo que piden (con la página), los criterios con su peso, las fechas,
-- las garantías y las alertas. Cada análisis queda guardado con lo que
-- costó. La pantalla muestra el último.
--
-- El análisis corre por detrás (Opus tarda uno a tres minutos): la fila
-- nace "procesando" y termina "listo" o "error". El índice único parcial
-- impide dos análisis de la misma oportunidad a la vez.
--
-- Es de cada empresa: lleva company_id y el motor filtra por él. Va con su
-- RLS, su REVOKE y su GRANT, también a la secuencia (lección 5 del cuaderno
-- de incidentes). Idempotente.
-- ============================================================

create table if not exists public.oportunidad_analisis (
  id bigint generated always as identity primary key,
  company_id bigint not null references public.companies(id) on delete cascade,
  oportunidad_id bigint not null
    references public.oportunidades(id) on delete cascade,
  estado text not null default 'procesando'
    check (estado in ('procesando', 'listo', 'error')),
  -- Lo que devolvió la IA (resumen, requisitos, criterios, fechas...).
  resultado jsonb,
  -- Qué archivos leyó y cuáles no pudo leer (ZIP, Excel...).
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

create index if not exists idx_oportunidad_analisis_oportunidad
  on public.oportunidad_analisis (company_id, oportunidad_id, creado_en desc);

-- Uno a la vez por oportunidad.
create unique index if not exists oportunidad_analisis_uno_en_curso
  on public.oportunidad_analisis (oportunidad_id)
  where estado = 'procesando';

alter table public.oportunidad_analisis enable row level security;
revoke all on public.oportunidad_analisis from anon, authenticated;
grant select, insert, update, delete on public.oportunidad_analisis
  to service_role;
grant usage, select on sequence public.oportunidad_analisis_id_seq
  to service_role;

-- ============================================================
-- REVERSA:
--   drop table if exists public.oportunidad_analisis;
-- ============================================================
