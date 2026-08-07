-- Migración 62 — RECONTACTO (07-08-2026, pedido de Felipe sobre "la
-- cosecha del mes": «que si lo pincho lo marque como recontactado, así
-- me acuerdo si intenté llamarlo o no, solo eso»).
--
-- La cosecha lista, un año después, a quién pidió cotización ese mes y
-- no ha vuelto a pedir lo mismo. Esa lista es la lista de llamados —
-- pero sin dónde anotar el intento, al día siguiente no se sabe por
-- quién se iba. Acá NO va un hilo de seguimiento: las cotizaciones de
-- esa lista suelen estar rechazadas o realizadas, y en esos estados
-- "muere el deal y muere todo seguimiento" (regla de Felipe). Es una
-- marca simple: cuándo se intentó y quién lo intentó.
-- 100 % aditiva.
ALTER TABLE public.quotations
  ADD COLUMN IF NOT EXISTS recontacted_at timestamptz,
  ADD COLUMN IF NOT EXISTS recontacted_by uuid;

COMMENT ON COLUMN public.quotations.recontacted_at IS
  'Cuándo se intentó recontactar al cliente desde la cosecha del mes. NULL = nunca se intentó.';
COMMENT ON COLUMN public.quotations.recontacted_by IS
  'Quién marcó el intento de recontacto (auth.users.id). Sin llave foránea, igual que quotations.user_id.';
