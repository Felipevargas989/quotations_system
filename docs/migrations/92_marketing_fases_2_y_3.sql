-- 92 · Marketing Fases 2 y 3 (25-08-2026)
--
-- Fase 3: campañas a SEGMENTOS calculados de la base (filtro jsonb):
-- tipos de cliente, con evento realizado/aceptado en un periodo,
-- dormidos (sin cotizacion desde), aniversario (~12 meses del evento),
-- monto minimo historico y tipo de evento.
-- Fase 2: resultados por destinatario (webhooks de Resend) y el
-- reenvio a los que no abrieron (una sola segunda pasada por envio).

ALTER TABLE public.marketing_campaigns
  DROP CONSTRAINT IF EXISTS marketing_campaigns_audiencia_tipo_check;
ALTER TABLE public.marketing_campaigns
  ADD CONSTRAINT marketing_campaigns_audiencia_tipo_check
  CHECK (audiencia_tipo IN ('clientes','importada','segmento'));
ALTER TABLE public.marketing_campaigns
  ADD COLUMN IF NOT EXISTS filtro jsonb;

ALTER TABLE public.marketing_sends
  ADD COLUMN IF NOT EXISTS opened_at timestamptz,
  ADD COLUMN IF NOT EXISTS clicked_at timestamptz,
  ADD COLUMN IF NOT EXISTS bounced_at timestamptz,
  ADD COLUMN IF NOT EXISTS reenviado_at timestamptz;
