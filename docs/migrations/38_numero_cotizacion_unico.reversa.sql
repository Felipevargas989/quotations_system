-- REVERSA de la migración 38: deja la base exactamente como antes.
-- Solo se usa si algo sale mal. Requiere que el backend desplegado sea
-- el ANTERIOR al cambio (el que calcula "último + 1"); si ya se desplegó
-- el nuevo, primero revertir el despliegue y después correr esto.

BEGIN;

DROP FUNCTION IF EXISTS next_quotation_number(bigint);
DROP TABLE IF EXISTS company_quotation_counters;
ALTER TABLE quotations
  DROP CONSTRAINT IF EXISTS quotations_company_number_unique;

COMMIT;
