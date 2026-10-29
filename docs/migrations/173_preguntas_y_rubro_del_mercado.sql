-- ============================================================
-- 173 · LAS PREGUNTAS CON NOMBRE, EL DICCIONARIO Y EL RUBRO AL PREGUNTAR
--       (29-10-2026)
-- ============================================================
-- Decisión 109 del doc 17, mejoras 5 y 6. Felipe: «una base de datos fácil
-- y ágil de preguntar».
--   5. Las preguntas de siempre, con nombre en español: quién gana, cuánto
--      compra un organismo, la ficha de un proveedor, las categorías y el
--      control de calidad. Y un diccionario, mercado_diccionario, con lo que
--      es cada tabla, columna y pregunta del mercado, escrito en la base.
--   6. El rubro se elige al preguntar: cada licitación trae sus categorías
--      de ChileCompra (rubros) y cada empresa puede tener las suyas
--      (oportunidades_config.categorias). Sin categorías vale la marca «del
--      rubro» de siempre, la de eventos y alimentación: Valle del Sol no
--      cambia hasta que Felipe elija las suyas.
-- Requiere la 172. Datos públicos, solo el motor (service_role).
-- Idempotente; primero en el laboratorio y después en producción.
-- ============================================================

-- ------------------------------------------------------------
-- 1. El rubro al preguntar
-- ------------------------------------------------------------
create index if not exists idx_mercado_compras_rubros
  on public.mercado_compras using gin (rubros);

alter table public.oportunidades_config
  add column if not exists categorias text[];

-- ------------------------------------------------------------
-- 2. Las preguntas con nombre
-- ------------------------------------------------------------
create or replace function public.mercado_categorias(p_texto text default null)
returns table (categoria text, licitaciones bigint, del_rubro bigint)
language sql stable
set search_path = public
as $$
  select c, count(*), count(*) filter (where m.del_rubro)
  from mercado_compras m, unnest(m.rubros) c
  where m.tipo = 'licitacion'
    and (p_texto is null
      or mercado_clave(c) like '%' || mercado_clave(p_texto) || '%')
  group by c
  order by count(*) desc
$$;

create or replace function public.mercado_buscar_comprador(p_texto text)
returns table (organismo_codigo text, organismo text, regiones text,
  procesos bigint, monto numeric)
language sql stable
set search_path = public
as $$
  select g.organismo_codigo, max(g.organismo),
    string_agg(distinct r.corto, ', '),
    sum(g.procesos), sum(g.monto_adjudicado)
  from mercado_gasto_por_comprador_mes g
  left join mercado_regiones r on r.codigo = g.region_codigo
  where g.organismo_codigo is not null
    and mercado_clave(g.organismo) like '%' || mercado_clave(p_texto) || '%'
    and g.mes >= (date_trunc('month', current_date) - interval '12 months')::date
  group by g.organismo_codigo
  order by sum(g.monto_adjudicado) desc
  limit 20
$$;

create or replace function public.mercado_gasto_de(
  p_organismo text,
  p_desde date default (date_trunc('month', current_date) - interval '12 months')::date,
  p_hasta date default current_date)
returns table (mes date, tipo text, del_rubro boolean, procesos bigint,
  adjudicados bigint, monto numeric)
language sql stable
set search_path = public
as $$
  select g.mes, g.tipo, g.del_rubro, sum(g.procesos), sum(g.adjudicados),
    sum(g.monto_adjudicado)
  from mercado_gasto_por_comprador_mes g
  where (g.organismo_codigo = p_organismo or g.comprador = p_organismo)
    and g.mes between p_desde and p_hasta
  group by g.mes, g.tipo, g.del_rubro
  order by g.mes, g.tipo, g.del_rubro desc
$$;

create or replace function public.mercado_quien_gana(
  p_regiones smallint[] default null,
  p_desde date default (date_trunc('month', current_date) - interval '12 months')::date,
  p_hasta date default current_date,
  p_del_rubro boolean default true,
  p_limite integer default 20)
returns table (rut text, proveedor text, ganadas bigint, ofertas bigint,
  monto numeric)
