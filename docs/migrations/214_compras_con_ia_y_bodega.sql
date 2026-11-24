-- 214 · COMPRAS CON IA Y BODEGA (doc 25, 23-11-2026)
--
-- Felipe, 23-11: sacar el modal donde se escribían a mano la cantidad y el
-- monto de cada compra. Ahora se suben las facturas, guías o pantallazos;
-- la IA lee cada línea, la asocia a un insumo y propone el COSTO nuevo;
-- una persona lo revisa y le da check. Además, una bodega simple.
--
-- Tres piezas:
--   1. insumo_equivalentes: los nombres con que un insumo llega en una
--      compra. 'corte' (carne a la olla = punta paleta, sobrecostilla…),
--      'marca' (aceite maravilla = Pedrito, Juanito) y 'texto' (lo que la
--      IA aprendió de una línea ya asociada, por proveedor).
--   2. compras_subidas + compras_subidas_lineas: cada documento subido y
--      lo que la IA leyó de él, con el costo de antes y el propuesto.
--   3. insumo_movimientos: la bodega. 'tengo' fija el conteo; 'compra'
--      suma (solo al aplicar una línea con check); 'saque' resta. Lo que
--      consumen los eventos realizados NO se guarda: se calcula con la
--      receta (la misma cuenta de Compras), así desmarcar un evento
--      realizado corrige la bodega sola.
--
-- No toca ninguna tabla existente. Aplicar ANTES de publicar el motor.

create table if not exists public.insumo_equivalentes (
  id bigint generated always as identity primary key,
  company_id bigint not null,
  supply_id bigint not null references public.supplies(id) on delete cascade,
  nombre text not null,
  nombre_normal text not null,
  tipo text not null check (tipo in ('corte', 'marca', 'texto')),
  supplier_id bigint references public.suppliers(id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index if not exists insumo_equivalentes_unico
  on public.insumo_equivalentes (company_id, nombre_normal, coalesce(supplier_id, 0));
create index if not exists insumo_equivalentes_insumo
  on public.insumo_equivalentes (company_id, supply_id);

comment on table public.insumo_equivalentes is
  'Doc 25: nombres con que un insumo llega en una compra (corte equivalente, marca o texto aprendido).';

create table if not exists public.compras_subidas (
  id bigint generated always as identity primary key,
  company_id bigint not null,
  archivo text not null,
  nombre_archivo text,
  supplier_id bigint references public.suppliers(id) on delete set null,
  proveedor_texto text,
  tipo_documento text,
  numero text,
  fecha date,
  con_iva boolean not null default false,
  estado text not null default 'por_revisar'
    check (estado in ('por_revisar', 'aplicada', 'descartada')),
  costo_ia_usd numeric,
  creado_por uuid,
  created_at timestamptz not null default now(),
  aplicada_at timestamptz
);
create index if not exists compras_subidas_empresa
  on public.compras_subidas (company_id, created_at desc);

comment on table public.compras_subidas is
  'Doc 25: factura, boleta, guía o pantallazo de una compra, leído por la IA.';

create table if not exists public.compras_subidas_lineas (
  id bigint generated always as identity primary key,
  company_id bigint not null,
  compra_id bigint not null references public.compras_subidas(id) on delete cascade,
  orden int not null default 0,
  texto text not null,
  cantidad_texto text,
  total numeric,
  supply_id bigint references public.supplies(id) on delete set null,
  equivalente text,
  -- Cuando la IA duda: hasta 3 insumos posibles para «¿Cuál es?».
  posibles bigint[],
  cantidad_base numeric,
  costo_base numeric,
  costo_antes numeric,
  estado text not null default 'propuesta'
    check (estado in ('propuesta', 'aplicada', 'no_es_insumo')),
  aplicada_at timestamptz
);
create index if not exists compras_subidas_lineas_compra
  on public.compras_subidas_lineas (compra_id, orden);
create index if not exists compras_subidas_lineas_insumo
  on public.compras_subidas_lineas (company_id, supply_id);

comment on column public.compras_subidas_lineas.costo_base is
  'Costo por unidad base del insumo (kg, L o u) que propone la línea: total ÷ cantidad_base.';

create table if not exists public.insumo_movimientos (
  id bigint generated always as identity primary key,
  company_id bigint not null,
  supply_id bigint not null references public.supplies(id) on delete cascade,
  tipo text not null check (tipo in ('tengo', 'compra', 'saque')),
  cantidad_base numeric not null check (cantidad_base >= 0),
  linea_id bigint references public.compras_subidas_lineas(id) on delete set null,
  nota text,
  creado_por uuid,
  created_at timestamptz not null default now()
);
create index if not exists insumo_movimientos_insumo
  on public.insumo_movimientos (company_id, supply_id, created_at);

comment on table public.insumo_movimientos is
  'Doc 25: la bodega. tengo = conteo (fija), compra = suma, saque = resta. Los eventos realizados restan por receta, calculado.';

-- Cerradas al navegador: todo pasa por el motor (tablas abiertas y el
-- grifo, PR #109).
alter table public.insumo_equivalentes enable row level security;
alter table public.compras_subidas enable row level security;
alter table public.compras_subidas_lineas enable row level security;
alter table public.insumo_movimientos enable row level security;
revoke all on public.insumo_equivalentes from anon, authenticated;
revoke all on public.compras_subidas from anon, authenticated;
revoke all on public.compras_subidas_lineas from anon, authenticated;
revoke all on public.insumo_movimientos from anon, authenticated;
-- El motor entra con service_role: en las bases sin privilegios por
-- defecto (el laboratorio) hay que dárselos a mano (medido el 23-11).
grant select, insert, update, delete on
  public.insumo_equivalentes, public.compras_subidas,
  public.compras_subidas_lineas, public.insumo_movimientos
  to service_role;
grant usage, select on sequence
  public.insumo_equivalentes_id_seq, public.compras_subidas_id_seq,
  public.compras_subidas_lineas_id_seq, public.insumo_movimientos_id_seq
  to service_role;
notify pgrst, 'reload schema';
