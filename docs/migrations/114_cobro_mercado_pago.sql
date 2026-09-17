-- ============================================================
-- 114 · El cobro con Mercado Pago (paso 4+5, sprint B)
-- ============================================================
-- Escrita el 16-09-2026. Diseñada en atlas_pendiente/PLAN_VENTA_AUTOMATICA.md
-- (§4.1) y firmada por Felipe en sus 7 decisiones (§6).
--
-- Dos piezas:
--
-- 1) La empresa aprende de su suscripción: quién le cobra, cuál es su
--    suscripción, hasta cuándo está pagada y hasta cuándo dura la
--    gracia si un cobro falló (decisión 2: 7 días).
--
-- 2) El libro de avisos de pago. Mercado Pago REENVÍA el mismo aviso
--    cada 15 minutos hasta recibir un 200: sin la restricción única
--    (proveedor, aviso_id) un mismo pago se procesaría varias veces.
--    La idempotencia vive en la base, no en la memoria del motor.
--
-- Regla de la casa (lección 5 del cuaderno de incidentes): tabla nueva
-- por SQL directo lleva su GRANT, su secuencia y su RLS en la MISMA
-- migración, o la pantalla muere con "permission denied" (42501).
--
-- Aplicada en LAB el 16-09-2026 y en PRODUCCIÓN el 17-09-2026, antes
-- del deploy del motor del sprint B (orden de la casa).
-- ============================================================

alter table public.companies
  add column if not exists pago_proveedor text,        -- 'mercadopago'
  add column if not exists pago_suscripcion_id text,   -- id del preapproval; NULL con proveedor puesto = canceló
  add column if not exists pagado_hasta timestamptz,
  add column if not exists gracia_hasta timestamptz;

comment on column public.companies.pago_suscripcion_id is
  'La suscripción viva en el proveedor. NULL con pago_proveedor puesto significa que el cliente canceló: conserva su plan hasta pagado_hasta y ahí el reloj lo bloquea (decisión 5).';

create table if not exists public.avisos_de_pago (
  id bigint generated always as identity primary key,
  proveedor text not null default 'mercadopago',
  aviso_id text not null,            -- el id que manda el proveedor
  tipo text,
  company_id bigint references public.companies(id),
  cuerpo jsonb,
  recibido_en timestamptz not null default now(),
  unique (proveedor, aviso_id)       -- la idempotencia vive acá
);

-- El motor (service_role) es el ÚNICO que la toca. Nada para anon ni
-- authenticated: los avisos llegan por el webhook del motor, jamás
-- desde el navegador.
alter table public.avisos_de_pago enable row level security;
grant select, insert on public.avisos_de_pago to service_role;

-- La secuencia de la identidad también necesita su permiso (lección 5).
-- SOLO la de esta tabla: "ALL ... IN SCHEMA" está prohibido en esta casa
-- desde el incidente de rutina_gym_state (11-09).
grant usage, select on sequence public.avisos_de_pago_id_seq to service_role;
