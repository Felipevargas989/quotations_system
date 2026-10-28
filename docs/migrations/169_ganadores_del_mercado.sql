-- ============================================================
-- 169 · CADA LICITACIÓN DEL MERCADO CON QUIÉN GANÓ (28-10-2026)
-- ============================================================
-- Decisión 106 del doc 17. Felipe: «se viene y el competidor es en quién
-- ganó. Deberían actualizarse»: «Se viene» y los competidores leen del
-- mercado de ChileCompra (decisión 101, migración 168), que es todo Chile
-- con todas las ofertas, y no de la historia que baja el radar por la API.
--
-- Una vista que junta cada licitación con sus ganadores, con la misma forma
-- que la adjudicación del radar (rut, nombre, cantidad, monto_unitario):
-- así el motor la pide en una sola consulta y las funciones de «Se viene»
-- y de los competidores no cambian. `security_invoker`: la vista respeta
-- los permisos de quien la consulta; solo el motor (service_role) la lee.
-- Idempotente; primero en el laboratorio y después en producción.
-- ============================================================

create or replace view public.mercado_licitaciones_con_ganadores
with (security_invoker = true) as
select
  l.codigo,
  l.mes,
  l.nombre,
  l.organismo_codigo,
  l.organismo,
  l.unidad,
  l.comuna,
  l.region,
  l.fecha_publicacion,
  l.fecha_cierre,
  l.monto_estimado,
  l.oferentes,
  l.rubros,
  l.del_rubro,
  (
    select json_agg(
      json_build_object(
        'rut', o.rut,
        'nombre', o.proveedor,
        'cantidad', 1,
        'monto_unitario', o.monto_adjudicado
      )
      order by o.monto_adjudicado desc nulls last
    )
    from public.mercado_ofertas o
    where o.codigo = l.codigo and o.gano
  ) as ganadores
from public.mercado_licitaciones l;

revoke all on public.mercado_licitaciones_con_ganadores from anon, authenticated;
grant select on public.mercado_licitaciones_con_ganadores to service_role;

-- Los índices de la consulta: las del rubro de unas regiones, por código, y
-- los ganadores de cada una sin leer la tabla. Medido en el laboratorio el
-- 28-10: una página de mil pasó de 4,5 s (y el tope de tiempo de la base)
-- a 0,2 s.
create index if not exists idx_mercado_licitaciones_rubro_region
  on public.mercado_licitaciones (region, codigo) where del_rubro;
create index if not exists idx_mercado_ofertas_ganadoras
  on public.mercado_ofertas (codigo) include (rut, proveedor, monto_adjudicado)
  where gano;
