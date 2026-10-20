-- 155: LO QUE APRENDIMOS DE LAS COMISIONES (20-10-2026, decisión 60 del doc 17).
--
-- Felipe: "lo que necesitamos es entender los criterios, las flexibilidades
-- que tienen estos comités evaluadores y tener una base de criterio, para
-- intentar predecir quién va a ganar, nada más... las que vayamos
-- licitando, vamos a ver si ganamos o perdemos, ir revisando las actas de
-- adjudicación e ir entrenando la IA para que vaya afinando el ojo". Y:
-- "no porque en una licitación particular una comisión tome una
-- determinación va a marcar un precedente" de cómo se postula: al postular
-- mandan las bases. Esta base solo la lee la «Comparación de ofertas».
--
-- 1. oportunidades_aprendizajes: cada fila es una decisión de una comisión
--    ante una falta, una omisión o una duda (qué pasó y qué decidió), con
--    de qué licitación y unidad de compra salió y cómo se portó:
--    'estricta' (aplicó lo que dicen las bases), 'flexible' (dejó pasar
--    algo que pedían o no lo revisó) o 'contra_las_bases'. 'caso' son los
--    estudios de caso del 20-10 (el backfill); 'acta', las que la IA lee
--    de un acta con «Aprender del acta».
-- 2. El acta de evaluación se sube a la oportunidad: una sección más,
--    'acta'.
-- 3. «Aprender del acta» es un trabajo más de la IA: tipo 'aprendizaje'.
--
-- De cada empresa: company_id, RLS, REVOKE y GRANT (también la secuencia)
-- en la misma migración (lección 5). Idempotente. Primero en el
-- laboratorio (Cotizador); a producción, antes del motor.

create table if not exists public.oportunidades_aprendizajes (
  id bigint generated always as identity primary key,
  company_id bigint not null references public.companies(id) on delete cascade,
  -- La licitación de la que salió (código de Mercado Público).
  codigo text not null,
  -- La unidad de compra: el comienzo del código (4364 = DAEM de Quillón).
  unidad text,
  organismo text,
  -- Qué pasó (con el dato) y qué decidió la comisión.
  situacion text not null,
  decision text not null,
  tipo text not null check (tipo in ('estricta', 'flexible', 'contra_las_bases')),
  fuente text not null default 'caso' check (fuente in ('caso', 'acta')),
  oportunidad_id bigint references public.oportunidades(id) on delete set null,
  generacion_id bigint references public.oportunidad_generacion(id)
    on delete set null,
  creado_en timestamptz not null default now()
);

create index if not exists idx_oportunidades_aprendizajes_unidad
  on public.oportunidades_aprendizajes (company_id, unidad, creado_en desc);

-- Una misma situación de una misma licitación, una sola vez (el backfill
-- se puede correr dos veces sin duplicar).
create unique index if not exists oportunidades_aprendizajes_una_vez
  on public.oportunidades_aprendizajes (company_id, codigo, md5(situacion));

alter table public.oportunidades_aprendizajes enable row level security;
revoke all on public.oportunidades_aprendizajes from anon, authenticated;
grant select, insert, update, delete on public.oportunidades_aprendizajes
  to service_role;
grant usage, select on sequence public.oportunidades_aprendizajes_id_seq
  to service_role;

alter table public.oportunidad_adjuntos
  drop constraint if exists oportunidad_adjuntos_seccion_check;
alter table public.oportunidad_adjuntos
  add constraint oportunidad_adjuntos_seccion_check
  check (seccion = any (array['bases'::text, 'postulacion'::text, 'competencia'::text, 'acta'::text]));

alter table public.oportunidad_generacion
  drop constraint if exists oportunidad_generacion_tipo_check;
alter table public.oportunidad_generacion
  add constraint oportunidad_generacion_tipo_check
  check (tipo = any (array['anexos'::text, 'firma'::text, 'propuesta'::text, 'resumen'::text, 'oferta'::text, 'comparacion'::text, 'aprendizaje'::text]));
