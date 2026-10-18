-- ============================================================
-- 143 · CHOQUES DE FECHA: LAS REVISIONES (18-10-2026)
-- ============================================================
-- Felipe, 18-10: "cuando una cotización se cierra, debería dejar una alerta
-- a revisar si la otra cotización se puede hacer o no (...) una alerta en
-- rojo y yo pueda pinchar: no, hay que hacer una gestión; o sí se puede,
-- puede continuar con esa fecha". Y sin atajo: "va a depender de qué
-- espacios se utilicen, qué horarios tengan (...) inclusive si fuera
-- cabañas, puede coincidir con otro evento de cabañas".
--
-- El choque NO se guarda: se calcula (una cotización viva cuyas fechas se
-- topan con las de una aceptada). Esta tabla guarda solo lo que la persona
-- decidió para cada par («puede seguir»; el CHECK admite también «hay que
-- gestionar», que se probó y se quitó de la pantalla el 18-10), con las
-- fechas de las dos en ese momento. Si cualquiera cambia de fecha, la
-- decisión deja de valer y el aviso vuelve (la decisión fue sobre "esa
-- fecha").
--
-- Es de cada empresa: lleva company_id y el motor filtra por él. RLS,
-- REVOKE, GRANT y la secuencia en la misma migración (lección 5). El
-- `decidido_por` es el id de la SESIÓN, sin llave (lección de la 142: no es
-- user_profiles.id). Idempotente. Número reservado con la sesión de
-- Oportunidades el 18-10.
-- ============================================================

create table if not exists public.choques_de_fecha (
  id bigint generated always as identity primary key,
  company_id bigint not null references public.companies(id) on delete cascade,
  -- La cotización viva que choca.
  quotation_id uuid not null references public.quotations(id) on delete cascade,
  -- La aceptada con la que choca.
  aceptada_id uuid not null references public.quotations(id) on delete cascade,
  decision text not null check (decision in ('puede_seguir', 'gestionar')),
  -- Las fechas de las dos al decidir ("AAAA-MM-DD..AAAA-MM-DD").
  fechas_viva text not null,
  fechas_aceptada text not null,
  -- La línea que dejó en la bitácora.
  followup_id bigint references public.quotation_followups(id) on delete set null,
  decidido_por uuid,
  decidido_at timestamptz not null default now(),
  unique (quotation_id, aceptada_id)
);

create index if not exists idx_choques_de_fecha_empresa
  on public.choques_de_fecha (company_id);

alter table public.choques_de_fecha enable row level security;
revoke all on public.choques_de_fecha from anon, authenticated;
grant select, insert, update, delete on public.choques_de_fecha to service_role;
grant usage, select on sequence public.choques_de_fecha_id_seq to service_role;

-- ============================================================
-- REVERSA (los avisos vuelven todos; la bitácora no se toca):
--   drop table if exists public.choques_de_fecha;
-- ============================================================
