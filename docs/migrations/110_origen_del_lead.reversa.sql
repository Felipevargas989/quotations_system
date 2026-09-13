-- REVERSA de la migración 110 — saca las columnas de origen del lead.
--
-- OJO: esto BORRA la información de origen ya capturada (de qué anuncio,
-- de qué red vino cada cotización). No es recuperable: esa huella solo
-- existe en el momento en que la persona llega, no se puede reconstruir
-- después. Si la duda es "¿molesta tener las columnas?", la respuesta es
-- no: van vacías para todo lo anterior y el código que no las conoce las
-- ignora. Revertir solo si de verdad se abandona la función.

ALTER TABLE public.quotations
  DROP COLUMN IF EXISTS origen,
  DROP COLUMN IF EXISTS origen_detalle;

ALTER TABLE public.consultas
  DROP COLUMN IF EXISTS origen,
  DROP COLUMN IF EXISTS origen_detalle;
