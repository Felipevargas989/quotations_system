-- 217 · BelIA envía las cotizaciones solicitadas (doc 20 §19, 27-11-2026).
-- Felipe: «que los envíe BelIA, pero que antes me muestre un detalle de qué
-- le dirá a cada uno, y que salgan desde contacto@valledelsolquillon.cl».
-- Una propuesta nueva, «envio»: el correo ya listo en el hilo del cliente,
-- que sale recién con el «Sí, enviar» de la persona. Solo se suma el tipo.

ALTER TABLE public.asistente_propuestas
  DROP CONSTRAINT IF EXISTS asistente_propuestas_tipo_check;

ALTER TABLE public.asistente_propuestas
  ADD CONSTRAINT asistente_propuestas_tipo_check
  CHECK (tipo = ANY (ARRAY[
    'servicios', 'nota', 'cotizacion_nueva', 'seguimiento',
    'leccion', 'leccion_estado', 'cliente', 'envio'
  ]));
