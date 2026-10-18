-- ============================================================
-- 141 · SEGUIMIENTO CON IA: CADA BORRADOR Y SI YA SALIÓ (17-10-2026)
-- ============================================================
-- Doc 18 §9. Felipe, 17-10, con la 559 a la vista ("ese ya se mandó y
-- todavía aparecía generar seguimiento"): la cotización sale SOLA de la
-- lista cuando el borrador se ENVÍA. Eventia revisa en Outlook al abrir
-- Cotizaciones (sin reloj de fondo, como mucho una vez cada 5 minutos por
-- borrador) y, si salió, anota el envío en la bitácora con el próximo
-- contacto: correo a 14 días, o llamada a la semana siguiente si ya van
-- dos seguimientos sin respuesta.
--
-- Una fila por cada borrador que deja el botón «✉ Generar seguimiento»:
-- en qué buzón quedó, su identificador INMUTABLE de Outlook (el mismo
-- cuando pasa de Borradores a Enviados o a Elementos eliminados: medido el
-- 17-10 con los borradores de la 536, la 559 y la 607), el hilo y el
-- enlace para abrirlo. `estado`: borrador (espera en Outlook), enviado o
-- descartado (se borró sin enviarse).
--
-- Es de cada empresa: lleva company_id y el motor filtra por él. Va con su
-- RLS, su REVOKE y su GRANT (también a la secuencia) en la misma migración
-- (lección 5 del cuaderno de incidentes). Idempotente. Se aplica primero
-- en el laboratorio y después en producción, ANTES de publicar el motor
-- que la usa. Número reservado con la sesión de Oportunidades el 17-10.
-- ============================================================

create table if not exists public.seguimientos_con_ia (
  id bigint generated always as identity primary key,
  company_id bigint not null references public.companies(id) on delete cascade,
  quotation_id uuid not null references public.quotations(id) on delete cascade,
  -- El buzón donde quedó (contacto@…): solo los de la lista del motor.
  buzon text not null,
  modo text not null check (modo in ('seguimiento', 'responder', 'nuevo')),
  -- El identificador inmutable del mensaje en ese buzón.
  borrador_id text not null,
  -- La conversación (conversationId): para contar los correos del hilo.
  hilo_id text,
  -- Para abrir el borrador en Outlook web mientras espera.
  enlace text,
  angulo text,
  estado text not null default 'borrador'
    check (estado in ('borrador', 'enviado', 'descartado')),
  enviado_at timestamptz,
  -- La última vez que se le preguntó a Outlook (el freno de 5 minutos).
  revisado_at timestamptz,
  creado_por uuid references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_seguimientos_con_ia_espera
  on public.seguimientos_con_ia (company_id, estado, quotation_id);

alter table public.seguimientos_con_ia enable row level security;
revoke all on public.seguimientos_con_ia from anon, authenticated;
grant select, insert, update, delete on public.seguimientos_con_ia
  to service_role;
grant usage, select on sequence public.seguimientos_con_ia_id_seq
  to service_role;

-- ============================================================
-- REVERSA (los borradores de Outlook no se tocan; solo se deja de mirar
-- si salieron):
--   drop table if exists public.seguimientos_con_ia;
-- ============================================================
