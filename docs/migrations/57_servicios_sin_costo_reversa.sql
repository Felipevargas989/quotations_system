-- Reversa de 57: elimina el interruptor "no lleva costo en Eventia".
ALTER TABLE variable_services DROP COLUMN IF EXISTS no_cost;
ALTER TABLE fixed_services DROP COLUMN IF EXISTS no_cost;
