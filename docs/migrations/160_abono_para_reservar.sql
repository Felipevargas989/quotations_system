-- 160 · EL ABONO PARA RESERVAR LA FECHA (Felipe, 22-10-2026)
--
-- "En empresa poner una parte donde se configure qué porcentaje de abono,
-- y abajo del precio poner el % y el abono calculado para la reserva."
-- Cada empresa elige su porcentaje en Configuración de empresa. La hoja de
-- la cotización (visor, PDF del correo e impresión, portal del cliente)
-- muestra debajo del TOTAL: «La fecha queda reservada solo al recibir el
-- abono del X%: $Y.», calculado sobre el total con IVA sin la propina
-- sugerida. NULL o 0 = la línea no sale (así queda toda empresa que no lo
-- configure).
alter table public.companies
  add column if not exists abono_reserva_pct numeric(5,2)
  check (abono_reserva_pct is null or (abono_reserva_pct >= 0 and abono_reserva_pct <= 100));

comment on column public.companies.abono_reserva_pct is
  'Porcentaje del total (con IVA, sin propina) que se pide de abono para reservar la fecha. NULL o 0 = la cotización no muestra la línea. Migración 160.';
