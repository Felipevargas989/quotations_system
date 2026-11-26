-- ============================================================
-- POR NUMERAR · EL ONU POR FILA (25-11-2026) — BORRADOR, NO APLICADA
-- ============================================================
-- ⚠ SIN NÚMERO A PROPÓSITO: el número se reserva desde otra sesión (varias
-- trabajan a la vez y se reparten los números). Al reservarlo, renombrar
-- este archivo a <número>_onu_por_fila.sql y cambiar este encabezado.
--
-- Qué hace. El motor se instalará una segunda vez para empresas de
-- cualquier rubro, y ahí hará falta filtrar el mercado por empresa. Hasta
-- hoy el código ONU de cada línea se leía solo para prender `del_rubro` (las
-- reglas de eventos) y se botaba. Desde este cambio el motor guarda, por
-- proceso, sus códigos ONU YA EXPANDIDOS a sus prefijos de 4, 6 y 8 dígitos
-- (90101603 → 9010, 901016, 90101603): el operador de arreglos `&&` compara
-- elementos enteros, no prefijos, y las reglas son prefijos («9010»,
-- «801416»). Así una regla se pregunta como
--   where onu && array['9010', '801416']
-- y el índice GIN la contesta.
--
--   1. `onu text[] not null default '{}'` en mercado_licitaciones,
--      mercado_compras_agiles y mercado_compras.
--   2. mercado_resumir_mes, con la MISMA firma, copia `onu` a
--      mercado_compras. Parte de la versión vigente, la de la 172 (ninguna
--      migración posterior la redefinió; revisado el 25-11 hasta la 214).
--   3. Un índice GIN parcial sobre mercado_compras(onu), solo licitaciones.
--
-- Para Eventia nada cambia en lo que se marca ni en lo que se guarda: la
-- marca `del_rubro` sale de las mismas reglas.
--
-- ORDEN: esta migración va ANTES del motor que escribe `onu`, en las dos
-- bases (laboratorio y producción). Un motor nuevo sobre una base sin la
-- columna hace fallar cada carga de mes (PostgREST rechaza la columna).
-- La al revés no rompe nada: un motor viejo no manda `onu` y queda '{}'.
--
-- SIN RELLENO: los meses ya cargados quedan con '{}' hasta que el cargador
-- los vuelva a bajar (cuando ChileCompra cambie el archivo) o se recarguen
-- a mano. Nada de este cambio lee `onu` todavía.
--
-- Idempotente. Datos públicos, sin empresa: los permisos de la 168 y la 172
-- no cambian (solo service_role).
-- ============================================================

-- ------------------------------------------------------------
-- 1. La columna, en las tres tablas
-- ------------------------------------------------------------
-- Con un valor por defecto constante, Postgres no reescribe la tabla:
-- agregar la columna es instantáneo aunque la tabla sea grande.
alter table public.mercado_licitaciones
  add column if not exists onu text[] not null default '{}';
alter table public.mercado_compras_agiles
  add column if not exists onu text[] not null default '{}';
alter table public.mercado_compras
  add column if not exists onu text[] not null default '{}';

comment on column public.mercado_licitaciones.onu is
  'Los códigos ONU de las líneas de la licitación, cada uno con sus prefijos de 4, 6 y 8 dígitos, sin repetidos y ordenados. Lo escribe el cargador de datos abiertos (25-11-2026). Vacío en los meses cargados antes.';
comment on column public.mercado_compras_agiles.onu is
  'Los códigos ONU de los productos de la compra ágil, cada uno con sus prefijos de 4, 6 y 8 dígitos, sin repetidos y ordenados. Lo escribe el cargador de datos abiertos (25-11-2026). Vacío en los meses cargados antes.';
comment on column public.mercado_compras.onu is
  'Copia de onu de mercado_licitaciones o mercado_compras_agiles: los códigos ONU con sus prefijos de 4, 6 y 8 dígitos, para preguntar con && por prefijos. La copia mercado_resumir_mes (25-11-2026).';

