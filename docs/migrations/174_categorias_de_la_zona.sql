-- ============================================================
-- 174 · LAS CATEGORÍAS DE CHILECOMPRA DE TU ZONA (29-10-2026)
-- ============================================================
-- Decisión 111 del doc 17. Felipe, ante las categorías propuestas para
-- Valle del Sol: «si, pero deja esto como una sección para elegir en la
-- pestaña de configuración»; y con el dibujo de la sección: «si dale armalo
-- asi».
--
-- La sección «Categorías de ChileCompra» de Configuración muestra cada
-- categoría con cuántas licitaciones tuvo en las regiones de la empresa, en
-- lo que guarda la capa resumida (3 años). Contarlas recorriendo toda
-- `mercado_compras` tardó 6,9 s en frío en el laboratorio. Con un índice
-- por región, 3,6 s: igual había que abrir cada licitación de la zona. El
-- índice trae también las categorías (INCLUDE), así la base cuenta sin
-- abrir ninguna: 0,6 s en frío, con 35 MB de índice (medido en el
-- laboratorio el 29-10, después de un VACUUM de la tabla).
--
-- Solo lectura, sin datos de empresa: solo el motor (service_role).
-- Requiere la 172. Idempotente; primero en el laboratorio y después en
-- producción.
-- ============================================================

create index if not exists idx_mercado_compras_region
  on public.mercado_compras (region_codigo) include (rubros)
  where tipo = 'licitacion';

create or replace function public.mercado_categorias_de_la_zona(
  p_regiones smallint[])
returns table (categoria text, licitaciones bigint)
language sql stable
set search_path = public
set statement_timeout = '30s'
as $$
  select c, count(*)
  from mercado_compras m, unnest(m.rubros) c
  where m.tipo = 'licitacion'
    and m.region_codigo = any (p_regiones)
  group by c
  order by count(*) desc, c
$$;

comment on function public.mercado_categorias_de_la_zona(smallint[]) is
  'Cuántas licitaciones tuvo cada categoría de ChileCompra en unas regiones, en lo que guarda la capa resumida: lo que muestra la sección «Categorías de ChileCompra» de Configuración (decisión 111).';

revoke execute on function public.mercado_categorias_de_la_zona(smallint[])
  from public, anon, authenticated;
grant execute on function public.mercado_categorias_de_la_zona(smallint[])
  to service_role;
