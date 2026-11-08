-- 193 · LO RECIBIDO: LAS FACTURAS DE LOS PROVEEDORES (doc 19 §9.25 y §9.28)
--
-- Felipe, 07-11-2026: "¿ya trajiste las facturas recibidas? ¿eso
-- funcionará?" y, con el plan, "me parece perfecto el orden, sumemos todo".
--
-- La copia de lo que trae el Libro de Compras de facturacion.cl
-- (`obtenerCompra`, «Manual WebService de Compras»): una fila por documento
-- recibido, de cada empresa, con lo que dice su XML (quién lo emite, qué es,
-- cuándo y por cuánto), la fecha en que lo recibió el SII y el enlace de su
-- PDF. Se llena con «Traer de facturacion.cl» en «Recibidos»; así la lista
-- no le pide todo a facturacion.cl cada vez. No acepta ni rechaza nada.

create table if not exists public.documentos_recibidos (
  id bigserial primary key,
  company_id bigint not null references public.companies(id) on delete cascade,
  -- El mes del libro de compras donde vino (AAAA-MM).
  periodo char(7) not null,
  rut_emisor text not null,
  razon_social_emisor text,
  tipo integer not null,
  folio bigint not null,
  fecha_emision date,
  neto bigint,
  exento bigint,
  iva bigint,
  total bigint,
  link_pdf text,
  recepcion_sii text,
  acuse_sii text,
  tipo_compra integer,
  traido_en timestamptz not null default now(),
  unique (company_id, rut_emisor, tipo, folio)
);

create index if not exists idx_documentos_recibidos_periodo
  on public.documentos_recibidos (company_id, periodo);

alter table public.documentos_recibidos enable row level security;
revoke all on public.documentos_recibidos from anon, authenticated;
grant select, insert, update on public.documentos_recibidos to service_role;
grant usage, select on sequence public.documentos_recibidos_id_seq to service_role;
