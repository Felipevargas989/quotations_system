-- Módulo Logística: costo de servicios fijos.
-- La mayoría de los servicios fijos son tercerizaciones (ej: audiovisual que
-- se vende en 800.000 y cuesta 700.000 con el proveedor) — no llevan receta.
-- Dos componentes NO excluyentes:
--   cost_fixed:      costo fijo del servicio por evento (tercerización)
--   cost_per_person: costo variable por persona (ej: arriendo de sillas)
-- Costo del servicio en un evento = cost_fixed + cost_per_person × personas.
ALTER TABLE public.fixed_services
  ADD COLUMN IF NOT EXISTS cost_fixed numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cost_per_person numeric NOT NULL DEFAULT 0;
