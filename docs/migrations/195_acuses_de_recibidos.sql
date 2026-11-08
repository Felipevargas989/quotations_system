-- 195 · ACEPTAR O RECLAMAR LO RECIBIDO (doc 19 §9.25, paso 3, y §9.30)
--
-- Felipe, 08-11-2026: "a producción y luego con lo que falta". Lo que
-- faltaba de «Recibidos» (§9.28) era el paso 3 del plan de §9.25: aceptar o
-- reclamar ante el SII una factura de un proveedor, por el «Panel DTE
-- Recibidos» de facturacion.cl (`Acuse`, `a` o `r`). Es un acto con efecto
-- legal (la ley 19.983 da 8 días desde la recepción para reclamar; después
-- la factura queda aceptada), así que cada vez queda anotado: qué documento,
-- qué se hizo, qué respondió facturacion.cl, quién y cuándo. Nada se borra.

create table if not exists public.acuses_de_recibidos (
  id bigserial primary key,
  company_id bigint not null references public.companies(id) on delete cascade,
  rut_emisor text not null,
  tipo integer not null,
  folio bigint not null,
  accion text not null check (accion in ('aceptar', 'reclamar')),
  -- Lo que respondió facturacion.cl (`AcuseResult`).
  resultado boolean not null,
  mensaje text,
  pedido_por uuid,
  pedido_por_nombre text,
  pedido_en timestamptz not null default now()
);

create index if not exists idx_acuses_de_recibidos_documento
  on public.acuses_de_recibidos (company_id, rut_emisor, tipo, folio);

alter table public.acuses_de_recibidos enable row level security;
revoke all on public.acuses_de_recibidos from anon, authenticated;
grant select, insert on public.acuses_de_recibidos to service_role;
grant usage, select on sequence public.acuses_de_recibidos_id_seq to service_role;
-- Supabase de producción le da todo a `service_role` en cada tabla nueva
-- (lección del 07-11-2026): lo anotado no se cambia ni se borra.
revoke update, delete, truncate on public.acuses_de_recibidos from service_role;
