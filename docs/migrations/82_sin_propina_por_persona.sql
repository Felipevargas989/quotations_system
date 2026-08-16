-- ============================================================
-- 82 — QUIÉN NO LLEVA PROPINA ESE DÍA (15-08)
--
-- Pedido de Felipe al ordenar la liquidación: un check "sin
-- propina" junto al basurero de cada persona, "por si alguien no
-- llevará propina".
--
-- No es un caso raro: está medido en el Excel (capítulo 10.3,
-- caso 5) — el 28 de septiembre trabajaron 10 personas y
-- recibieron propina 4. Sin esta marca, la única forma de dejar
-- a alguien fuera del reparto sería no ponerlo en el evento, y
-- entonces tampoco se le pagaría la jornada, que sí trabajó.
--
-- Es del DÍA, no de la persona: el mismo garzón puede llevar
-- propina el sábado y no el domingo. Por eso vive en event_staff
-- y no en people.
--
-- El reparto simplemente se salta estas filas: lo que le toca al
-- cargo se divide entre los que sí llevan.
--
-- Aplicada en LABORATORIO: 15-08-2026.
-- Aplicada en PRODUCCIÓN: pendiente (paquete 68→82).
-- ============================================================

ALTER TABLE public.event_staff
  ADD COLUMN IF NOT EXISTS no_tip boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.event_staff.no_tip IS
  'Esa persona NO lleva propina ese dia: el reparto se la salta. Su jornada se paga igual.';
