-- 189 · La condición de pago de la factura (doc 19 §9.22, 06-11-2026)
--
-- Felipe, 06-11: "por defecto la factura debe ser emitida en crédito a 30
-- días... o 45 o 60". La factura va al contado o a crédito, y el crédito a
-- 30, 45 o 60 días desde la emisión. Va en el DTE (FormaPago y
-- FechaVencimiento del archivo de facturacion.cl) y queda en el documento:
-- la lista dice «Crédito 30 días · vence 06-12», y lo a crédito es lo que
-- queda por cobrar.
--
-- 30 días es el máximo de la ley de pago a 30 días (Ley 19.983); 45 y 60
-- valen con las bases de una licitación pública o con un acuerdo escrito
-- inscrito en el Ministerio de Economía. El motor solo acepta 30, 45 y 60.
--
-- Lo emitido antes queda en nulo (facturacion.cl asumió crédito). Va a las
-- dos bases antes que el motor que la lee: sin las columnas, la lista de
-- documentos no carga.

alter table public.documentos_tributarios
  -- 1 contado, 2 crédito (3, sin costo, no se ofrece).
  add column if not exists forma_de_pago smallint
    check (forma_de_pago is null or forma_de_pago in (1, 2, 3)),
  -- AAAA-MM-DD; nunca antes de la emisión (lo revisa el motor).
  add column if not exists vencimiento date;

comment on column public.documentos_tributarios.forma_de_pago is
  'Condición de pago de la factura: 1 contado, 2 crédito (doc 19 §9.22).';
comment on column public.documentos_tributarios.vencimiento is
  'Vencimiento del crédito: la emisión más 30, 45 o 60 días (doc 19 §9.22).';
