-- ============================================================
-- POR NUMERAR · EL CATÁLOGO DE PRODUCTOS ONU (25-11-2026) — BORRADOR, NO APLICADA
-- ============================================================
-- ⚠ SIN NÚMERO A PROPÓSITO: el número se reserva desde otra sesión. Al
-- reservarlo, renombrar este archivo a <número>_catalogo_onu.sql y cambiar
-- este encabezado.
--
-- ORDEN: 3 de 4 (después de POR_NUMERAR_rubro_de_cada_empresa.sql, antes de
-- POR_NUMERAR_marcas_por_empresa.sql). Antes del motor que la usa. Para la
-- base de Licita; en Eventia nadie la lee ni la escribe.
--
-- Qué hace. «Leer mi rubro desde el perfil» le pasa a la IA un menú
-- CERRADO de familias ONU. El menú sale de aquí: cada código de producto
-- que el cargador mensual ve en los archivos de ChileCompra, con su nombre
-- genérico y en cuántos procesos salió. El nombre viene en las dos fuentes:
-- `NombreProductoGenerico` en las compras ágiles y `Nombre producto genrico`
-- (así, sin la é) en las licitaciones, medido el 25-11 en el archivo de
-- octubre 2025.
--
-- `veces` es la cuenta del MES con más procesos con ese producto, no una
-- suma: las licitaciones del mes en curso se recargan cada noche y una
-- suma crecería sola. Sirve para ordenar el menú, no para estadística.
--
-- Datos públicos, sin empresa: RLS sin políticas, nada para anon ni
-- authenticated, solo el motor (service_role), como el resto de mercado_*.
-- Idempotente.
-- ============================================================

create table if not exists public.mercado_productos_onu (
  codigo text primary key check (codigo ~ '^\d{4,}$'),
  nombre text not null,
  veces integer not null default 0,
  actualizado_en timestamptz not null default now()
);

-- El menú pide los más vistos primero.
create index if not exists idx_mercado_productos_onu_veces
  on public.mercado_productos_onu (veces desc, codigo);

comment on table public.mercado_productos_onu is
  'Cada código ONU de producto que vio el cargador de datos abiertos, con su nombre genérico y en cuántos procesos salió en su mes más alto. De aquí sale el menú de familias que la IA ofrece a cada empresa (Licita, 25-11-2026).';
comment on column public.mercado_productos_onu.veces is
  'En cuántos procesos salió el producto en el mes que más salió (no una suma: recargar un mes no la infla).';

-- ------------------------------------------------------------
-- Anotar lo visto en un mes
-- ------------------------------------------------------------
-- p_productos: [{codigo, nombre, veces}]. Un código repetido en el mismo
-- lote queda una vez (el de más veces): ON CONFLICT no acepta tocar la
-- misma fila dos veces en una sentencia. El nombre se cambia solo si el mes
-- nuevo lo vio más veces. Devuelve cuántos códigos escribió.
create or replace function public.mercado_anotar_productos_onu(p_productos jsonb)
returns integer
language sql
set search_path = public
set statement_timeout = '30s'
as $$
  with nuevos as (
    select distinct on (x.codigo)
      x.codigo,
      left(btrim(x.nombre), 200) as nombre,
      greatest(coalesce(x.veces, 0), 0) as veces
    from jsonb_to_recordset(coalesce(p_productos, '[]'::jsonb))
      as x(codigo text, nombre text, veces integer)
    where x.codigo ~ '^\d{4,}$'
      and nullif(btrim(x.nombre), '') is not null
    order by x.codigo, x.veces desc nulls last
  ),
  escritos as (
    insert into mercado_productos_onu as p (codigo, nombre, veces)
    select codigo, nombre, veces from nuevos
    on conflict (codigo) do update set
      nombre = case when excluded.veces >= p.veces then excluded.nombre
        else p.nombre end,
      veces = greatest(p.veces, excluded.veces),
      actualizado_en = now()
    returning 1
  )
  select count(*)::integer from escritos
$$;

comment on function public.mercado_anotar_productos_onu(jsonb) is
  'Suma al catálogo mercado_productos_onu los productos vistos en un mes ([{codigo, nombre, veces}]); guarda el nombre y las veces del mes más alto. La llama el cargador en una instalación de rubro general.';

alter table public.mercado_productos_onu enable row level security;
revoke all on public.mercado_productos_onu from anon, authenticated;
grant select, insert, update, delete on public.mercado_productos_onu to service_role;

revoke execute on function public.mercado_anotar_productos_onu(jsonb)
  from public, anon, authenticated;
grant execute on function public.mercado_anotar_productos_onu(jsonb)
  to service_role;
