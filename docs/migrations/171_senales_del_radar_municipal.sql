-- ============================================================
-- 171 · EL RADAR MUNICIPAL: LAS SEÑALES Y LA PESTAÑA (28-10-2026)
-- ============================================================
-- Decisión 108 del doc 17, SOLO EN EL LABORATORIO. Lo que lee la pestaña
-- «Radar municipal» de Oportunidades, calculado con las compras de los
-- municipios (migración 170) y sus licitaciones (168):
--  - radar_municipios: cada municipio con su comuna y su población.
--  - radar_gasto_anual, radar_proveedores_anual y radar_meses_rubro: cuánto
--    gasta cada municipio, a quién le compra y en qué meses, por año.
--  - radar_senales: las señales de riesgo del informe «Detección de
--    anomalías en compras públicas» que se pueden calcular con estos datos,
--    en los últimos 12 meses, una fila por municipio. Las que son una
--    proporción se comparan con los demás municipios con la cerca de Tukey
--    (Q3 + 1,5 × el rango intercuartil), como propone la guía de la Open
--    Contracting Partnership que cita el informe.
--  - radar_tablero(año, regiones, ruts): todo lo de la pestaña en un JSON.
-- Una señal no es una acusación: el informe insiste en que una persona
-- revise antes de cualquier denuncia.
-- Las vistas se recalculan con radar_recalcular() después de cada carga.
-- Solo el motor (service_role) las lee. Idempotente.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Los nombres sin tildes ni signos, y la comuna de cada municipio
-- ------------------------------------------------------------
create or replace function public.radar_clave(texto text) returns text
language sql immutable as $$
  select regexp_replace(
    upper(translate(coalesce(texto, ''), 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun')),
    '[^A-Z0-9]', '', 'g')
$$;

-- «I MUNICIPALIDAD DE LA FLORIDA» → «LAFLORIDA»: el «LA» se queda, porque
-- Florida es otra comuna. Acepta el «MINICIPALIDAD» de Combarbalá.
create or replace function public.radar_comuna_del_nombre(nombre text) returns text
language sql immutable as $$
  select public.radar_clave(
    regexp_replace(coalesce(nombre, ''), '^.*M[UI]NICIPALIDAD\s+(DE\s+|DEL\s+)?', '', 'i'))
$$;

-- Un municipio, y no una corporación ni la asociación de municipios.
create or replace function public.radar_es_municipio(nombre text) returns boolean
language sql immutable as $$
  select coalesce(nombre, '') ~* 'm[ui]nicipalidad' and coalesce(nombre, '') !~* 'asociaci'
$$;

-- Una orden anulada o por anularse no es gasto.
create or replace function public.radar_anulada(estado text) returns boolean
language sql immutable as $$
  select coalesce(estado, '') ~* '(cancel|elimin|rechaz|no acept)'
$$;

-- Une cada municipio con su comuna del Censo y responde cuántos quedaron
-- sin unir. Los nombres que ChileCompra escribe distinto que el INE van
-- en la lista (medido el 28-10).
create or replace function public.radar_unir_comunas() returns integer
language plpgsql as $$
declare
  sin_comuna integer;
begin
  update public.mercado_organismos o
  set cut = p.cut
  from public.mercado_poblacion p
  where public.radar_es_municipio(o.nombre)
    and p.clave = coalesce(
      (select a.ine from (values
        ('LACALERA', 'CALERA'),
        ('LACOMUNADEELBOSQUE', 'ELBOSQUE'),
        ('LASGUAITECAS', 'GUAITECAS'),
        ('LLAYLLAY', 'LLAILLAY'),
        ('LOSALAMOSDEPTOCOMUNAL', 'LOSALAMOS'),
        ('MARCHIGUE', 'MARCHIHUE'),
        ('TORRESDELPAIN', 'TORRESDELPAINE'),
        ('PAIGUANO', 'PAIHUANO'),
        ('TREGUACO', 'TREHUACO'),
        ('CABODEHORNOSYANTARTICA', 'CABODEHORNOS')
      ) as a(chilecompra, ine)
      where a.chilecompra = public.radar_comuna_del_nombre(o.nombre)),
      public.radar_comuna_del_nombre(o.nombre))
    and o.cut is distinct from p.cut;
  select count(*) into sin_comuna
  from public.mercado_organismos
  where public.radar_es_municipio(nombre) and cut is null;
  return sin_comuna;
end $$;

-- ------------------------------------------------------------
-- 2. Las vistas (se rehacen enteras)
-- ------------------------------------------------------------
drop function if exists public.radar_tablero(integer, text[], text[]);
drop function if exists public.radar_recalcular();
drop materialized view if exists public.radar_senales;
drop materialized view if exists public.radar_meses_rubro;
drop materialized view if exists public.radar_proveedores_anual;
drop materialized view if exists public.radar_gasto_anual;
drop materialized view if exists public.radar_unidades;
drop view if exists public.radar_municipios;

create view public.radar_municipios with (security_invoker = true) as
select o.codigo as organismo_codigo, o.nombre, coalesce(p.region, o.region) as region,
  p.cut, p.comuna, p.poblacion
from public.mercado_organismos o
left join public.mercado_poblacion p on p.cut = o.cut
where public.radar_es_municipio(o.nombre);

-- De qué organismo es cada unidad de compra (las compras ágiles traen la
-- unidad y el nombre del organismo, no su código).
create materialized view public.radar_unidades as
select distinct on (unidad_codigo) unidad_codigo, organismo_codigo
from public.mercado_ordenes_de_compra
where unidad_codigo is not null and organismo_codigo is not null
order by unidad_codigo, mes desc
with no data;
create unique index radar_unidades_unidad on public.radar_unidades (unidad_codigo);

create materialized view public.radar_gasto_anual as
select o.organismo_codigo, extract(year from o.mes)::int as anio,
  count(*) as ordenes,
  coalesce(sum(o.monto), 0) as total,
  count(*) filter (where o.del_rubro) as ordenes_rubro,
  coalesce(sum(o.monto) filter (where o.del_rubro), 0) as rubro,
  count(*) filter (where o.modalidad = 'trato_directo') as ordenes_trato_directo,
  coalesce(sum(o.monto) filter (where o.modalidad = 'trato_directo'), 0) as trato_directo,
  count(*) filter (where o.emergencia) as ordenes_emergencia,
  coalesce(sum(o.monto) filter (where o.emergencia), 0) as emergencia,
  coalesce(sum(o.monto) filter (where o.modalidad = 'compra_agil'), 0) as compra_agil,
  coalesce(sum(o.monto) filter (where o.modalidad = 'licitacion'), 0) as licitacion,
  coalesce(sum(o.monto) filter (where o.modalidad = 'convenio_marco'), 0) as convenio_marco
from public.mercado_ordenes_de_compra o
where not public.radar_anulada(o.estado) and o.organismo_codigo is not null
group by 1, 2
with no data;
create index radar_gasto_anual_anio on public.radar_gasto_anual (anio, organismo_codigo);

create materialized view public.radar_proveedores_anual as
select o.organismo_codigo, extract(year from o.mes)::int as anio, o.rut_proveedor,
  count(*) as ordenes,
  coalesce(sum(o.monto), 0) as monto,
  count(*) filter (where o.del_rubro) as ordenes_rubro,
  coalesce(sum(o.monto) filter (where o.del_rubro), 0) as rubro,
  count(*) filter (where o.modalidad = 'trato_directo') as ordenes_trato_directo,
  count(*) filter (where o.emergencia) as ordenes_emergencia
from public.mercado_ordenes_de_compra o
where not public.radar_anulada(o.estado)
  and o.organismo_codigo is not null and o.rut_proveedor is not null
group by 1, 2, 3
with no data;
create index radar_proveedores_anual_organismo on public.radar_proveedores_anual (organismo_codigo, anio);
create index radar_proveedores_anual_rubro on public.radar_proveedores_anual (anio, rubro desc) where rubro > 0;

create materialized view public.radar_meses_rubro as
select o.organismo_codigo, extract(year from o.mes)::int as anio,
  extract(month from o.mes)::int as mes, count(*) as ordenes, coalesce(sum(o.monto), 0) as monto
from public.mercado_ordenes_de_compra o
where o.del_rubro and not public.radar_anulada(o.estado) and o.organismo_codigo is not null
group by 1, 2, 3
with no data;
create index radar_meses_rubro_anio on public.radar_meses_rubro (anio, organismo_codigo);

-- ------------------------------------------------------------
-- 3. Las señales, en los últimos 12 meses con órdenes de compra
-- ------------------------------------------------------------
create materialized view public.radar_senales as
with v as (
  select max(mes) as hasta, (max(mes) - interval '11 months')::date as desde
  from public.mercado_ordenes_de_compra
),
muni as (select * from public.radar_municipios),
oc as (
  select o.* from public.mercado_ordenes_de_compra o, v
  where o.mes between v.desde and v.hasta and not public.radar_anulada(o.estado)
),
lic as (
  select l.* from public.mercado_licitaciones l, v
  where l.mes between v.desde and v.hasta and l.organismo_codigo in (select organismo_codigo from muni)
),
por_nombre as (
  select distinct on (public.radar_clave(nombre)) public.radar_clave(nombre) as clave, codigo
  from public.mercado_organismos order by public.radar_clave(nombre), codigo
),
ca as (
  select c.*, coalesce(u.organismo_codigo, n.codigo) as organismo_codigo
  from public.mercado_compras_agiles c
  cross join v
  left join public.radar_unidades u on u.unidad_codigo = c.unidad_codigo
  left join por_nombre n on n.clave = public.radar_clave(c.organismo)
  where c.municipal and c.mes between v.desde and v.hasta
),
utm as (select mes, valor from public.mercado_utm),
gasto as (
  select organismo_codigo, count(*) as ordenes, coalesce(sum(monto), 0) as total,
    coalesce(sum(monto) filter (where del_rubro), 0) as rubro,
    coalesce(sum(monto) filter (where modalidad = 'trato_directo'), 0) as trato_directo,
    count(*) filter (where emergencia) as emergencias,
    count(*) filter (where modalidad = 'compra_agil') as ordenes_compra_agil
  from oc group by 1
),
-- Un solo oferente en una licitación adjudicada (validada: Fazekas, Dávid-Barrett).
s1 as (
  select organismo_codigo, count(*) as licitaciones, count(*) filter (where oferentes = 1) as unica
  from lic where monto_adjudicado > 0 and tipo in ('L1', 'LE', 'LP', 'LQ', 'LR') group by 1
),
-- Plazo para ofertar bajo el mínimo legal, en días corridos: L1 5, LE 5
-- (10 reducible a 5), LP y LQ 10 (20 reducible a 10), LR 30.
s2 as (
  select organismo_codigo, count(*) as plazo_corto,
    (array_agg(codigo order by (fecha_cierre - fecha_publicacion), codigo))[1:5] as ejemplos
  from lic
  where tipo in ('L1', 'LE', 'LP', 'LQ', 'LR') and fecha_cierre is not null and fecha_publicacion is not null
    and (fecha_cierre - fecha_publicacion) < case tipo when 'LR' then 30 when 'LP' then 10 when 'LQ' then 10 else 5 end
  group by 1
),
-- Demora en adjudicar fuera de lo común para su tipo (cerca de Tukey por
-- tipo); el municipio se marca por la proporción de sus licitaciones así.
d as (
  select organismo_codigo, codigo, tipo, (fecha_adjudicacion - fecha_cierre) as dias
  from lic
  where monto_adjudicado > 0 and fecha_adjudicacion >= fecha_cierre and tipo in ('L1', 'LE', 'LP', 'LQ', 'LR')
),
cerca_d as (
  select tipo,
    percentile_cont(0.75) within group (order by dias)
      + 1.5 * (percentile_cont(0.75) within group (order by dias) - percentile_cont(0.25) within group (order by dias)) as cerca
  from d group by tipo
),
s3 as (
  select d.organismo_codigo, count(*) as adjudicadas, count(*) filter (where d.dias > c.cerca) as demoras,
    (array_agg(d.codigo order by d.dias desc, d.codigo) filter (where d.dias > c.cerca))[1:5] as ejemplos
  from d join cerca_d c using (tipo) group by 1
),
-- El proveedor que más le vende al municipio y qué parte del gasto se lleva.
por_proveedor as (
  select organismo_codigo, rut_proveedor, coalesce(sum(monto), 0) as monto
  from oc where rut_proveedor is not null group by 1, 2
),
s4 as (
  select distinct on (p.organismo_codigo) p.organismo_codigo, p.rut_proveedor,
    p.monto / nullif(g.total, 0) as cuota
  from por_proveedor p join gasto g using (organismo_codigo)
  order by p.organismo_codigo, p.monto desc
),
-- Adjudicado más de 30 % sobre lo estimado (el caso de Padre Hurtado que
-- objetó Contraloría), en pesos.
s5 as (
  select organismo_codigo, count(*) as con_estimado,
    count(*) filter (where monto_adjudicado > monto_estimado * 1.3) as sobre_presupuesto,
    (array_agg(codigo order by monto_adjudicado / monto_estimado desc, codigo)
      filter (where monto_adjudicado > monto_estimado * 1.3))[1:5] as ejemplos
  from lic where moneda = 'CLP' and monto_estimado > 0 and monto_adjudicado > 0 group by 1
),
-- Ganó una oferta que no era la más barata, entre las que ofertaron todas
-- las líneas en pesos (no siempre es irregular: hay criterios además del precio).
completas as (
  select l.organismo_codigo, l.codigo, o.monto_ofertado, o.gano
  from lic l join public.mercado_ofertas o on o.codigo = l.codigo
  where l.oferentes >= 2 and o.lineas_ofertadas = l.lineas and o.monto_ofertado > 0
    and coalesce(o.moneda, '') ~* '^(clp|peso chileno)$'
),
por_licitacion as (
  select organismo_codigo, codigo, count(*) filter (where gano) as ganadores, count(*) as ofertas,
    min(monto_ofertado) as minimo, max(monto_ofertado) filter (where gano) as del_ganador
  from completas group by 1, 2
),
s6 as (
  select organismo_codigo, count(*) as comparables,
    count(*) filter (where del_ganador > minimo) as no_la_mas_barata,
    (array_agg(codigo order by del_ganador / minimo desc, codigo) filter (where del_ganador > minimo))[1:5] as ejemplos
  from por_licitacion where ganadores = 1 and ofertas >= 2 group by 1
),
-- Tres o más tratos directos por emergencia al mismo proveedor en 12 meses
-- (la alerta que propone el informe; la recurrencia que objetó Contraloría
-- en San Carlos).
s8 as (
  select x.organismo_codigo, count(*) as pares,
    jsonb_agg(jsonb_build_object('rut', x.rut_proveedor, 'proveedor', pr.nombre, 'ordenes', x.n, 'monto', x.monto)
      order by x.n desc, x.monto desc) filter (where x.orden <= 5) as detalle
  from (
    select organismo_codigo, rut_proveedor, count(*) as n, coalesce(sum(monto), 0) as monto,
      row_number() over (partition by organismo_codigo order by count(*) desc, sum(monto) desc) as orden
    from oc where emergencia and rut_proveedor is not null
    group by 1, 2 having count(*) >= 3
  ) x
  left join public.mercado_proveedores pr on pr.rut = x.rut_proveedor
  group by 1
),
-- Compras ágiles partidas: el mismo día, la misma unidad le compra dos o
-- más veces al mismo proveedor y juntas pasan las 100 UTM del tope.
s9 as (
  select x.organismo_codigo, count(*) as grupos,
    jsonb_agg(jsonb_build_object('rut', x.rut_proveedor, 'proveedor', pr.nombre, 'dia', x.fecha_envio,
      'ordenes', x.n, 'monto', x.monto, 'utm', round(x.monto / x.utm)) order by x.monto desc)
      filter (where x.orden <= 5) as detalle
  from (
    select o.organismo_codigo, o.unidad_codigo, o.rut_proveedor, o.fecha_envio,
      count(*) as n, coalesce(sum(o.monto), 0) as monto, max(u.valor) as utm,
      row_number() over (partition by o.organismo_codigo order by sum(o.monto) desc) as orden
    from oc o join utm u on u.mes = o.mes
    where o.modalidad = 'compra_agil' and o.rut_proveedor is not null and o.fecha_envio is not null
    group by 1, 2, 3, 4
    having count(*) >= 2 and coalesce(sum(o.monto), 0) > 100 * max(u.valor)
  ) x
  left join public.mercado_proveedores pr on pr.rut = x.rut_proveedor
  group by 1
),
-- Compras ágiles por un monto justo bajo el tope: de 95 a 100 UTM.
s10 as (
  select c.organismo_codigo, count(*) as compras,
    count(*) filter (where c.monto_disponible >= 95 * u.valor and c.monto_disponible <= 100 * u.valor) as bajo_el_tope
  from ca c join utm u on u.mes = c.mes group by 1
),
-- El tipo de licitación no calza con el monto estimado (regla 11 de
-- ChileCompra): una L1 es de menos de 100 UTM y una LE de menos de 1.000.
s11 as (
  select l.organismo_codigo, count(*) as no_calza, (array_agg(l.codigo order by l.codigo))[1:5] as ejemplos
  from lic l join utm u on u.mes = l.mes
  where l.moneda = 'CLP'
    and ((l.tipo = 'L1' and l.monto_estimado >= 100 * u.valor)
      or (l.tipo = 'LE' and l.monto_estimado >= 1000 * u.valor))
  group by 1
),
-- Compras ágiles con una sola cotización.
s13 as (
  select organismo_codigo,
    count(*) filter (where rut_elegido is not null) as con_elegida,
    count(*) filter (where rut_elegido is not null and cotizaciones = 1) as una_sola
  from ca group by 1
),
base as (
  select m.organismo_codigo, m.nombre, m.region, m.comuna, m.poblacion,
    coalesce(g.ordenes, 0) as ordenes, coalesce(g.total, 0) as gasto_total, coalesce(g.rubro, 0) as gasto_rubro,
    coalesce(g.trato_directo, 0) as gasto_trato_directo, coalesce(g.emergencias, 0) as emergencias,
    case when m.poblacion > 0 then coalesce(g.rubro, 0) / m.poblacion end as rubro_por_habitante,
    case when g.total > 0 then g.trato_directo / g.total end as cuota_trato_directo,
    s1.licitaciones, coalesce(s1.unica, 0) as unica,
    case when s1.licitaciones >= 5 then s1.unica::numeric / s1.licitaciones end as cuota_unica,
    coalesce(s2.plazo_corto, 0) as plazo_corto, s2.ejemplos as plazo_corto_ejemplos,
    coalesce(s3.demoras, 0) as demoras,
    case when s3.adjudicadas >= 5 then s3.demoras::numeric / s3.adjudicadas end as cuota_demoras,
    s3.ejemplos as demoras_ejemplos,
    s4.rut_proveedor as proveedor_mayor, s4.cuota as cuota_proveedor_mayor,
    coalesce(s5.sobre_presupuesto, 0) as sobre_presupuesto,
    case when s5.con_estimado >= 5 then s5.sobre_presupuesto::numeric / s5.con_estimado end as cuota_sobre_presupuesto,
    s5.ejemplos as sobre_presupuesto_ejemplos,
    s6.comparables, coalesce(s6.no_la_mas_barata, 0) as no_la_mas_barata,
    case when s6.comparables >= 5 then s6.no_la_mas_barata::numeric / s6.comparables end as cuota_no_la_mas_barata,
    s6.ejemplos as no_la_mas_barata_ejemplos,
    coalesce(s8.pares, 0) as emergencias_recurrentes, s8.detalle as emergencias_recurrentes_detalle,
    coalesce(s9.grupos, 0) as compras_partidas,
    case when g.ordenes_compra_agil >= 20 then coalesce(s9.grupos, 0)::numeric / g.ordenes_compra_agil end as cuota_compras_partidas,
    s9.detalle as compras_partidas_detalle,
    s10.compras as compras_agiles, coalesce(s10.bajo_el_tope, 0) as bajo_el_tope,
    case when s10.compras >= 10 then s10.bajo_el_tope::numeric / s10.compras end as cuota_bajo_el_tope,
    coalesce(s11.no_calza, 0) as tipo_no_calza, s11.ejemplos as tipo_no_calza_ejemplos,
    s13.con_elegida, coalesce(s13.una_sola, 0) as una_sola_cotizacion,
    case when s13.con_elegida >= 10 then s13.una_sola::numeric / s13.con_elegida end as cuota_una_sola
  from muni m
  left join gasto g using (organismo_codigo)
  left join s1 using (organismo_codigo)
  left join s2 using (organismo_codigo)
  left join s3 using (organismo_codigo)
  left join s4 using (organismo_codigo)
  left join s5 using (organismo_codigo)
  left join s6 using (organismo_codigo)
  left join s8 using (organismo_codigo)
  left join s9 using (organismo_codigo)
  left join s10 using (organismo_codigo)
  left join s11 using (organismo_codigo)
  left join s13 using (organismo_codigo)
),
-- La cerca de Tukey de cada proporción, entre todos los municipios.
cercas as (
  select
    percentile_cont(0.75) within group (order by cuota_unica)
      + 1.5 * (percentile_cont(0.75) within group (order by cuota_unica) - percentile_cont(0.25) within group (order by cuota_unica)) as unica,
    percentile_cont(0.75) within group (order by cuota_demoras)
      + 1.5 * (percentile_cont(0.75) within group (order by cuota_demoras) - percentile_cont(0.25) within group (order by cuota_demoras)) as demoras,
    percentile_cont(0.75) within group (order by cuota_sobre_presupuesto)
      + 1.5 * (percentile_cont(0.75) within group (order by cuota_sobre_presupuesto) - percentile_cont(0.25) within group (order by cuota_sobre_presupuesto)) as sobre_presupuesto,
    percentile_cont(0.75) within group (order by cuota_trato_directo)
      + 1.5 * (percentile_cont(0.75) within group (order by cuota_trato_directo) - percentile_cont(0.25) within group (order by cuota_trato_directo)) as trato_directo,
    percentile_cont(0.75) within group (order by rubro_por_habitante)
      + 1.5 * (percentile_cont(0.75) within group (order by rubro_por_habitante) - percentile_cont(0.25) within group (order by rubro_por_habitante)) as por_habitante,
    percentile_cont(0.75) within group (order by cuota_no_la_mas_barata)
      + 1.5 * (percentile_cont(0.75) within group (order by cuota_no_la_mas_barata) - percentile_cont(0.25) within group (order by cuota_no_la_mas_barata)) as no_la_mas_barata,
    percentile_cont(0.75) within group (order by cuota_compras_partidas)
      + 1.5 * (percentile_cont(0.75) within group (order by cuota_compras_partidas) - percentile_cont(0.25) within group (order by cuota_compras_partidas)) as compras_partidas,
    percentile_cont(0.75) within group (order by cuota_bajo_el_tope)
      + 1.5 * (percentile_cont(0.75) within group (order by cuota_bajo_el_tope) - percentile_cont(0.25) within group (order by cuota_bajo_el_tope)) as bajo_el_tope,
    percentile_cont(0.75) within group (order by cuota_una_sola)
      + 1.5 * (percentile_cont(0.75) within group (order by cuota_una_sola) - percentile_cont(0.25) within group (order by cuota_una_sola)) as una_sola,
    avg(cuota_trato_directo) as promedio_trato_directo,
    sum(gasto_rubro) / nullif(sum(poblacion) filter (where gasto_rubro > 0), 0) as promedio_por_habitante
  from base
),
marcadas as (
  select b.*, v.desde, v.hasta,
    c.unica as cerca_unica, c.demoras as cerca_demoras, c.sobre_presupuesto as cerca_sobre_presupuesto,
    c.trato_directo as cerca_trato_directo, c.por_habitante as cerca_por_habitante,
    c.no_la_mas_barata as cerca_no_la_mas_barata, c.compras_partidas as cerca_compras_partidas,
    c.bajo_el_tope as cerca_bajo_el_tope, c.una_sola as cerca_una_sola,
    c.promedio_trato_directo, c.promedio_por_habitante,
    coalesce(b.cuota_unica > c.unica, false) as s_unica,
    b.plazo_corto > 0 as s_plazo_corto,
    coalesce(b.cuota_demoras > c.demoras and b.demoras >= 3, false) as s_demora,
    coalesce(b.cuota_proveedor_mayor > 0.4, false) as s_proveedor_mayor,
    coalesce(b.cuota_sobre_presupuesto > c.sobre_presupuesto and b.sobre_presupuesto >= 2, false) as s_sobre_presupuesto,
    coalesce(b.cuota_no_la_mas_barata > c.no_la_mas_barata, false) as s_no_la_mas_barata,
    coalesce(b.cuota_trato_directo > c.trato_directo, false) as s_trato_directo,
    b.emergencias_recurrentes > 0 as s_emergencias_recurrentes,
    coalesce(b.cuota_compras_partidas > c.compras_partidas and b.compras_partidas >= 3, false) as s_compras_partidas,
    coalesce(b.cuota_bajo_el_tope > c.bajo_el_tope and b.bajo_el_tope >= 3, false) as s_bajo_el_tope,
    b.tipo_no_calza > 0 as s_tipo_no_calza,
    coalesce(b.rubro_por_habitante > c.por_habitante, false) as s_por_habitante,
    coalesce(b.cuota_una_sola > c.una_sola, false) as s_una_sola_cotizacion
  from base b cross join cercas c cross join v
)
select m.*,
  (m.s_unica::int + m.s_plazo_corto::int + m.s_demora::int + m.s_proveedor_mayor::int
   + m.s_sobre_presupuesto::int + m.s_no_la_mas_barata::int + m.s_trato_directo::int
   + m.s_emergencias_recurrentes::int + m.s_compras_partidas::int + m.s_bajo_el_tope::int
   + m.s_tipo_no_calza::int + m.s_por_habitante::int + m.s_una_sola_cotizacion::int) as senales
from marcadas m
with no data;
create unique index radar_senales_organismo on public.radar_senales (organismo_codigo);

-- ------------------------------------------------------------
-- 4. Recalcular, después de cada carga
-- ------------------------------------------------------------
create or replace function public.radar_recalcular() returns integer
language plpgsql as $$
declare
  sin_comuna integer;
begin
  sin_comuna := public.radar_unir_comunas();
  refresh materialized view public.radar_unidades;
  refresh materialized view public.radar_gasto_anual;
  refresh materialized view public.radar_proveedores_anual;
  refresh materialized view public.radar_meses_rubro;
  refresh materialized view public.radar_senales;
  return sin_comuna;
end $$;

-- ------------------------------------------------------------
-- 5. Todo lo de la pestaña, en un JSON
-- ------------------------------------------------------------
-- p_anio nulo = el último año completo (con sus 12 meses). Solo se ofrecen
-- los años con al menos 6 meses de datos: los 3 años hacia atrás empiezan
-- en noviembre, y 2023 traería solo dos meses. p_regiones vacío = todo
-- Chile. p_ruts: los RUT de la empresa, como los escribe ChileCompra (con
-- puntos y sin ellos), para «Dónde no estás».
create or replace function public.radar_tablero(p_anio integer, p_regiones text[], p_ruts text[])
returns jsonb language sql stable as $$
with
meses_por_anio as (
  select anio, count(distinct mes) as meses from public.radar_meses_rubro group by anio
),
sel as (
  select coalesce(
    p_anio,
    (select max(anio) from meses_por_anio where meses = 12),
    (select max(anio) from meses_por_anio)
  ) as anio
),
mun as (
  select * from public.radar_municipios
  where coalesce(cardinality(p_regiones), 0) = 0 or region = any(p_regiones)
),
gasto as (select * from public.radar_gasto_anual where anio = (select anio from sel)),
nacional as (
  select count(*) filter (where g.rubro > 0) as municipios_con_rubro,
    avg(g.rubro) filter (where g.rubro > 0) as rubro_promedio,
    sum(g.rubro) / nullif(sum(m.poblacion) filter (where g.rubro > 0), 0) as rubro_por_habitante,
    sum(g.trato_directo) / nullif(sum(g.total), 0) as cuota_trato_directo
  from public.radar_municipios m join gasto g using (organismo_codigo)
),
presencia as (
  select organismo_codigo from public.mercado_ordenes_de_compra
  where rut_proveedor = any(p_ruts) and organismo_codigo is not null
  union
  select l.organismo_codigo from public.mercado_ofertas o
  join public.mercado_licitaciones l on l.codigo = o.codigo
  where o.rut = any(p_ruts) and l.organismo_codigo is not null
  union
  select u.organismo_codigo from public.mercado_cotizaciones c
  join public.mercado_compras_agiles a on a.codigo = c.codigo
  join public.radar_unidades u on u.unidad_codigo = a.unidad_codigo
  where c.rut = any(p_ruts)
),
filas as (
  select m.organismo_codigo, m.nombre, m.comuna, m.region, m.poblacion,
    g.total, g.ordenes, g.rubro, g.ordenes_rubro, g.trato_directo, g.ordenes_trato_directo,
    g.emergencia, g.ordenes_emergencia,
    case when m.poblacion > 0 then g.rubro / m.poblacion end as rubro_por_habitante,
    case when g.total > 0 then g.trato_directo / g.total end as cuota_trato_directo,
    m.organismo_codigo in (select organismo_codigo from presencia) as presente,
    (select pr.nombre from public.mercado_proveedores pr where pr.rut = s.proveedor_mayor) as proveedor_mayor_nombre,
    to_jsonb(s) - 'organismo_codigo' - 'nombre' - 'region' - 'comuna' - 'poblacion' as senales
  from mun m
  left join gasto g using (organismo_codigo)
  left join public.radar_senales s using (organismo_codigo)
)
select jsonb_build_object(
  'anio', (select anio from sel),
  'anios', (select coalesce(jsonb_agg(anio order by anio desc), '[]'::jsonb) from meses_por_anio where meses >= 6),
  'meses_del_anio', (
    select coalesce(jsonb_agg(distinct r.mes order by r.mes), '[]'::jsonb)
    from public.radar_meses_rubro r where r.anio = (select anio from sel)
  ),
  'ventana', (select jsonb_build_object('desde', min(desde), 'hasta', min(hasta)) from public.radar_senales),
  'nacional', (select to_jsonb(n) from nacional n),
  'municipios', (select coalesce(jsonb_agg(to_jsonb(f) order by f.rubro desc nulls last, f.nombre), '[]'::jsonb) from filas f),
  'quien_gana', (
    select coalesce(jsonb_agg(to_jsonb(x) order by x.monto desc), '[]'::jsonb) from (
      select p.rut_proveedor as rut, pr.nombre, pr.actividad,
        sum(p.rubro) as monto, sum(p.ordenes_rubro) as ordenes, count(distinct p.organismo_codigo) as municipios
      from public.radar_proveedores_anual p
      join mun m using (organismo_codigo)
      left join public.mercado_proveedores pr on pr.rut = p.rut_proveedor
      where p.anio = (select anio from sel) and p.rubro > 0
      group by 1, 2, 3
      order by 4 desc
      limit 15
    ) x
  ),
  'cuando_compran', (
    select jsonb_agg(jsonb_build_object('mes', g.mes, 'ordenes', coalesce(t.ordenes, 0), 'monto', coalesce(t.monto, 0)) order by g.mes)
    from generate_series(1, 12) as g(mes)
    left join (
      select r.mes, sum(r.ordenes) as ordenes, sum(r.monto) as monto
      from public.radar_meses_rubro r join mun m using (organismo_codigo)
      where r.anio = (select anio from sel) group by r.mes
    ) t on t.mes = g.mes
  ),
  'donde_no_estas', (
    select coalesce(jsonb_agg(to_jsonb(x) order by x.rubro desc), '[]'::jsonb) from (
      select f.organismo_codigo, f.nombre, f.comuna, f.rubro, f.ordenes_rubro,
        (select pr.nombre from public.radar_proveedores_anual p
          left join public.mercado_proveedores pr on pr.rut = p.rut_proveedor
          where p.organismo_codigo = f.organismo_codigo and p.anio = (select anio from sel) and p.rubro > 0
          order by p.rubro desc limit 1) as quien_le_vende
      from filas f where f.rubro > 0 and not f.presente
    ) x
  )
)
$$;

-- ------------------------------------------------------------
-- 6. Solo el motor
-- ------------------------------------------------------------
revoke all on public.radar_municipios from anon, authenticated;
revoke all on public.radar_unidades from anon, authenticated;
revoke all on public.radar_gasto_anual from anon, authenticated;
revoke all on public.radar_proveedores_anual from anon, authenticated;
revoke all on public.radar_meses_rubro from anon, authenticated;
revoke all on public.radar_senales from anon, authenticated;
grant select on public.radar_municipios, public.radar_unidades, public.radar_gasto_anual,
  public.radar_proveedores_anual, public.radar_meses_rubro, public.radar_senales to service_role;

revoke execute on function public.radar_clave(text), public.radar_comuna_del_nombre(text),
  public.radar_es_municipio(text), public.radar_anulada(text), public.radar_unir_comunas(),
  public.radar_recalcular(), public.radar_tablero(integer, text[], text[]) from public, anon, authenticated;
grant execute on function public.radar_clave(text), public.radar_comuna_del_nombre(text),
  public.radar_es_municipio(text), public.radar_anulada(text), public.radar_unir_comunas(),
  public.radar_recalcular(), public.radar_tablero(integer, text[], text[]) to service_role;

-- Las vistas nacen vacías: se llenan con `select public.radar_recalcular();`
-- después de la carga (en el laboratorio, a mano; tarda más de un minuto).
