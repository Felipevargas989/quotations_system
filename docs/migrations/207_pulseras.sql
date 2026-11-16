-- 207 · LAS PULSERAS DE RECEPCIÓN (doc 19 §9.49)
--
-- Felipe, 16-11-2026: *"llevar un control de las pulseras en donde paso 100
-- u otra cantidad de pulseras a recepción y llevar un control de stock para
-- saber que lo que se ha vendido es lo que se ha cobrado"*; y *"¿no será
-- mejor que cada ítem del tarifario le pueda cliquear un "usa ticket" y de
-- ahí se vinculen?"*. Aprobado: *"probemos así"*.
--
-- - `tarifario_de_boletas.usa_pulsera`: el interruptor «Usa pulsera» de cada
--   ítem. Cada unidad vendida de un ítem prendido es una pulsera. Parte
--   prendido en los ítems cuyo nombre dice «ticket» (en producción, empresa
--   1: 5 de 30, todos «Ticket diario…»); desde ahí el sistema mira el
--   interruptor, nunca el nombre.
-- - `entregas_de_pulseras`: cuántas se le pasan a recepción, cuándo y quién
--   lo anotó. Sin devoluciones ni ajustes por ahora (Felipe: «probemos así»).
-- - `turnos_de_caja.pulseras_contadas`: cuántas le quedan a recepción al
--   cerrar la caja, contadas a ciegas. Nulo en los cierres de antes y en las
--   empresas sin ítems con pulsera: nulo no es cero.
--
-- Datos de cada empresa, con company_id: RLS sin políticas, nada para anon
-- ni authenticated; solo el motor (service_role), sin borrar. Se corre a
-- mano en Supabase, en el laboratorio y en producción, ANTES de que llegue
-- el motor que la lee (el tarifario ya pide la columna nueva). Idempotente.

alter table public.tarifario_de_boletas
  add column if not exists usa_pulsera boolean not null default false;

-- Solo la primera vez (si nadie lo ha prendido todavía en esa empresa).
update public.tarifario_de_boletas t
   set usa_pulsera = true
 where t.nombre ilike '%ticket%'
   and not exists (
     select 1 from public.tarifario_de_boletas o
      where o.company_id = t.company_id and o.usa_pulsera
   );

create table if not exists public.entregas_de_pulseras (
  id bigint generated always as identity primary key,
  company_id bigint not null references public.companies(id) on delete cascade,
  cantidad integer not null check (cantidad between 1 and 100000),
  -- A quién se entregan. Por ahora siempre recepción.
  para text not null default 'recepcion' check (para in ('recepcion')),
  entregada_por uuid,
  entregada_por_nombre text not null
    check (char_length(entregada_por_nombre) between 1 and 60),
  created_at timestamptz not null default now()
);

create index if not exists idx_entregas_de_pulseras_empresa
  on public.entregas_de_pulseras (company_id, created_at);

comment on table public.entregas_de_pulseras is
  'Las pulseras que se le pasan a recepción (doc 19 §9.49): entregadas − vendidas = deberían quedar, contra lo contado al cerrar la caja.';

alter table public.turnos_de_caja
  add column if not exists pulseras_contadas integer
  check (pulseras_contadas is null or pulseras_contadas >= 0);

alter table public.entregas_de_pulseras enable row level security;
revoke all on public.entregas_de_pulseras from anon, authenticated;
grant select, insert on public.entregas_de_pulseras to service_role;
-- Producción le da todo a service_role en cada tabla nueva: sin editar ni borrar.
revoke update, delete, truncate on public.entregas_de_pulseras from service_role;
