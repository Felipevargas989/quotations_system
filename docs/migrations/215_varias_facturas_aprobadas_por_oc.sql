-- 215 · UNA OC CON VARIAS FACTURAS APROBADAS (doc 19 §9.53)
--
-- Felipe, 25-11-2026, con la OC 4505522493 de Transportes CCU (#407, July
-- Díaz): *"un evento, una orden de compra puede tener varias facturas.
-- Déjalo programado para que esto ya sea automático"*. CCU pide una factura
-- por cada nota de pedido (referencia 802), y cada nota de pedido es una
-- línea de la OC: 4 líneas, 4 facturas. Hasta hoy `facturas_aprobadas`
-- guardaba una sola por evento o por OC, y solo una podía esperar armada.
--
-- `linea_de_la_oc`: la línea de la OC (desde 0) que factura esta aprobada,
-- cuando la OC va en una factura por línea; si no, nulo, como antes. El
-- índice único pasa a contar la línea: una por evento, por OC o por línea
-- de la OC.
--
-- Se corre a mano en Supabase, en el laboratorio y en producción, ANTES de
-- que llegue el motor que la lee. Idempotente. Las filas que hay (nulo en
-- la columna nueva) siguen valiendo igual.

alter table public.facturas_aprobadas
  add column if not exists linea_de_la_oc integer
    check (linea_de_la_oc is null or linea_de_la_oc >= 0);

drop index if exists public.ux_facturas_aprobadas_evento;
create unique index if not exists ux_facturas_aprobadas_evento
  on public.facturas_aprobadas
  (quotation_id, coalesce(oc_id, 0), coalesce(linea_de_la_oc, -1));

comment on column public.facturas_aprobadas.linea_de_la_oc is
  'La línea de la OC (desde 0) de esta factura cuando la OC va en una factura por línea, como las notas de pedido de CCU (doc 19 §9.53); nulo si no.';
