-- Migración 118 — UN PAGO REPARTIDO EN VARIAS CUOTAS ES UNO SOLO
-- (07-10-2026, regla "el plan mantiene su forma", docs/arquitectura/
-- 14_CUOTAS_QUE_SE_LLENAN.md, caso borde 11 aprobado por Felipe).
--
-- QUÉ RESUELVE: con las cuotas que se llenan, lo pagado se vuelve a
-- repartir desde la primera cuota después de cualquier cambio, y un
-- mismo pago puede quedar en dos cuotas (Linde, lab: $1.000.000 =
-- $950.250 en la cuota 1 + $49.750 en la 2). Cada pedazo es una fila de
-- payment_transactions; esta columna dice cuáles son el MISMO pago, para
-- verlo, corregirlo y borrarlo entero. El derrame de siempre ya partía
-- un pago en varias filas: desde ahora esas filas comparten grupo.
--
-- REGLAS:
--   * Nace con DEFAULT gen_random_uuid(): una fila que se inserta sin
--     grupo (código viejo) es un pago propio. Por eso es seguro aplicarla
--     en PRODUCCIÓN ANTES de publicar el motor nuevo.
--   * Las filas que ya existen quedan cada una como su propio pago (no se
--     adivina cuáles eran del mismo derrame).
--
-- Idempotente. Aplicada en LAB el 07-10-2026. En producción: pendiente
-- (antes del deploy del motor).
-- ============================================================

alter table public.payment_transactions
  add column if not exists pago_grupo uuid;

update public.payment_transactions
   set pago_grupo = gen_random_uuid()
 where pago_grupo is null;

alter table public.payment_transactions
  alter column pago_grupo set default gen_random_uuid();

alter table public.payment_transactions
  alter column pago_grupo set not null;

create index if not exists idx_payment_transactions_pago_grupo
  on public.payment_transactions (pago_grupo);

-- ============================================================
-- REVERSA (solo si se vuelve a la regla anterior):
--   drop index if exists public.idx_payment_transactions_pago_grupo;
--   alter table public.payment_transactions drop column if exists pago_grupo;
