-- 57: interruptor "no lleva costo en Eventia" por servicio.
-- Motivo (03-08-2026): servicios como Ticket diario, alojamientos o la
-- Exclusividad no llevan costos dentro de Eventia y aparecían
-- eternamente como "sin receta/costos" (filtro del catálogo y
-- advertencias de Gestión). Con este interruptor cuentan costo $0 real
-- y dejan de figurar como pendientes.
ALTER TABLE variable_services
  ADD COLUMN IF NOT EXISTS no_cost boolean NOT NULL DEFAULT false;
ALTER TABLE fixed_services
  ADD COLUMN IF NOT EXISTS no_cost boolean NOT NULL DEFAULT false;
