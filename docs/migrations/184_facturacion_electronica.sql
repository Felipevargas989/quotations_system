-- ============================================================
-- 184 · FACTURACIÓN ELECTRÓNICA, PASO 1: LOS DATOS (04-11-2026)
-- ============================================================
-- Doc 19 §9.9, paso 1. Felipe, 04-11: "nosotros facturamos a través de
-- facturación.cl (…) Nuestra dificultad (…) es integrarnos bien a la API
-- de facturación.cl". Y antes: "Cuando una factura se anule, debería
-- quedar anulada y también debería quedar como vinculada a su crédito,
-- cosa de poder ver cuál va con cuál".
--
-- Tres cosas:
--  1. `clients`: los datos de facturación del receptor (RUT, razón
--     social, giro, dirección, comuna, ciudad y correos) y las
--     referencias que exige cada cliente (CCU: la OC y la nota de
--     pedido). Los largos máximos son los del archivo de facturacion.cl
--     y los cuida el motor. `address` es un dato muerto y no se reusa.
--  2. `ordenes_de_compra`: las OC de cada evento, con su N°, fecha,
--     detalle y montos. El PDF sigue en Documentos (`event_documents`,
--     categoría `ordenes_compra`); acá va el vínculo.
--  3. `documentos_tributarios`: cada boleta, factura y nota, con lo que
--     se mandó y lo que respondió facturacion.cl. La cadena de anulación
--     va en `modifica_id`: la nota de crédito apunta a la factura que
--     anula o rebaja, y la nota de débito a la nota de crédito que anula.
--
-- Un documento tributario no se borra nunca: se anula con otro (L6). Por
-- eso `documentos_tributarios` apunta a la cotización y a la OC SIN
-- cascada, y el motor no tiene permiso de DELETE sobre ella. Una
-- cotización con documentos no se puede eliminar: la guardia
-- `QuotationsRepository.assertDeletable` lo dice con palabras. Las OC
-- sí se van con su cotización.
--
-- Cerradas a la llave pública, como la 180 a la 182: solo el motor, que
-- filtra por company_id. Idempotente. Se aplica primero en el
-- laboratorio y después en producción, ANTES del motor que la usa (la
-- guardia de borrado ya cuenta `documentos_tributarios`). Número
-- reservado el 04-11, avisado a las sesiones de Oportunidades y BelIA.
-- ============================================================

-- 1 · Los datos de facturación del cliente ---------------------------------

alter table public.clients
  add column if not exists rut text,
  add column if not exists razon_social text,
  add column if not exists giro text,
  add column if not exists direccion_facturacion text,
  add column if not exists comuna text,
  add column if not exists ciudad text,
  -- Uno o varios, separados por coma: facturacion.cl le manda el
  -- documento a todos (hasta 200 caracteres en su archivo).
  add column if not exists correo_facturacion text,
  -- Los códigos de referencia que el cliente exige en su factura: '801'
  -- (orden de compra), '802' (nota de pedido), '803' (contrato), 'HES'…
  -- La lista vive en el motor (`facturacion/referencias.ts`).
  add column if not exists referencias_exigidas text[] not null default '{}';

-- Limpio, como en people (migración 68): sin puntos, con guion y la K
-- mayúscula. El dígito verificador lo revisa el motor.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'clients_rut_chk'
  ) then
    alter table public.clients
      add constraint clients_rut_chk
      check (rut is null or rut ~ '^[0-9]{7,8}-[0-9K]$');
  end if;
end $$;

-- 2 · Las órdenes de compra ------------------------------------------------

