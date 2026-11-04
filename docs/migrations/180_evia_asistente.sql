-- ============================================================
-- 180 · EVIA, LA IA DE EVENTIA: EL DERECHO Y LA CUENTA DEL MES (03-11-2026)
-- ============================================================
-- Doc 20. Felipe, 03-11: "Quiero agregar una ventanilla como de soporte de
-- chat en Eventia, que esté conectado a un agente, ojalá Opus". Evia
-- consulta (fase 1) y después propone cambios que la persona aprueba.
--
-- Dos cosas:
--  1. El derecho `asistente` para Valle del Sol. Es un MÓDULO PROPIO,
--     como cotizar_con_ia (130) y seguimiento_con_ia (140): no lo da
--     ningún plan, lo da la columna `modulos_propios`. La cuenta de
--     Anthropic es de Valle del Sol.
--  2. La tabla `asistente_uso`: una fila por cada respuesta de Evia, con
--     sus tokens y lo que costó. De ahí sale el tope mensual (US$ 100,
--     variable TOPE_ASISTENTE_USD en Railway; Felipe, 03-11: "mmm 100 USD
--     mensuales?"). No guarda lo que se preguntó: eso es la pregunta
--     abierta 3 del doc 20.
--
-- Es de cada empresa: lleva company_id y el motor filtra por él. Va con su
-- RLS, su REVOKE y su GRANT (también a la secuencia) en la misma migración
-- (lección 5 del cuaderno de incidentes). Idempotente. Se aplica primero
-- en el laboratorio y después en producción, ANTES de publicar el motor
-- que la usa. Número reservado para Evia el 03-11 (las 177 a 179 quedan
-- para otras sesiones).
-- ============================================================

update public.companies
   set modulos_propios = array_append(modulos_propios, 'asistente')
 where id = 1
   and not ('asistente' = any (modulos_propios));

create table if not exists public.asistente_uso (
  id bigint generated always as identity primary key,
  company_id bigint not null references public.companies(id) on delete cascade,
  -- El id de la SESIÓN (`user.id`, el de auth), sin llave: en
  -- user_profiles ese id es `user_id`, no `id` (lección de la 142, que le
  -- quitó la llave a seguimientos_con_ia.creado_por por lo mismo).
  usuario_id uuid,
  -- El mes en Chile (AAAA-MM): el tope se cuenta por mes calendario.
  mes text not null check (mes ~ '^\d{4}-\d{2}$'),
  modelo text not null,
  tokens_entrada integer not null default 0,
  tokens_salida integer not null default 0,
  tokens_cache_escrita integer not null default 0,
  tokens_cache_leida integer not null default 0,
  costo_usd numeric(10, 4) not null default 0,
  segundos integer,
  -- Las herramientas que usó (buscar_cotizaciones, calendario…), para
  -- saber qué se le pregunta sin guardar la pregunta.
  herramientas text[] not null default '{}',
  -- Dónde estaba la persona (la ruta de la pantalla).
  ruta text,
  -- Si la respuesta falló a medio camino (la cuenta igual se cobra).
  fallo text,
  created_at timestamptz not null default now()
);

create index if not exists idx_asistente_uso_mes
  on public.asistente_uso (company_id, mes);

alter table public.asistente_uso enable row level security;
revoke all on public.asistente_uso from anon, authenticated;
grant select, insert, update, delete on public.asistente_uso
  to service_role;
grant usage, select on sequence public.asistente_uso_id_seq
  to service_role;

-- ============================================================
-- REVERSA (Valle del Sol deja de ver a Evia; la cuenta se pierde):
--   update public.companies
--      set modulos_propios = array_remove(modulos_propios, 'asistente')
--    where id = 1;
--   drop table if exists public.asistente_uso;
-- ============================================================
