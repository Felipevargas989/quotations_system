-- Módulo Logística · Fase 3 (Compras multi-evento): marca de provisión.
-- Al comprar los insumos de uno o varios eventos, se marcan como
-- provisionados: fecha + foto del costo estimado en ese momento.
-- (La congelación completa de costos con recursos por evento llega en Fase 4;
-- re-provisionar está permitido y actualiza la foto.)

ALTER TABLE public.quotations
  ADD COLUMN IF NOT EXISTS provisioned_at timestamptz,
  ADD COLUMN IF NOT EXISTS provisioned_cost numeric;
