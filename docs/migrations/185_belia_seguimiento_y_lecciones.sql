-- 185 · BelIA: el seguimiento desde el chat y lo que aprende de las
-- correcciones (doc 20 §17, mejoras 4 y 5).
--
-- Felipe, 04-11-2026: "vamos con todas las mejoras que propusiste".
-- Número reservado ese día con la sesión de Facturación (que tiene la 184).
--
-- 1) Tres tipos nuevos de propuesta, que la persona aprueba con su tarjeta
--    como las demás:
--    - 'seguimiento': «Prepárame el seguimiento de la 600». Al aprobarla
--      corre lo mismo que «✉ Generar seguimiento»: el borrador en el hilo
--      del cliente, nunca se envía.
--    - 'leccion': anotar lo que BelIA aprendió de una corrección.
--    - 'leccion_estado': aprobar, olvidar o descartar una lección (solo
--      administración).
alter table public.asistente_propuestas
  drop constraint if exists asistente_propuestas_tipo_check;
alter table public.asistente_propuestas
  add constraint asistente_propuestas_tipo_check
  check (tipo in ('servicios', 'nota', 'cotizacion_nueva', 'seguimiento',
                  'leccion', 'leccion_estado'));

-- 2) Las lecciones de la empresa. La aprueba administración: la de otro
--    cargo queda pendiente hasta que alguien de administración la vea.
--    Aprobada, la leen desde la pregunta siguiente todas las IA de la
--    empresa, al final del cerebro común (`api-rest/src/cerebro/`), según
--    para qué tarea vale. Nada se borra: «Olvidar» la deja 'olvidada'.
create table if not exists public.cerebro_lecciones (
  id uuid primary key default gen_random_uuid(),
  company_id bigint not null references public.companies(id) on delete cascade,
  -- Para qué vale: 'todas', 'armar' (las cotizaciones), 'escribir' (los
  -- correos) o 'conversar' (BelIA en el chat).
  tarea text not null
    check (tarea in ('todas', 'armar', 'escribir', 'conversar')),
  -- La lección, como la leen las IA.
  texto text not null check (char_length(texto) between 10 and 500),
  -- De dónde salió (la corrección de la persona), para quien la revise.
  motivo text check (motivo is null or char_length(motivo) <= 500),
  -- El id de la SESIÓN de quien la propuso (`user.id`), sin llave, como en
  -- la 181 y la 182.
  propuesta_por uuid,
  propuesta_por_nombre text,
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'aprobada', 'descartada', 'olvidada')),
  decidida_por uuid,
  decidida_por_nombre text,
  decidida_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_cerebro_lecciones_empresa
  on public.cerebro_lecciones (company_id, estado, created_at);
-- Igual que la 180 a la 182: cerrada a la llave pública, solo el motor.
alter table public.cerebro_lecciones enable row level security;
revoke all on public.cerebro_lecciones from anon, authenticated;
grant select, insert, update on public.cerebro_lecciones to service_role;
-- Nada se borra: en producción la tabla nació con todos los permisos para
-- service_role (los de siempre de Supabase), y se le quitan los de borrar.
revoke delete, truncate on public.cerebro_lecciones from service_role;
