-- UNIFICAR LOS MEDIOS DE PAGO VIEJOS (Felipe 28-08-2026).
--
-- Por qué: el desplegable de "Registrar pago" ofrece 5 opciones desde
-- mayo 2026 (Transferencia, Efectivo, Cheque, Tarjeta, Otro), pero los
-- 205 pagos anteriores traen etiquetas de antes. Un informe por medio
-- de pago salía partido: "Transferencia" 13 vs "Transferencia
-- bancaria" 198.
--
-- Medido en producción ANTES de aplicar:
--   Transferencia bancaria  198  (ene-2025 → jul-2026)
--   Deposito                  4  (jul → nov 2025)
--   Tarjeta de credito        3  (dic 2025)
-- Decisión de Felipe: Depósito va a "Otro".
--
-- Los montos, fechas y comprobantes NO se tocan: solo la etiqueta.
-- La reversión exacta vive en 102_unificar-medios-de-pago.revertir.sql

UPDATE public.payment_transactions
   SET payment_method = 'Transferencia'
 WHERE payment_method = 'Transferencia bancaria';

UPDATE public.payment_transactions
   SET payment_method = 'Tarjeta'
 WHERE payment_method = 'Tarjeta de credito';

UPDATE public.payment_transactions
   SET payment_method = 'Otro'
 WHERE payment_method = 'Deposito';
