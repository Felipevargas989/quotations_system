-- Migración 37: guardar el MONTO de la propina, no solo el porcentaje.
--
-- Corrige una decisión de la migración 32, que decía "el monto se
-- recalcula, no se guarda". El porcentaje es la REGLA con la que se llegó
-- al número; el monto es el HECHO. Y los hechos de una cotización ya
-- enviada no pueden cambiar solos: si mañana se toca la fórmula (que la
-- propina sea sobre el total y no solo sobre la comida, u otro redondeo),
-- todas las cotizaciones viejas cambiarían de propina hacia atrás.
--
-- Hay un riesgo más concreto: total_amount YA lleva la propina sumada
-- adentro, calculada con la regla del día en que se guardó. Si la regla
-- cambia, la propina recalculada deja de ser la que está dentro de ese
-- total y la resta "venta = total − propina" empieza a dar mal.
--
-- Convención: la misma del descuento (migración 6, discount_amount).
-- Se guardan las dos cosas — el porcentaje para poder editar y para
-- mostrárselo al cliente, el monto para que quede fijo.
--
-- ORDEN DE APLICACIÓN: primero este SQL, después el despliegue del
-- código. Al revés, el código intentaría escribir una columna que no
-- existe. En la ventana entre ambos, una cotización con propina que se
-- edite queda con tip_amount = 0 y porcentaje > 0; el código la detecta
-- como fila a medias y reconstruye el monto, así que no se rompe.

ALTER TABLE public.quotations
  ADD COLUMN IF NOT EXISTS tip_amount numeric NOT NULL DEFAULT 0;

-- Relleno hacia atrás. Es exacto y este es el momento de hacerlo: la
-- fórmula de abajo es la misma que produjo los total_amount guardados,
-- así que el monto que queda es el que efectivamente se le cobró al
-- cliente. Más adelante, con la regla ya tocada, sería adivinar.
--
-- Servicios variables = subtotal − fijos (exacto por construcción: el
-- cotizador guarda subtotal_amount = variables + fijos, y fixed_value =
-- fijos). El tope de 100% es el del cotizador. GREATEST evita negativos.
-- ROUND aquí y Math.round en el código coinciden: los valores nunca son
-- negativos, y ahí ambos redondean el medio peso hacia arriba.
--
-- Las cotizaciones anteriores a la migración 32 tienen tip_percentage
-- NULL: el COALESCE las deja en 0, que es lo correcto (no tenían propina).
UPDATE public.quotations
SET tip_amount = ROUND(
      GREATEST(
        0,
        COALESCE(subtotal_amount, 0) - COALESCE(fixed_value, 0)
      ) * LEAST(COALESCE(tip_percentage, 0), 100) / 100
    )
WHERE COALESCE(tip_percentage, 0) > 0;

-- Comprobación (opcional, para mirar el resultado): las que tienen
-- propina, con el monto que quedó guardado.
-- SELECT quotation_number, subtotal_amount, fixed_value, tip_percentage,
--        tip_amount, total_amount
-- FROM public.quotations
-- WHERE COALESCE(tip_percentage, 0) > 0
-- ORDER BY quotation_number;
