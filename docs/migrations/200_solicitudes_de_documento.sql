-- 200 · LAS SOLICITUDES DE BOLETA Y FACTURA DE RECEPCIÓN (doc 19 §9.45)
--
-- Felipe, 09-11-2026: recepción deja de emitir al SII. La boleta y la
-- factura al contado que arma recepción quedan como una SOLICITUD con todo
-- lo necesario para emitirla después; quien tiene «Aprobar y emitir
-- solicitudes» revisa que nada se boletee dos veces y la emite, o la
-- rechaza (una rechazada nunca va al SII). Su porqué: que recepción no
-- pueda duplicar algo ya boleteado.
--
-- - `solicitudes_de_documento`: lo que se pide (las líneas con su
--   `tarifario_id`, el medio de pago, el correo o «la imprimo», quién la
--   mandó y con qué cargo), el turno de la caja de recepción al que entró
--   (la plata entró en ese turno, se emita o no) y cómo se resolvió (quién,
--   cuándo, el motivo del rechazo y el documento emitido).
-- - `correcciones_de_caja.solicitud_id`: la revisión de la caja también
--   corrige el medio de pago de una solicitud del turno (pendiente o
--   rechazada, que cuentan en la caja).
--
-- Datos de cada empresa, con company_id: RLS sin políticas, nada para anon
-- ni authenticated; solo el motor (service_role), sin borrar. Se corre a
-- mano en Supabase, en el laboratorio y en producción, ANTES de que llegue
-- el motor que la lee. Idempotente.

create table if not exists public.solicitudes_de_documento (
  id bigint generated always as identity primary key,
  company_id bigint not null references public.companies(id) on delete cascade,
  -- 39 boleta, 33 factura (al contado).
  tipo integer not null check (tipo in (33, 39)),
  -- pendiente → emitiendo (lo toma quien aprueba) → aprobada; o rechazada.
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'emitiendo', 'aprobada', 'rechazada')),
  -- Lo que se emitirá tal cual: las líneas con el precio del tarifario del
  -- momento en que se cobró, el correo y la cabaña (boleta), o el pedido de
  -- la factura ya con las líneas del tarifario.
  pedido jsonb not null,
  -- Las líneas como las de `documentos_tributarios.detalle`, para el cuadre
  -- de la caja y «Lo vendido».
  detalle jsonb not null default '[]'::jsonb,
  total bigint not null check (total > 0),
  medio_de_pago text not null
    check (medio_de_pago in ('efectivo', 'debito', 'credito', 'transferencia')),
  correo text,
  imprimir boolean not null default false,
  -- A quién va (la razón social de la factura; la cabaña de la boleta).
  para text check (para is null or char_length(para) <= 100),
  turno_de_caja_id bigint not null references public.turnos_de_caja(id),
  solicitada_por uuid,
  solicitada_por_nombre text not null
    check (char_length(solicitada_por_nombre) between 1 and 60),
  solicitada_por_cargo text not null,
  created_at timestamptz not null default now(),
  resuelta_por uuid,
  resuelta_por_nombre text,
  resuelta_en timestamptz,
  motivo_rechazo text
    check (motivo_rechazo is null or char_length(motivo_rechazo) <= 300),
  -- Lo último que respondió la emisión si no salió (vuelve a pendiente).
  error text,
  documento_id bigint references public.documentos_tributarios(id),
  -- Aprobada: con su documento. Rechazada: sin documento.
  constraint solicitudes_aprobada_con_documento
    check (estado <> 'aprobada' or documento_id is not null),
  constraint solicitudes_rechazada_sin_documento
    check (estado <> 'rechazada' or documento_id is null)
);

create index if not exists idx_solicitudes_de_documento_estado
  on public.solicitudes_de_documento (company_id, estado, created_at desc);
create index if not exists idx_solicitudes_de_documento_turno
  on public.solicitudes_de_documento (turno_de_caja_id);
create index if not exists idx_solicitudes_de_documento_fecha
  on public.solicitudes_de_documento (company_id, created_at);

comment on table public.solicitudes_de_documento is
  'Las boletas y facturas al contado que pide recepción (doc 19 §9.45): las emite quien tiene «Aprobar y emitir solicitudes», o las rechaza. Cuentan en su turno de caja se emitan o no.';

-- La revisión de la caja corrige también el medio de una solicitud.
alter table public.correcciones_de_caja
  alter column documento_id drop not null;
alter table public.correcciones_de_caja
  add column if not exists solicitud_id bigint
  references public.solicitudes_de_documento(id) on delete cascade;
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'correcciones_de_caja_documento_o_solicitud'
  ) then
    alter table public.correcciones_de_caja
      add constraint correcciones_de_caja_documento_o_solicitud
      check ((documento_id is null) <> (solicitud_id is null));
  end if;
end $$;

alter table public.solicitudes_de_documento enable row level security;
revoke all on public.solicitudes_de_documento from anon, authenticated;
grant select, insert, update on public.solicitudes_de_documento to service_role;
-- Producción le da todo a service_role en cada tabla nueva: sin borrar.
revoke delete, truncate on public.solicitudes_de_documento from service_role;