create table if not exists public.ordenes_de_compra (
  id bigint generated always as identity primary key,
  company_id bigint not null references public.companies(id) on delete cascade,
  quotation_id uuid not null references public.quotations(id) on delete cascade,
  -- El N° tal como lo trae la OC. Va en la referencia del documento, y
  -- el SII admite ahí hasta 18 letras o números (FolioRef).
  numero text not null check (char_length(numero) between 1 and 18),
  fecha date not null,
  -- El detalle que va en la factura: con OC, manda la OC (E1).
  descripcion text,
  -- Los montos de la misma OC (L17): el total siempre; el neto y el IVA
  -- si los trae. En pesos, sin decimales.
  neto bigint check (neto is null or neto >= 0),
  iva bigint check (iva is null or iva >= 0),
  total bigint not null check (total > 0),
  -- De dónde salió: escrita a mano, bajada de Mercado Público o leída del
  -- PDF por BelIA y confirmada por la persona.
  origen text not null default 'manual'
    check (origen in ('manual', 'mercado_publico', 'pdf')),
  -- El PDF en Documentos, si lo hay.
  documento_id bigint references public.event_documents(id) on delete set null,
  -- El id de la SESIÓN (`user.id`, el de auth), sin llave, como en la 180.
  creado_por uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- La misma OC no se carga dos veces en el mismo evento.
create unique index if not exists ordenes_de_compra_numero_uniq
  on public.ordenes_de_compra (company_id, quotation_id, numero);

alter table public.ordenes_de_compra enable row level security;
revoke all on public.ordenes_de_compra from anon, authenticated;
grant select, insert, update, delete on public.ordenes_de_compra
  to service_role;
grant usage, select on sequence public.ordenes_de_compra_id_seq
  to service_role;

-- 3 · Los documentos tributarios -------------------------------------------

create table if not exists public.documentos_tributarios (
  id bigint generated always as identity primary key,
  -- Sin cascada: los documentos tributarios no se borran (L6).
  company_id bigint not null references public.companies(id),
  -- 33 factura, 34 factura exenta, 39 boleta, 41 boleta exenta,
  -- 56 nota de débito y 61 nota de crédito.
  tipo smallint not null check (tipo in (33, 34, 39, 41, 56, 61)),
  -- Dónde se emitió: 'simulado' (pasos 1 a 4 del doc 19: no sale nada),
  -- 'prueba' (el ambiente de certificación de facturacion.cl) o
  -- 'produccion'. Así un folio de prueba no choca con uno de verdad.
  ambiente text not null
    check (ambiente in ('simulado', 'prueba', 'produccion')),
  -- Lo pone facturacion.cl (en la boleta se manda 0 y vuelve asignado).
  -- Nulo hasta que responde.
  folio bigint,
  fecha_emision date,
  -- borrador: armado, sin mandar.
  -- enviando: se está mandando a facturacion.cl.
  -- emitido: facturacion.cl respondió con su folio.
  -- por_confirmar: se cortó sin saber si quedó (L5). Se comprueba; nunca
  --   se reintenta solo.
  -- rechazado: facturacion.cl dijo que no. Se corrige y se manda de nuevo.
  -- «Anulado» no es un estado: sale de la cadena (doc 19 §9.5).
  estado text not null default 'borrador'
    check (estado in ('borrador', 'enviando', 'emitido', 'por_confirmar', 'rechazado')),
  -- Una por documento, para que un envío repetido no se duplique (como
  -- el `salesId` de Bsale).
  clave_emision uuid not null default gen_random_uuid(),
  -- El receptor TAL COMO SE MANDÓ (rut, razón social, giro, dirección,
  -- comuna, ciudad y correo): si después cambia la ficha del cliente, el
  -- documento no cambia.
  receptor jsonb not null default '{}'::jsonb,
  -- Las líneas del detalle y las referencias (la OC 801, la nota de
  -- pedido 802, el documento que modifica…), como se mandaron.
  detalle jsonb not null default '[]'::jsonb,
  referencias jsonb not null default '[]'::jsonb,
  -- En pesos, sin decimales: total = neto + exento + IVA.
  neto bigint not null default 0 check (neto >= 0),
  exento bigint not null default 0 check (exento >= 0),
  tasa_iva smallint not null default 19,
  iva bigint not null default 0 check (iva >= 0),
  total bigint not null check (total >= 0),
  -- La cotización y la OC contra las que se factura (E4: queda el
  -- registro). Sin cascada, por lo mismo de arriba.
  quotation_id uuid references public.quotations(id),
  orden_de_compra_id bigint references public.ordenes_de_compra(id),
  -- El % de la OC o del evento, si se facturó por porcentaje (E4). Nulo
  -- si se facturó por un monto.
  porcentaje numeric(5, 2)
    check (porcentaje is null or (porcentaje > 0 and porcentaje <= 100)),
  -- La cadena de anulación: el documento que esta nota anula, rebaja o
  -- corrige, y con qué código del SII (1 anula, 2 corrige texto, 3
  -- corrige montos). `modifica_id` queda nulo solo si la nota modifica un
  -- documento emitido fuera de Eventia (su referencia va en
  -- `referencias`).
  modifica_id bigint references public.documentos_tributarios(id),
  codigo_referencia smallint check (codigo_referencia in (1, 2, 3)),
  -- Para auditoría: el archivo que se mandó y lo que respondió.
  archivo_enviado text,
  respuesta jsonb,
  error text,
  -- La copia del PDF en el balde privado (c<empresa>/…) y los enlaces de
  -- facturacion.cl.
  pdf_path text,
  url_original text,
  url_cedible text,
  -- Ids de SESIÓN, sin llave, como en la 180.
  creado_por uuid,
  emitido_por uuid,
  emitido_en timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Solo las notas modifican un documento, y toda nota dice cómo.
  constraint documentos_tributarios_cadena_chk check (
    (modifica_id is null or tipo in (56, 61))
    and ((tipo in (56, 61)) = (codigo_referencia is not null))
  )
);

-- El folio es único por empresa, ambiente y tipo, como en el SII.
create unique index if not exists documentos_tributarios_folio_uniq
  on public.documentos_tributarios (company_id, ambiente, tipo, folio)
  where folio is not null;

create unique index if not exists documentos_tributarios_clave_uniq
  on public.documentos_tributarios (clave_emision);

-- Un solo envío a la vez por cotización (doc 19 §5.3, los candados).
create unique index if not exists documentos_tributarios_un_envio_uniq
  on public.documentos_tributarios (quotation_id)
  where estado = 'enviando' and quotation_id is not null;

create index if not exists idx_documentos_tributarios_empresa
  on public.documentos_tributarios (company_id, created_at desc);
create index if not exists idx_documentos_tributarios_cotizacion
  on public.documentos_tributarios (quotation_id)
  where quotation_id is not null;
create index if not exists idx_documentos_tributarios_oc
  on public.documentos_tributarios (orden_de_compra_id)
  where orden_de_compra_id is not null;
create index if not exists idx_documentos_tributarios_modifica
  on public.documentos_tributarios (modifica_id)
  where modifica_id is not null;

alter table public.documentos_tributarios enable row level security;
revoke all on public.documentos_tributarios from anon, authenticated;
-- Sin DELETE, a propósito: ni un error del motor puede borrar un
-- documento tributario.
grant select, insert, update on public.documentos_tributarios
  to service_role;
grant usage, select on sequence public.documentos_tributarios_id_seq
  to service_role;

-- ============================================================
-- REVERSA (solo mientras no haya documentos de verdad):
--   drop table if exists public.documentos_tributarios;
--   drop table if exists public.ordenes_de_compra;
--   alter table public.clients drop constraint if exists clients_rut_chk;
--   alter table public.clients
--     drop column if exists referencias_exigidas,
--     drop column if exists correo_facturacion,
--     drop column if exists ciudad,
--     drop column if exists comuna,
--     drop column if exists direccion_facturacion,
--     drop column if exists giro,
--     drop column if exists razon_social,
--     drop column if exists rut;
-- ============================================================
