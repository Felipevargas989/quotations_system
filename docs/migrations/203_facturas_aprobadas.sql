-- 203 · LAS FACTURAS APROBADAS QUE ESPERAN (doc 19 §9.48)
--
-- Felipe, 11-11-2026: *"ya revisé y dejé la facturación hecha, y estoy
-- esperando que el evento termine, entonces la próxima persona —puedo ser
-- yo u otra— cuando decida facturar, la factura está lista, llegar y
-- pinchar no más"*. Hasta ese día lo aprobado en «Facturar seleccionados»
-- vivía solo mientras la ventana estaba abierta.
--
-- `facturas_aprobadas`: el documento de un evento tal como se aprobó (el
-- pedido completo: receptor, líneas, referencias, condición de pago), quién
-- lo aprobó y cuándo. Uno por evento, o uno por OC si el evento va en una
-- factura por OC (`oc_id`). No es un documento tributario: nada va al SII
-- hasta que alguien aprieta «Facturar», y ahí el motor lo revisa de nuevo.
-- Se borra al emitirse, al corregirse y con su evento.
--
-- Datos de cada empresa, con company_id: RLS sin políticas, nada para anon
-- ni authenticated; solo el motor (service_role). Se corre a mano en
-- Supabase, en el laboratorio y en producción, ANTES de que llegue el motor
-- que la lee. Idempotente.
--
-- Aplicada en el laboratorio y en producción el 11-11-2026.

create table if not exists public.facturas_aprobadas (
  id bigint generated always as identity primary key,
  company_id bigint not null references public.companies(id) on delete cascade,
  quotation_id uuid not null
    references public.quotations(id) on delete cascade,
  -- La OC de esta factura cuando el evento va en una por OC; si no, nulo.
  oc_id bigint references public.ordenes_de_compra(id) on delete cascade,
  -- Lo que se emitirá tal cual (`DtePedido`).
  pedida jsonb not null,
  -- Id de SESIÓN, sin llave, y el nombre congelado al aprobar.
  aprobada_por uuid,
  aprobada_por_nombre text not null
    check (char_length(aprobada_por_nombre) between 1 and 60),
  created_at timestamptz not null default now()
);

-- Una sola por evento (o por OC del evento).
create unique index if not exists ux_facturas_aprobadas_evento
  on public.facturas_aprobadas (quotation_id, coalesce(oc_id, 0));
create index if not exists idx_facturas_aprobadas_empresa
  on public.facturas_aprobadas (company_id);

comment on table public.facturas_aprobadas is
  'El documento de un evento aprobado en «Facturar seleccionados» y guardado para emitirlo después (doc 19 §9.48). No es un documento tributario.';

alter table public.facturas_aprobadas enable row level security;
revoke all on public.facturas_aprobadas from anon, authenticated;
grant select, insert, update, delete on public.facturas_aprobadas to service_role;
revoke truncate on public.facturas_aprobadas from service_role;
