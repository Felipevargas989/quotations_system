-- Migración 47 — PORTAL DEL CLIENTE Fase 2a (aditiva).
-- Cada cotización aceptada tiene un enlace secreto único e imposible
-- de adivinar (64 caracteres hex = 244 bits de azar) con el que el
-- cliente ve su plan de pagos SIN clave. El token se genera al aceptar
-- (backend) y aquí se rellena para las ya aceptadas/realizadas.

ALTER TABLE public.quotations
  ADD COLUMN IF NOT EXISTS portal_token text UNIQUE;

-- Backfill: solo eventos vigentes o realizados (los demás no tienen
-- nada que mostrar en el portal).
UPDATE public.quotations
SET portal_token = replace(
  gen_random_uuid()::text || gen_random_uuid()::text, '-', ''
)
WHERE portal_token IS NULL
  AND quotation_status IN ('aceptada', 'realizada');
