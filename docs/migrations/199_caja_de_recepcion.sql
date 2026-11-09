-- 199 · LA CAJA DE RECEPCIÓN Y EL CIERRE CIEGO (doc 19 §9.43, sprint 2)
--
-- Felipe, 09-11-2026: *"la idea es que sea un cierre de caja ciego, donde
-- ella anote cuánto tienen en efectivo, débito, crédito y transferencia, y
-- luego Camila valide viendo qué se vendió y cuánto debería tener"*; y con
-- la maqueta, *"ok hazlo así"*.
--
-- - `turnos_de_caja`: cada vez que se abre la caja de recepción (quién la
--   abre y el sencillo inicial) hasta que se cierra con lo que declara quien
--   cierra en los cuatro medios de pago. La revisión (quién, cuándo y su
--   nota) va en la misma fila. Una sola abierta por empresa.
-- - `retiros_de_caja`: la plata que sale de la caja durante el turno, con
--   su motivo.
-- - `correcciones_de_caja`: el medio de pago que corrige la revisión en un
--   documento del turno, con el antes, el después, quién y cuándo.
-- - `documentos_tributarios.turno_de_caja_id`: el turno al que entró la
--   boleta o la factura al contado que emitió recepción.
--
-- Lo esperado no se guarda: se calcula de los documentos del turno, así una
-- corrección se ve al momento.
--
-- Datos de cada empresa, con company_id: RLS sin políticas, nada para anon
-- ni authenticated; solo el motor (service_role). Se corre a mano en
-- Supabase, en el laboratorio y en producción, ANTES de que llegue el motor
-- que la lee. Idempotente.

create table if not exists public.turnos_de_caja (
  id bigint generated always as identity primary key,
  company_id bigint not null references public.companies(id) on delete cascade,
  -- Por ahora una: la de recepción. Si mañana hay otra, se suma acá.
  caja text not null default 'recepcion' check (caja in ('recepcion')),
  abierta_por uuid,
  abierta_por_nombre text not null
    check (char_length(abierta_por_nombre) between 1 and 60),
  abierta_en timestamptz not null default now(),
  sencillo_inicial bigint not null check (sencillo_inicial >= 0),
  cerrada_por uuid,
  cerrada_por_nombre text
    check (cerrada_por_nombre is null or char_length(cerrada_por_nombre) between 1 and 60),
  cerrada_en timestamptz,
  declarado_efectivo bigint check (declarado_efectivo >= 0),
  declarado_debito bigint check (declarado_debito >= 0),
  declarado_credito bigint check (declarado_credito >= 0),
  declarado_transferencia bigint check (declarado_transferencia >= 0),
  comentario text check (comentario is null or char_length(comentario) <= 300),
  revisado_por uuid,
  revisado_por_nombre text,
  revisado_en timestamptz,
  nota_revision text
    check (nota_revision is null or char_length(nota_revision) <= 500),
  created_at timestamptz not null default now(),
  -- Cerrada: con quién cierra y sus cuatro montos.
  constraint turnos_de_caja_cierre_completo check (
    cerrada_en is null or (
      cerrada_por_nombre is not null
      and declarado_efectivo is not null
      and declarado_debito is not null
      and declarado_credito is not null
      and declarado_transferencia is not null
    )
  ),
  -- Se revisa lo cerrado.
  constraint turnos_de_caja_revisa_lo_cerrado
    check (revisado_en is null or cerrada_en is not null)
);

-- Una sola caja abierta por empresa.
create unique index if not exists turnos_de_caja_una_abierta
  on public.turnos_de_caja (company_id, caja) where cerrada_en is null;
create index if not exists idx_turnos_de_caja_empresa
  on public.turnos_de_caja (company_id, abierta_en desc);

create table if not exists public.retiros_de_caja (
  id bigint generated always as identity primary key,
  company_id bigint not null references public.companies(id) on delete cascade,
  turno_id bigint not null references public.turnos_de_caja(id) on delete cascade,
  monto bigint not null check (monto > 0),
  motivo text not null check (char_length(motivo) between 1 and 120),
  creado_por uuid,
  created_at timestamptz not null default now()
);
create index if not exists idx_retiros_de_caja_turno
  on public.retiros_de_caja (turno_id);

create table if not exists public.correcciones_de_caja (
  id bigint generated always as identity primary key,
  company_id bigint not null references public.companies(id) on delete cascade,
  turno_id bigint not null references public.turnos_de_caja(id) on delete cascade,
  documento_id bigint not null references public.documentos_tributarios(id) on delete cascade,
  medio_antes text,
  medio_despues text not null
    check (medio_despues in ('efectivo', 'debito', 'credito', 'transferencia')),
  corregido_por uuid,
  corregido_por_nombre text,
  created_at timestamptz not null default now()
);
create index if not exists idx_correcciones_de_caja_turno
  on public.correcciones_de_caja (turno_id);

alter table public.documentos_tributarios
  add column if not exists turno_de_caja_id bigint
  references public.turnos_de_caja(id);
create index if not exists idx_documentos_tributarios_turno_de_caja
  on public.documentos_tributarios (turno_de_caja_id)
  where turno_de_caja_id is not null;

comment on table public.turnos_de_caja is
  'La caja de recepción (doc 19 §9.43): de que se abre con su sencillo hasta el cierre ciego por medio de pago, y su revisión.';
comment on column public.documentos_tributarios.turno_de_caja_id is
  'El turno de la caja de recepción al que entró el documento (doc 19 §9.43).';

alter table public.turnos_de_caja enable row level security;
alter table public.retiros_de_caja enable row level security;
alter table public.correcciones_de_caja enable row level security;

revoke all on public.turnos_de_caja from anon, authenticated;
revoke all on public.retiros_de_caja from anon, authenticated;
revoke all on public.correcciones_de_caja from anon, authenticated;

grant select, insert, update on public.turnos_de_caja to service_role;
grant select, insert on public.retiros_de_caja to service_role;
grant select, insert on public.correcciones_de_caja to service_role;
