-- Migración 38: números de cotización sin repetidos (Fase 1, punto 3).
--
-- EL PROBLEMA: el número se calculaba en el backend como "el último + 1"
-- leído aparte. Dos cotizaciones creadas al mismo tiempo veían el mismo
-- "último" y quedaban con el mismo número. Y la tabla no tenía ninguna
-- regla que lo impidiera (medido el 27-07: solo existe la PK sobre id).
--
-- LA SOLUCIÓN, en dos capas:
--   1) Un candado en la base: UNIQUE (company_id, quotation_number).
--      Aunque mañana alguien programe mal, la base rechaza el repetido.
--   2) Un contador oficial por empresa + una función atómica que entrega
--      los números de a uno. El UPDATE bloquea la fila del contador, así
--      dos creaciones simultáneas quedan en fila y reciben números
--      distintos.
--
-- Medido antes de escribir esto (27-07): CERO números repetidos hoy, so
-- el candado entra sin conflictos. Números actuales por empresa:
-- empresa 1 → 462 · empresa 51 → 2 · empresa 52 → 52.
--
-- ORDEN DE APLICACIÓN: primero este SQL, después el despliegue del
-- backend (merge a main). En la ventana entre ambos, el backend viejo
-- sigue con "último + 1": la función es auto-corregible (GREATEST contra
-- el MAX real) así que el contador no queda atrás.
--
-- REVERSA: 38_numero_cotizacion_unico.reversa.sql — deja todo como antes.

BEGIN;

-- 1) El candado: en una misma empresa no pueden repetirse números.
ALTER TABLE quotations
  ADD CONSTRAINT quotations_company_number_unique
  UNIQUE (company_id, quotation_number);

-- 2) El contador oficial por empresa, sembrado con el número mayor actual.
CREATE TABLE company_quotation_counters (
  company_id  bigint PRIMARY KEY REFERENCES companies (id),
  last_number bigint NOT NULL
);

INSERT INTO company_quotation_counters (company_id, last_number)
SELECT company_id, MAX(quotation_number)
FROM quotations
WHERE quotation_number IS NOT NULL
GROUP BY company_id;

-- Nadie de afuera lee ni escribe el contador: RLS encendido y sin
-- políticas. El backend usa la llave de servicio, que pasa por encima.
ALTER TABLE company_quotation_counters ENABLE ROW LEVEL SECURITY;

-- 3) La función atómica. Para una empresa nueva parte en 1. GREATEST
--    contra el MAX real la hace auto-corregible si el contador quedara
--    atrás (la ventana entre aplicar este SQL y desplegar el backend).
CREATE OR REPLACE FUNCTION next_quotation_number(p_company_id bigint)
RETURNS bigint
LANGUAGE sql
AS $$
  INSERT INTO company_quotation_counters AS c (company_id, last_number)
  VALUES (
    p_company_id,
    (SELECT COALESCE(MAX(quotation_number), 0) + 1
       FROM quotations WHERE company_id = p_company_id)
  )
  ON CONFLICT (company_id) DO UPDATE
    SET last_number = GREATEST(
      c.last_number,
      (SELECT COALESCE(MAX(q.quotation_number), 0)
         FROM quotations q WHERE q.company_id = p_company_id)
    ) + 1
  RETURNING last_number;
$$;

-- Solo el backend la ejecuta (llave de servicio). Ni el rol público ni
-- los usuarios conectados desde el navegador.
REVOKE EXECUTE ON FUNCTION next_quotation_number(bigint)
  FROM PUBLIC, anon, authenticated;

COMMIT;
