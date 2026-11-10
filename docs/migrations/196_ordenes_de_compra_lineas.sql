-- 196 · LAS LÍNEAS DE LA ORDEN DE COMPRA (doc 19 §9.37)
--
-- Felipe, 08-11-2026, con la OC N° 33000132942 del CFT Santo Tomás (#481):
-- «la orden de compra tenía dos líneas, un menú adulto, un menú niño [...]
-- Eso no lo está trayendo. La idea es que esto lea exactamente lo que dice
-- la orden de compra». BelIA lee cada línea (descripción, cantidad y precio
-- unitario, neto salvo que la orden diga que incluye el IVA) y la factura
-- las copia, con el precio con IVA redondo.
--
-- Nulo: la OC no tiene líneas leídas (las de antes del 08-11 se releen
-- solas una vez al facturar, y la escrita a mano va sin ellas). [] : se
-- leyeron y no cuadraban con los montos de la OC (la factura va por el
-- monto, en una línea).
--
-- Se corre a mano en Supabase, en el laboratorio y en producción, ANTES
-- de que llegue el motor que la lee.

alter table public.ordenes_de_compra
  add column if not exists lineas jsonb;

comment on column public.ordenes_de_compra.lineas is
  'Las líneas de la OC como las leyó BelIA (doc 19 §9.37): [{descripcion, cantidad, precio, con_iva}]. Nulo: sin leer; []: no cuadraban.';
