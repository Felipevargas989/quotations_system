-- ============================================================
-- 191 · LO YA FACTURADO FUERA DE EVENTIA (doc 19 §9.24)
--
-- Felipe, 07-11: *"lo que hay que facturar son los eventos que están
-- aceptados y de eso yo te puedo dar el check de lo que ya está
-- facturado"*. Medido ese día en producción: «Por facturar» mostraría 48
-- eventos ($265 millones), porque Eventia no sabe lo que se facturó a mano
-- en la web de facturacion.cl ni lo que se boleteó en Facto; 11 de ellos
-- ya tienen el PDF de la factura en Documentos.
--
-- `eventos_facturados_fuera`: un evento por fila, marcado con «Ya está
-- facturado» en «Por facturar». Sale de la lista y de la facturación
-- masiva; queda quién lo marcó y cuándo, y «Devolver» borra la fila. No es
-- un documento tributario: es la marca de lo que se hizo fuera.
--
-- Cerrada a la llave pública como la 184 y la 187: solo el motor, que
-- filtra por company_id. Idempotente. Va en el laboratorio primero y en
-- producción antes del motor que la usa (junto con la 184, la 187 y la
-- 189). El número 190 queda para Oportunidades (parte 3 de la decisión
-- 119).
-- ============================================================

create table if not exists public.eventos_facturados_fuera (
  quotation_id uuid primary key
    references public.quotations(id) on delete cascade,
  company_id bigint not null references public.companies(id) on delete cascade,
  -- Id de SESIÓN, sin llave, y el nombre congelado al marcar.
  marcado_por uuid,
  marcado_por_nombre text,
  created_at timestamptz not null default now()
);

create index if not exists idx_eventos_facturados_fuera_empresa
  on public.eventos_facturados_fuera (company_id);

-- Permisos ----------------------------------------------------------------

alter table public.eventos_facturados_fuera enable row level security;

revoke all on public.eventos_facturados_fuera from anon, authenticated;

grant select, insert, update, delete on public.eventos_facturados_fuera
  to service_role;

-- ============================================================
-- Reversa: drop table if exists public.eventos_facturados_fuera;
-- ============================================================
