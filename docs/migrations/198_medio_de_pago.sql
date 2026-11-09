-- 198 · EL MEDIO DE PAGO DE LA BOLETA Y DE LA FACTURA AL CONTADO (doc 19 §9.43)
--
-- Felipe, 09-11-2026: *"para hacer un control de cierre de caja como el de
-- Fudo, porque la recepcionista que boletee tendrá que rendir lo que
-- vendió"*. Cada boleta de recepción y cada factura al contado guarda con
-- qué se pagó: efectivo, débito, crédito o transferencia. Es de Eventia:
-- no va en el archivo del SII. Con esto se cuadra la caja de recepción
-- (sprint 2) y se cuenta lo vendido (sprint 3).
--
-- Nulo: la factura a crédito, lo emitido antes del 09-11 y las boletas de
-- un evento (esas se cobran con su plan de pagos).
--
-- Se corre a mano en Supabase, en el laboratorio y en producción, ANTES
-- de que llegue el motor que la lee (el motor la pide en cada lista).

alter table public.documentos_tributarios
  add column if not exists medio_de_pago text;

alter table public.documentos_tributarios
  drop constraint if exists documentos_tributarios_medio_de_pago_check;

alter table public.documentos_tributarios
  add constraint documentos_tributarios_medio_de_pago_check
  check (medio_de_pago in ('efectivo', 'debito', 'credito', 'transferencia'));

comment on column public.documentos_tributarios.medio_de_pago is
  'Con qué se pagó al contado (doc 19 §9.43): efectivo, debito, credito o transferencia. Nulo a crédito y en lo de antes.';
