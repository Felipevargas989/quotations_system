-- ============================================================
-- 181 · BELIA, FASE 2: LAS PROPUESTAS QUE LA PERSONA APRUEBA (03-11-2026)
-- ============================================================
-- Doc 20 §3, regla 3, y §9. Felipe, 03-11: "vamos con lo que no puede
-- hacer para dejarla lista hoy". BelIA no escribe nada sola: arma una
-- PROPUESTA (el antes y el después, el total, las cuotas y los avisos), la
-- persona la ve en una tarjeta y recién con su «Sí, aplicar» el motor la
-- aplica por la misma puerta del cotizador (`QuotationsService.update`,
-- con la cuenta del dinero y la cascada del plan de pagos).
--
-- Una fila por propuesta. Guarda:
--  - `antes`: la foto de los servicios y la plata de la cotización tal
--    como estaban al proponer (el respaldo para deshacer);
--  - `despues`: lo que se va a guardar (el parche, ya calculado por la
--    casa) o la nota de la bitácora;
--  - `huella_antes` / `huella_despues`: la huella de la cotización al
--    proponer y al aplicar. Si al aplicar la huella ya no es la misma,
--    alguien la cambió entre medio y la propuesta no se aplica.
--
-- Es de cada empresa: lleva company_id y el motor filtra por él. Va con su
-- RLS y su REVOKE en la misma migración (lección 5 del cuaderno de
-- incidentes); el id es uuid, sin secuencia. Idempotente. Se aplica
-- primero en el laboratorio y después en producción, ANTES de publicar el
-- motor que la usa. Número reservado para BelIA el 03-11 (180 y 181; las
-- 177 a 179 siguen libres para otras sesiones).
-- ============================================================

create table if not exists public.asistente_propuestas (
  id uuid primary key default gen_random_uuid(),
  company_id bigint not null references public.companies(id) on delete cascade,
  quotation_id uuid not null references public.quotations(id) on delete cascade,
  -- El id de la SESIÓN de quien la pidió (`user.id`, el de auth), sin
  -- llave (lección de la 142). Solo esa persona la aplica.
  usuario_id uuid not null,
  usuario_nombre text,
  tipo text not null check (tipo in ('servicios', 'nota')),
  -- Una línea, en palabras de la persona: «Leche asada en vez de leche
  -- nevada los días 1 y 13».
  resumen text not null,
  antes jsonb not null,
  despues jsonb not null,
  huella_antes text not null,
  huella_despues text,
  -- «aplicando» y «deshaciendo» son el candado de dos clics: el motor
  -- toma la propuesta pasándola a ese estado solo si estaba pendiente (o
  -- aplicada), así dos pedidos a la vez nunca la aplican dos veces.
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'aplicando', 'aplicada', 'deshaciendo',
                      'deshecha', 'descartada', 'vencida')),
  -- Una propuesta vieja no se aplica: se pide de nuevo.
  vence_at timestamptz not null default (now() + interval '2 hours'),
  aplicada_at timestamptz,
  deshecha_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_asistente_propuestas_cotizacion
  on public.asistente_propuestas (company_id, quotation_id, estado);

alter table public.asistente_propuestas enable row level security;
revoke all on public.asistente_propuestas from anon, authenticated;
grant select, insert, update, delete on public.asistente_propuestas
  to service_role;

-- ============================================================
-- REVERSA (se pierden las propuestas y su respaldo del antes):
--   drop table if exists public.asistente_propuestas;
-- ============================================================
