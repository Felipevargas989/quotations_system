-- Módulo Logística · Fase 4b: los recursos de los servicios fijos se
-- INSTANCIAN en el evento (se importan como líneas de event_resources,
-- editables por evento = rebajas). origin_fixed_service_id marca de qué
-- servicio fijo proviene cada línea importada (NULL = agregado a mano).
-- Con esto la rentabilidad del evento = insumos + recursos, sin doble
-- conteo, y Compras congela solo insumos.

ALTER TABLE public.event_resources
  ADD COLUMN IF NOT EXISTS origin_fixed_service_id bigint
    REFERENCES public.fixed_services(id) ON DELETE SET NULL;