-- ------------------------------------------------------------
-- 2. Resumir un mes, ahora con el ONU
-- ------------------------------------------------------------
-- Igual a la de la 172, línea por línea, salvo `onu` en los dos INSERT a
-- mercado_compras (licitaciones y compras ágiles).
create or replace function public.mercado_resumir_mes(p_fuente text, p_mes date)
returns jsonb
language plpgsql
set search_path = public
set statement_timeout = '60s'
as $$
declare
  v_tipo text := case p_fuente
    when 'licitaciones' then 'licitacion'
    when 'compra_agil' then 'compra_agil'
  end;
  v_calidad jsonb;
begin
  if v_tipo is null then
    raise exception 'mercado_resumir_mes: fuente desconocida %', p_fuente;
  end if;

  delete from mercado_gasto_por_comprador_mes where tipo = v_tipo and mes = p_mes;
  delete from mercado_ganadores_por_mes where tipo = v_tipo and mes = p_mes;
  delete from mercado_compras where tipo = v_tipo and mes = p_mes;

  -- Las ofertas (o cotizaciones) del mes, con el RUT limpio.
  drop table if exists pg_temp.mercado_ofertas_del_mes;
  if v_tipo = 'licitacion' then
    create temp table mercado_ofertas_del_mes on commit drop as
    with o as materialized (
      select x.codigo, x.proveedor, x.gano, x.monto_adjudicado as monto,
        mercado_rut(x.rut) as rut
      from mercado_ofertas x
      join mercado_licitaciones l on l.codigo = x.codigo
      where l.mes = p_mes)
    select o.*, mercado_rut_valido(o.rut) as valido from o;
  else
    create temp table mercado_ofertas_del_mes on commit drop as
    with o as materialized (
      select x.codigo, x.proveedor, x.elegida as gano, x.monto,
        mercado_rut(x.rut) as rut
      from mercado_cotizaciones x
      join mercado_compras_agiles ca on ca.codigo = x.codigo
      where ca.mes = p_mes and ca.del_rubro)
    select o.*, mercado_rut_valido(o.rut) as valido from o;
  end if;
  analyze mercado_ofertas_del_mes;

  -- Los ganadores de cada compra, en la forma de la adjudicación del radar.
  drop table if exists pg_temp.mercado_ganadores_del_mes;
  create temp table mercado_ganadores_del_mes on commit drop as
  select codigo,
    jsonb_agg(jsonb_build_object('rut', rut, 'nombre', proveedor,
        'cantidad', 1, 'monto_unitario', monto)
      order by monto desc nulls last) as ganadores
  from mercado_ofertas_del_mes
  where gano and valido
  group by codigo;

  if v_tipo = 'licitacion' then
    -- Un código que pasó de otro mes también se rehace aquí.
    delete from mercado_compras m using mercado_licitaciones l
    where m.codigo = l.codigo and l.mes = p_mes;

    insert into mercado_compras (codigo, tipo, mes, nombre, organismo_codigo,
      organismo, unidad_codigo, unidad, rut_unidad, region_codigo, region, cut,
      comuna, fecha_publicacion, fecha_cierre, monto, monto_adjudicado,
      oferentes, rubros, productos, del_rubro, ganadores, onu)
    select l.codigo, 'licitacion', l.mes, l.nombre, l.organismo_codigo,
      l.organismo, l.unidad_codigo, l.unidad, mercado_rut(l.rut_unidad),
      r.codigo, coalesce(r.nombre, l.region), c.cut,
      coalesce(c.comuna, l.comuna), l.fecha_publicacion, l.fecha_cierre,
      l.monto_estimado, l.monto_adjudicado, l.oferentes, l.rubros, null,
      l.del_rubro, g.ganadores, l.onu
    from mercado_licitaciones l
    left join mercado_regiones r on r.clave = mercado_clave(l.region)
    left join lateral (
      select k.comuna from mercado_licitaciones k
      where l.comuna is null and k.unidad_codigo = l.unidad_codigo
        and k.comuna is not null
      order by k.mes desc
      limit 1
    ) u on true
    left join mercado_comunas c
      on c.clave = mercado_clave_de_comuna(coalesce(l.comuna, u.comuna))
    left join mercado_ganadores_del_mes g on g.codigo = l.codigo
    where l.mes = p_mes
    -- Las del rubro de cada región, juntas en el disco: la zona se lee de
    -- una pasada (en frío, 2.476 páginas del disco para la zona sin este
    -- orden, medido en el laboratorio el 29-10).
    order by l.del_rubro desc, r.codigo, l.codigo;
  else
    delete from mercado_compras m using mercado_compras_agiles ca
    where m.codigo = ca.codigo and ca.mes = p_mes;

    -- Las compras ágiles no traen comuna ni organismo: salen de las
    -- licitaciones de la misma unidad de compra.
    insert into mercado_compras (codigo, tipo, mes, nombre, organismo_codigo,
      organismo, unidad_codigo, unidad, rut_unidad, region_codigo, region, cut,
      comuna, fecha_publicacion, fecha_cierre, monto, monto_adjudicado,
      oferentes, rubros, productos, del_rubro, ganadores, onu)
    select ca.codigo, 'compra_agil', ca.mes, ca.nombre, u.organismo_codigo,
      ca.organismo, ca.unidad_codigo, ca.unidad, mercado_rut(ca.rut_unidad),
      r.codigo, coalesce(r.nombre, ca.region), c.cut,
      coalesce(c.comuna, u.comuna), ca.fecha_publicacion, ca.fecha_cierre,
      ca.monto_disponible, ca.monto_elegido, ca.cotizaciones, null,
      ca.productos, ca.del_rubro, g.ganadores, ca.onu
    from mercado_compras_agiles ca
    left join mercado_regiones r on r.clave = mercado_clave(ca.region)
    left join lateral (
      select k.organismo_codigo, k.comuna from mercado_licitaciones k
      where k.unidad_codigo = ca.unidad_codigo and k.comuna is not null
      order by k.mes desc
      limit 1
    ) u on true
    left join mercado_comunas c on c.clave = mercado_clave_de_comuna(u.comuna)
    left join mercado_ganadores_del_mes g on g.codigo = ca.codigo
    where ca.mes = p_mes and ca.del_rubro
    order by r.codigo, ca.codigo;
  end if;

  insert into mercado_ganadores_por_mes (mes, tipo, del_rubro, region_codigo,
    rut, proveedor, ofertas, ganadas, monto_ganado, compradores)
  select p_mes, v_tipo, m.del_rubro, coalesce(m.region_codigo, 0), o.rut,
    max(o.proveedor), count(*), count(*) filter (where o.gano),
    coalesce(sum(o.monto) filter (where o.gano), 0),
    count(distinct coalesce(m.organismo_codigo, 'u:' || m.unidad_codigo))
      filter (where o.gano)
  from mercado_ofertas_del_mes o
  join mercado_compras m on m.codigo = o.codigo
  where o.valido
  group by m.del_rubro, coalesce(m.region_codigo, 0), o.rut
  having m.del_rubro or count(*) filter (where o.gano) > 0;

  insert into mercado_gasto_por_comprador_mes (mes, tipo, del_rubro, comprador,
    region_codigo, organismo_codigo, organismo, cut, procesos, adjudicados,
    monto_adjudicado)
  select p_mes, v_tipo, m.del_rubro,
    coalesce(m.organismo_codigo, 'u:' || m.unidad_codigo, 'n:' || m.organismo, '?'),
    coalesce(m.region_codigo, 0), max(m.organismo_codigo), max(m.organismo),
    case when count(distinct m.cut) = 1 then max(m.cut) end,
    count(*), count(*) filter (where m.monto_adjudicado > 0),
    coalesce(sum(m.monto_adjudicado), 0)
  from mercado_compras m
  where m.tipo = v_tipo and m.mes = p_mes
  group by m.del_rubro,
    coalesce(m.organismo_codigo, 'u:' || m.unidad_codigo, 'n:' || m.organismo, '?'),
    coalesce(m.region_codigo, 0);

  if v_tipo = 'compra_agil' then
    -- Las que no son del rubro, desde los totales por unidad: no se guardan
    -- en detalle, así que no se sabe cuántas se adjudicaron.
    insert into mercado_gasto_por_comprador_mes (mes, tipo, del_rubro, comprador,
      region_codigo, organismo_codigo, organismo, cut, procesos, adjudicados,
      monto_adjudicado)
    select p_mes, 'compra_agil', false,
      coalesce(u.organismo_codigo, 'u:' || t.unidad_codigo),
      coalesce(r.codigo, 0), max(u.organismo_codigo), max(t.organismo),
      case when count(distinct c.cut) = 1 then max(c.cut) end,
      sum(t.solicitudes - t.solicitudes_rubro), null,
      coalesce(sum(t.monto_elegido - t.monto_rubro), 0)
    from mercado_compras_agiles_totales t
    left join mercado_regiones r on r.clave = mercado_clave(t.region)
    left join lateral (
      select k.organismo_codigo, k.comuna from mercado_licitaciones k
      where k.unidad_codigo = t.unidad_codigo and k.comuna is not null
      order by k.mes desc
      limit 1
    ) u on true
    left join mercado_comunas c on c.clave = mercado_clave_de_comuna(u.comuna)
    where t.mes = p_mes and t.solicitudes > t.solicitudes_rubro
    group by coalesce(u.organismo_codigo, 'u:' || t.unidad_codigo),
      coalesce(r.codigo, 0);
  end if;

  select jsonb_build_object(
      'procesos', count(*),
      'sin_region', count(*) filter (where region_codigo is null),
      'sin_comuna', count(*) filter (where cut is null))
  into v_calidad
  from mercado_compras
  where tipo = v_tipo and mes = p_mes;

  select v_calidad || jsonb_build_object(
      'ofertas', count(*),
      'rut_no_valido', count(*) filter (where not valido),
      'ganadoras_rut_no_valido', count(*) filter (where gano and not valido))
  into v_calidad
  from mercado_ofertas_del_mes;

  update mercado_cargas set resumida_en = now(), calidad = v_calidad
  where fuente = p_fuente and mes = p_mes;
  return v_calidad;
