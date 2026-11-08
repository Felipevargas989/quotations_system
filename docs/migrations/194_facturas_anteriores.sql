-- 194 · TUS FACTURAS ANTERIORES: LA SEGUNDA FUENTE DEL RUT (doc 19 §9.25 y §9.29)
--
-- Felipe, 08-11-2026, con lo de la nómina del SII ya en producción: "a
-- producción y luego con lo que falta... ¿qué pasó con buscar los datos
-- solo con el RUT?". El paso 2 del orden aprobado el 07-11 (§9.25): las
-- facturas que Valle del Sol ya emitió en facturacion.cl. El motor las baja
-- una vez con `ObtenerPdf` (viene incluido en el servicio) y lee el cuadro
-- del cliente del texto del PDF, sin IA: Señor(es), RUT, giro, dirección,
-- comuna y ciudad. Así el RUT llena lo que se usó de verdad en la última
-- factura, también para las agrupaciones y juntas que no están en la nómina
-- del SII (medido el 08-11: la agrupación de la factura N° 379 no está).
--
-- Dos tablas, de cada empresa:
-- - `lecturas_de_facturas_anteriores`: cada vez que se apretó «Leer mis
--   facturas anteriores», cuántas se pidieron, cuántas trajeron su PDF y
--   cuántos clientes salieron;
-- - `receptores_de_facturas_anteriores`: un cliente por RUT, con lo de su
--   factura más nueva.
--
-- Son unos cientos de filas: van en el respaldo diario. Nada se borra.

create table if not exists public.lecturas_de_facturas_anteriores (
  id bigserial primary key,
  company_id bigint not null references public.companies(id) on delete cascade,
  empezo_en timestamptz not null default now(),
  termino_en timestamptz,
  estado text not null default 'leyendo'
    check (estado in ('leyendo', 'lista', 'fallo')),
  -- Las que hay que pedir, de la más nueva (`hasta_folio`) a la más vieja.
  folios integer not null default 0,
  desde_folio bigint,
  hasta_folio bigint,
  -- Avanza mientras lee.
  leidas integer not null default 0,
  encontradas integer not null default 0,
  clientes integer not null default 0,
  error text,
  pedida_por uuid,
  pedida_por_nombre text
);

create index if not exists idx_lecturas_de_facturas_anteriores_empresa
  on public.lecturas_de_facturas_anteriores (company_id, id desc);

create table if not exists public.receptores_de_facturas_anteriores (
  company_id bigint not null references public.companies(id) on delete cascade,
  -- El RUT en su forma limpia («65000869-3»).
  rut text not null,
  razon_social text not null,
  giro text,
  direccion text,
  comuna text,
  ciudad text,
  -- La factura de donde salió (la más nueva de ese RUT).
  tipo integer not null,
  folio bigint not null,
  fecha_emision date,
  leido_en timestamptz not null default now(),
  primary key (company_id, rut)
);

alter table public.lecturas_de_facturas_anteriores enable row level security;
alter table public.receptores_de_facturas_anteriores enable row level security;
revoke all on public.lecturas_de_facturas_anteriores from anon, authenticated;
revoke all on public.receptores_de_facturas_anteriores from anon, authenticated;
grant select, insert, update on public.lecturas_de_facturas_anteriores to service_role;
grant select, insert, update on public.receptores_de_facturas_anteriores to service_role;
grant usage, select on sequence public.lecturas_de_facturas_anteriores_id_seq to service_role;
-- Supabase de producción le da todo a `service_role` en cada tabla nueva
-- (lección del 07-11-2026): nada de esto se borra.
revoke delete, truncate on public.lecturas_de_facturas_anteriores from service_role;
revoke delete, truncate on public.receptores_de_facturas_anteriores from service_role;