language sql stable
set search_path = public
as $$
  select g.rut, max(g.proveedor), sum(g.ganadas), sum(g.ofertas),
    sum(g.monto_ganado)
  from mercado_ganadores_por_mes g
  where (p_regiones is null or g.region_codigo = any (p_regiones))
    and g.mes between p_desde and p_hasta
    and (p_del_rubro is null or g.del_rubro = p_del_rubro)
  group by g.rut
  order by sum(g.monto_ganado) desc
  limit p_limite
$$;

create or replace function public.mercado_proveedor(p_rut text)
returns table (anio integer, region text, tipo text, del_rubro boolean,
  ofertas bigint, ganadas bigint, monto numeric)
language sql stable
set search_path = public
as $$
  select extract(year from g.mes)::integer, coalesce(r.corto, 'Sin región'),
    g.tipo, g.del_rubro, sum(g.ofertas), sum(g.ganadas), sum(g.monto_ganado)
  from mercado_ganadores_por_mes g
  left join mercado_regiones r on r.codigo = g.region_codigo
  where g.rut = mercado_rut(p_rut)
  group by 1, 2, 3, 4
  order by 1 desc, 7 desc
$$;

create or replace function public.mercado_calidad()
returns table (fuente text, mes date, resumida_en timestamptz,
  procesos integer, sin_region integer, sin_comuna integer, ofertas integer,
  rut_no_valido integer, ganadoras_rut_no_valido integer)
language sql stable
set search_path = public
as $$
  select c.fuente, c.mes, c.resumida_en,
    (c.calidad->>'procesos')::integer, (c.calidad->>'sin_region')::integer,
    (c.calidad->>'sin_comuna')::integer, (c.calidad->>'ofertas')::integer,
    (c.calidad->>'rut_no_valido')::integer,
    (c.calidad->>'ganadoras_rut_no_valido')::integer
  from mercado_cargas c
  where c.calidad is not null
  order by c.mes desc, c.fuente
$$;

-- ------------------------------------------------------------
-- 3. El diccionario: lo que dicen los comentarios de la base
-- ------------------------------------------------------------
create or replace view public.mercado_diccionario
with (security_invoker = true) as
select c.relname::text as nombre,
  case c.relkind when 'v' then 'vista' else 'tabla' end as clase,
  null::text as detalle,
  obj_description(c.oid, 'pg_class') as explicacion
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('r', 'v')
  and c.relname like 'mercado\_%'
union all
select c.relname::text, 'columna', a.attname::text,
  col_description(c.oid, a.attnum)
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
join pg_attribute a on a.attrelid = c.oid and a.attnum > 0
  and not a.attisdropped
where n.nspname = 'public' and c.relkind in ('r', 'v')
  and c.relname like 'mercado\_%'
  and col_description(c.oid, a.attnum) is not null
union all
select p.proname::text, 'pregunta', pg_get_function_identity_arguments(p.oid),
  obj_description(p.oid, 'pg_proc')
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname like 'mercado\_%';

-- ------------------------------------------------------------
-- 4. Qué es cada cosa
-- ------------------------------------------------------------
comment on table public.mercado_licitaciones is
  'Cada licitación de todo Chile de los archivos de ChileCompra, tal como llega; una fila por licitación (decisión 101).';
comment on column public.mercado_licitaciones.del_rubro is
  'Si es de eventos, banquetería, alimentación o alojamiento, por el nombre o por el código ONU de lo que se compra (decisión 101).';
comment on column public.mercado_licitaciones.rubros is
  'Las categorías de ChileCompra de lo que se compra, hasta 5.';
comment on column public.mercado_licitaciones.monto_adjudicado is
  'Lo adjudicado en pesos: precio unitario por cantidad adjudicada, sin pasar de lo ofertado.';
comment on table public.mercado_ofertas is
  'Cada proveedor que ofertó en una licitación, con lo ofertado, lo adjudicado y si ganó (decisión 101). El RUT viene como en el archivo; el limpio está en la capa resumida.';
comment on table public.mercado_compras_agiles is
  'Las compras ágiles del rubro de los archivos de ChileCompra, con quién fue elegido (decisión 101).';
comment on table public.mercado_cotizaciones is
  'Cada cotización de una compra ágil del rubro (decisión 101).';
comment on table public.mercado_compras_agiles_totales is
  'Todas las compras ágiles de Chile en totales por unidad de compra y mes, también solo las del rubro (decisión 101).';
