-- Migración 61 — MOTIVO DE PÉRDIDA (06-08-2026, decisión de Felipe tras
-- medir que el precio NO explica las derrotas: el ticket promedio de
-- las ganadas ($3.025.652) y el de las perdidas ($3.028.883) son
-- prácticamente idénticos. Sin este dato, 170 cotizaciones perdidas no
-- enseñan nada).
--
-- Se guarda el motivo al pasar a RECHAZADA (perdimos la venta) o a
-- CANCELADA (ya era nuestra y se cayó). Las listas son distintas porque
-- duelen distinto; el frontend ofrece la que corresponde. El detalle
-- libre NO va acá: viaja como nota al hilo de seguimiento.
-- 100 % aditiva.
ALTER TABLE public.quotations
  ADD COLUMN IF NOT EXISTS loss_reason text;

COMMENT ON COLUMN public.quotations.loss_reason IS
  'Motivo al rechazar o anular. Rechazo: precio | fecha_no_disponible | otro_proveedor | no_respondio | desistio | otro. Anulación: cliente_cancelo | cambio_fecha | problema_pago | no_pudimos | otro.';
