-- Programar envío (04-09-2026, capítulo "Programar envío" del doc 11):
-- la campaña guarda para cuándo quedó programada y quién la programó
-- (esa persona recibe la copia del capitán al dispararse), y el estado
-- aprende 'programada' (el CHECK de la migración 91 solo conocía
-- borrador/enviada). Correr en LAB y en PRODUCCIÓN.
ALTER TABLE marketing_campaigns
  ADD COLUMN IF NOT EXISTS programada_para timestamptz,
  ADD COLUMN IF NOT EXISTS programada_por text;

ALTER TABLE marketing_campaigns
  DROP CONSTRAINT IF EXISTS marketing_campaigns_estado_check;
ALTER TABLE marketing_campaigns
  ADD CONSTRAINT marketing_campaigns_estado_check
  CHECK (estado IN ('borrador', 'programada', 'enviada'));