comment on table public.mercado_cargas is
  'Qué mes de qué archivo de ChileCompra está cargado, con la fecha del archivo para no repetirlo y, desde la 172, cuándo se resumió y su control de calidad.';
comment on view public.mercado_licitaciones_con_ganadores is
  'Cada licitación con sus ganadores, armada al leer (decisión 106). Desde la 109 se lee mercado_compras, que ya los trae; queda para cuando la capa resumida está vacía.';
comment on column public.mercado_compras.ganadores is
  '[{rut, nombre, cantidad, monto_unitario}]: quién ganó y cuánto, solo con RUT chileno válido.';
comment on column public.mercado_compras.monto is
  'El monto estimado de la licitación o el disponible de la compra ágil.';
comment on column public.mercado_compras.monto_adjudicado is
  'Lo que se llevaron los ganadores, en pesos.';
comment on column public.mercado_compras.oferentes is
  'Cuántas ofertas o cotizaciones llegaron.';
comment on column public.mercado_compras.region_codigo is
  'El código oficial de la región (mercado_regiones).';
comment on column public.mercado_compras.cut is
  'El código oficial de la comuna (mercado_comunas); en la compra ágil, la de su unidad de compra.';
comment on column public.mercado_compras.del_rubro is
  'Si es de eventos, banquetería, alimentación o alojamiento: la marca de la 101.';
comment on column public.mercado_compras.rubros is
  'Las categorías de ChileCompra; solo en licitaciones.';
comment on column public.oportunidades_config.categorias is
  'Las categorías de ChileCompra del rubro de la empresa, como «RESTAURANTES Y CATERING»; null = la marca del_rubro de siempre (decisión 109).';
comment on function public.mercado_clave(text) is
  'Un nombre sin tildes, eñes ni signos, para cruzar nombres (decisión 109).';
comment on function public.mercado_rut(text) is
  'El RUT sin puntos, con guion y K mayúscula; lo que no es un RUT chileno queda como vino (decisión 109).';
comment on function public.mercado_rut_valido(text) is
  'Si es un RUT chileno con su dígito verificador correcto (decisión 109).';
comment on function public.mercado_clave_de_comuna(text) is
  'La comuna como la escribe ChileCompra, llevada al nombre del INE (decisión 109).';
comment on function public.mercado_categorias(text) is
  'Las categorías de ChileCompra con cuántas licitaciones tienen y cuántas son del rubro; con texto, solo las que lo contienen.';
comment on function public.mercado_buscar_comprador(text) is
  'Los compradores cuyo nombre contiene el texto, con lo adjudicado en los últimos 12 meses: para encontrar su código.';
comment on function public.mercado_gasto_de(text, date, date) is
  'Lo que compró un organismo mes a mes, por tipo y si es del rubro; por omisión, los últimos 12 meses.';
comment on function public.mercado_quien_gana(smallint[], date, date, boolean, integer) is
  'Los proveedores que más se adjudicaron en unas regiones (null = todo Chile) y fechas; fuera del rubro solo cuentan los que ganaron algo.';
comment on function public.mercado_proveedor(text) is
  'Lo que ofertó y ganó un proveedor, por año, región, tipo y rubro.';
comment on function public.mercado_calidad() is
  'El control de calidad de cada mes cargado.';
comment on view public.mercado_diccionario is
  'Qué es cada tabla, columna y pregunta del mercado, tal como lo dicen los comentarios de la base (decisión 109).';

-- ------------------------------------------------------------
-- 5. Permisos: solo el motor
-- ------------------------------------------------------------
revoke all on public.mercado_diccionario from anon, authenticated;
grant select on public.mercado_diccionario to service_role;

revoke execute on function public.mercado_categorias(text),
  public.mercado_buscar_comprador(text),
  public.mercado_gasto_de(text, date, date),
  public.mercado_quien_gana(smallint[], date, date, boolean, integer),
  public.mercado_proveedor(text),
  public.mercado_calidad()
  from public, anon, authenticated;
grant execute on function public.mercado_categorias(text),
  public.mercado_buscar_comprador(text),
  public.mercado_gasto_de(text, date, date),
  public.mercado_quien_gana(smallint[], date, date, boolean, integer),
  public.mercado_proveedor(text),
  public.mercado_calidad()
  to service_role;