end
$$;

comment on function public.mercado_resumir_mes(text, date) is
  'Rehace los resúmenes de un mes (licitaciones o compra_agil), con los códigos ONU de cada compra, y devuelve el control de calidad (decisión 109; onu desde el 25-11-2026).';

-- `create or replace` conserva los permisos de la 172; se repiten para que
-- la migración quede completa por sí sola.
revoke execute on function public.mercado_resumir_mes(text, date)
  from public, anon, authenticated;
grant execute on function public.mercado_resumir_mes(text, date)
  to service_role;

-- ------------------------------------------------------------
-- 3. El índice para preguntar por prefijos ONU
-- ------------------------------------------------------------
-- Solo las licitaciones: son todas las de Chile, de todos los rubros, y es
-- donde una empresa de otro rubro va a buscar lo suyo (las compras ágiles
-- guardadas en detalle siguen siendo solo las de eventos). Parcial, para no
-- pesar con las compras ágiles. Con los meses viejos en '{}' el índice nace
-- chico y crece a medida que el cargador recarga meses.
-- ⚠ `create index` (sin concurrently) bloquea las escrituras en
-- mercado_compras mientras se arma: correr fuera del horario del cargador
-- nocturno. Hoy la columna nace vacía y se arma en segundos.
create index if not exists idx_mercado_compras_onu
  on public.mercado_compras using gin (onu)
  where tipo = 'licitacion';
