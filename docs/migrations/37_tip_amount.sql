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

-- ---------------------------------------------------------------------
-- PASO 1: relleno hacia atrás, SOLO donde la propina está de verdad
-- adentro del total.
--
-- 25-07-2026: la versión original de este archivo daba por sentado que
-- "la fórmula de abajo es la misma que produjo los total_amount
-- guardados". Eso resultó FALSO, y por eso este paso lleva candado.
--
-- La fórmula sí es la del cotizador. El problema es que no todas las
-- filas de la tabla las escribió el cotizador: hay datos importados
-- desde afuera, y esos llegaron con tip_percentage = 10 sin que ese 10
-- estuviera nunca sumado dentro de total_amount. Rellenar sin mirar les
-- habría inventado una propina que el cliente jamás pagó, y como el
-- Dashboard calcula "venta = total − propina", esa plata inventada se
-- habría restado de las ventas. En los datos reales del 25-07 eran nueve
-- cotizaciones y $2.023.600 de ventas que se iban a evaporar.
--
-- El candado: rellenar solo si se cumple la identidad completa
--     total = subtotal − descuento + propina
-- con un peso de tolerancia por el redondeo. Si no calza, la propina no
-- estaba adentro y la fila se deja en 0.
--
-- Servicios variables = subtotal − fijos (exacto por construcción: el
-- cotizador guarda subtotal_amount = variables + fijos, y fixed_value =
-- fijos). El tope de 100% es el del cotizador. GREATEST evita negativos.
-- ROUND aquí y Math.round en el código coinciden: los valores nunca son
-- negativos, y ahí ambos redondean el medio peso hacia arriba.
--
-- Las cotizaciones anteriores a la migración 32 tienen tip_percentage
-- NULL: el COALESCE las deja en 0, que es lo correcto (no tenían propina).
UPDATE public.quotations AS q
SET tip_amount = calc.propina
FROM (
  SELECT
    id,
    ROUND(
      GREATEST(0, COALESCE(subtotal_amount, 0) - COALESCE(fixed_value, 0))
      * LEAST(COALESCE(tip_percentage, 0), 100) / 100
    ) AS propina,
    -- Descuento efectivo: los dos modos son excluyentes en el cotizador
    -- (solo el activo viaja con valor), así que el monto manda cuando
    -- existe y si no se reconstruye desde el porcentaje.
    CASE
      WHEN COALESCE(discount_amount, 0) > 0
        THEN ROUND(COALESCE(discount_amount, 0))
      ELSE ROUND(
        COALESCE(subtotal_amount, 0)
        * LEAST(COALESCE(discount_percentage, 0), 100) / 100
      )
    END AS descuento
  FROM public.quotations
  WHERE COALESCE(tip_percentage, 0) > 0
) AS calc
WHERE q.id = calc.id
  AND ABS(
        COALESCE(q.total_amount, 0)
        - (COALESCE(q.subtotal_amount, 0) - calc.descuento + calc.propina)
      ) <= 1;

-- ---------------------------------------------------------------------
-- PASO 2: limpiar los porcentajes fantasma que el candado dejó afuera.
--
-- Sin esto el candado no sirve de nada. Una fila que no pasó el paso 1
-- queda con tip_amount = 0 y tip_percentage > 0, que es exactamente la
-- forma de una "fila a medias" — y el código (tipAmountOf, en
-- api-rest/src/quotations/utils/tip.ts y su espejo del frontend) la
-- detecta así y RECONSTRUYE el monto desde el porcentaje. O sea: la
-- propina inventada volvería por la ventana.
--
-- Si la propina no está adentro del total, entonces ese porcentaje no es
-- un dato de la cotización: es basura que llegó con la importación. Se
-- borra. El total NO se toca — es lo que se le cobró al cliente.
--
-- Cómo se reconoce a las que quedaron afuera sin repetir el candado: son
-- las que tienen porcentaje pero monto en 0 AUNQUE la fórmula habría
-- dado al menos un peso. Las que legítimamente dan 0 (todo servicio
-- fijo, o un porcentaje ínfimo) conservan su porcentaje.
UPDATE public.quotations
SET tip_percentage = NULL
WHERE COALESCE(tip_percentage, 0) > 0
  AND COALESCE(tip_amount, 0) = 0
  AND ROUND(
        GREATEST(0, COALESCE(subtotal_amount, 0) - COALESCE(fixed_value, 0))
        * LEAST(COALESCE(tip_percentage, 0), 100) / 100
      ) >= 1;

-- Comprobación (opcional, para mirar el resultado): las que tienen
-- propina, con el monto que quedó guardado. Después de correr esto,
-- toda fila con tip_percentage > 0 tiene que cumplir
-- total = subtotal − descuento + tip_amount.
-- SELECT quotation_number, subtotal_amount, fixed_value, discount_amount,
--        discount_percentage, tip_percentage, tip_amount, total_amount
-- FROM public.quotations
-- WHERE COALESCE(tip_percentage, 0) > 0
-- ORDER BY quotation_number;
