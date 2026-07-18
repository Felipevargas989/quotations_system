-- Etapa 1 · Retiro del tipo de cálculo "variable_con_limites".
-- En la práctica mezclaba cosas operativamente: quedan solo FIJO y
-- FIJO_VARIABLE (un servicio "puro por persona" es fijo 0 + variable).
--
-- IMPORTANTE: las cotizaciones históricas (81 en prod) guardan el tipo en
-- su snapshot interno y se siguen calculando con la lógica legada del
-- frontend — NO se tocan. Esto solo convierte el CATÁLOGO.
--
-- Conversiones con montos decididos por Felipe (aplicadas a mano en prod
-- el 18-07-2026): Salones 210.000 · Cena p/100 2.500.000 · Cóctel p/10
-- 100.000 · Coffee 15.000 · show de animación 0 (dato malo, lo corrige
-- en el catálogo). Duplicados Salón Auditorio/Cúpula: uno desactivado.
-- El UPDATE genérico de abajo cubre cualquier resto (usa min_price como
-- fallback de precio fijo).

UPDATE public.fixed_services
  SET calculation_type = 'fijo',
      price = COALESCE(NULLIF(price, 0), min_price, 0),
      price_per_person = NULL,
      min_price = NULL,
      max_price = NULL
  WHERE calculation_type = 'variable_con_limites';

-- Unificación de tipos duplicados (residuo de la carga por Excel):
-- 'fijo_mas_variable' y 'fijo_variable' eran el mismo concepto, pero el
-- cálculo del frontend solo reconoce 'fijo_variable'.
UPDATE public.fixed_services
  SET calculation_type = 'fijo_variable'
  WHERE calculation_type = 'fijo_mas_variable';
