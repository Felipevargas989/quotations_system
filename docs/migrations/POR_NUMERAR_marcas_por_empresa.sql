-- ============================================================
-- POR NUMERAR · LAS MARCAS DEL MERCADO POR EMPRESA (25-11-2026) — BORRADOR, NO APLICADA
-- ============================================================
-- ⚠ SIN NÚMERO A PROPÓSITO: el número se reserva desde otra sesión. Al
-- reservarlo, renombrar este archivo a <número>_marcas_por_empresa.sql y
-- cambiar este encabezado.
--
-- ORDEN: 4 de 4. Requiere POR_NUMERAR_onu_por_fila.sql (la columna
-- mercado_compras.onu) y POR_NUMERAR_rubro_de_cada_empresa.sql (las reglas
-- en oportunidades_config). Antes del motor que la usa. Para la base de
-- Licita; en Eventia nadie la lee ni la escribe.
--
-- Qué hace. En una instalación de rubro «general» cada empresa ve el
-- mercado con su propio rubro. En vez de una marca `del_rubro` para toda la
-- base, una tabla de marcas por empresa:
--   mercado_marcas (company_id, tipo, region_codigo, codigo, mes)
-- Una compra de mercado_compras es de la empresa si
--   onu && onu_familias            (algún prefijo ONU suyo), o
--   su nombre calza con alguna de sus palabras,
-- y su nombre no calza con ninguna de sus palabras_no. «Calza» = la palabra
-- (sin tildes, en minúsculas) aparece al COMIENZO de una palabra del nombre:
-- «aseo» calza con «aseo industrial» y no con «paseo». El motor tiene la
-- misma regla en TypeScript (`rubro/rubro-de-la-empresa.ts`) y una prueba
-- amarra que las dos normalizaciones sean iguales.
--
-- Funciones:
--   mercado_texto(texto)           el nombre normalizado, entre espacios.
--   mercado_patrones(palabras)     las palabras listas para comparar.
--   mercado_calza(texto, patrones) si calza.
--   mercado_marcar_empresa(p_company)
--       rehace TODAS las marcas de una empresa (al guardar su rubro).
--   mercado_marcar_mes(p_mes, p_tipo)
--       rehace las marcas de todas las empresas con reglas para un mes
--       recién resumido (el motor la llama después de mercado_resumir_mes).
--   mercado_zona_de_empresa(p_company, p_region, p_desde, p_despues,
--                           p_limite, p_tipo)
--       las mismas columnas que el motor lee hoy de la capa resumida
--       (MercadoDeLaZonaRepository), solo con lo marcado de esa empresa,
--       una región a la vez y en orden de código (página siguiente: después
--       del último código). p_tipo es un sexto parámetro que no estaba en
--       el diseño: «lo que ya salió este año» (decisión 110) también lee
--       las compras ágiles; por omisión, 'licitacion'.
--
-- Las marcas cubren todo Chile (no solo las regiones de la empresa): así
-- cambiar de regiones no obliga a volver a marcar. Y los últimos 40 meses
-- (el motor mira 38).
--
-- Cada una lleva su propio tope de tiempo, como mercado_resumir_mes (172);
-- el motor llama a las dos de marcar por el cliente de trabajos largos, que
-- se rinde a los 75 s: por eso la más larga corta a los 70.
-- RLS encendido, sin políticas; solo service_role. Idempotente.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Comparar nombres
-- ------------------------------------------------------------
-- El nombre sin tildes, en minúsculas y con todo lo que no es letra o
-- número convertido en un espacio, con un espacio a cada lado:
-- «Día del Funcionario» → ' dia del funcionario '. Una sola expresión,
-- sin FROM, para que la base la meta en cada consulta (como mercado_clave).
create or replace function public.mercado_texto(texto text) returns text
language sql immutable parallel safe as $$
  select ' ' || btrim(regexp_replace(
    lower(translate(coalesce(texto, ''), 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun')),
    '[^a-z0-9]+', ' ', 'g')) || ' '
$$;

-- Las palabras de una empresa listas para buscar: ' palabra' (con el
-- espacio adelante, que exige el comienzo de una palabra del nombre). Las
-- vacías se botan: una vacía calzaría con todo.
create or replace function public.mercado_patrones(palabras text[]) returns text[]
language sql immutable parallel safe as $$
  select coalesce(array_agg(distinct rtrim(public.mercado_texto(w))), '{}')
  from unnest(coalesce(palabras, '{}')) w
  where btrim(public.mercado_texto(w)) <> ''
$$;

-- ¿Calza un nombre ya normalizado (mercado_texto) con algún patrón?
create or replace function public.mercado_calza(texto text, patrones text[])
returns boolean
language sql immutable parallel safe as $$
  select exists (
    select 1 from unnest(coalesce(patrones, '{}')) p
    where strpos(texto, p) > 0)
$$;

-- ------------------------------------------------------------
-- 2. Las marcas
-- ------------------------------------------------------------
-- region_codigo 0 = región desconocida (como en los resúmenes de la 172):
-- la llave no admite null.
create table if not exists public.mercado_marcas (
  company_id bigint not null references public.companies (id) on delete cascade,
  tipo text not null check (tipo in ('licitacion', 'compra_agil')),
  region_codigo smallint not null,
  codigo text not null,
  mes date not null,
  -- La zona de una empresa se lee por esta llave, en orden de código; el
  -- mes va incluido para filtrar sin ir a la tabla.
  constraint mercado_marcas_pkey
    primary key (company_id, tipo, region_codigo, codigo) include (mes)
);

-- Rehacer un mes (mercado_marcar_mes) y quitar un código que cambió de mes.
create index if not exists idx_mercado_marcas_mes
  on public.mercado_marcas (tipo, mes);
create index if not exists idx_mercado_marcas_codigo
  on public.mercado_marcas (codigo);

comment on table public.mercado_marcas is
  'Qué compras de mercado_compras son del rubro de cada empresa, según sus onu_familias, palabras y palabras_no (instalación de rubro general, Licita, 25-11-2026). La llenan mercado_marcar_empresa y mercado_marcar_mes; la lee mercado_zona_de_empresa.';
comment on column public.mercado_marcas.region_codigo is
  'El código oficial de la región de la compra (mercado_regiones); 0 = desconocida.';

alter table public.mercado_marcas enable row level security;
revoke all on public.mercado_marcas from anon, authenticated;
grant select, insert, update, delete on public.mercado_marcas to service_role;

-- ------------------------------------------------------------
-- 3. Marcar una empresa entera (al guardar su rubro)
-- ------------------------------------------------------------
-- Borra sus marcas y las vuelve a hacer con lo que tiene guardado. Sin
-- familias ni palabras queda sin marcas. Recorre mercado_compras de los
-- últimos 40 meses entera (el nombre no tiene índice): unos segundos.
create or replace function public.mercado_marcar_empresa(p_company bigint)
returns integer
language plpgsql
set search_path = public
set statement_timeout = '70s'
as $$
declare
  v_onu text[];
  v_si text[];
  v_no text[];
  v_filas integer := 0;
begin
  select coalesce(c.onu_familias, '{}'), mercado_patrones(c.palabras),
    mercado_patrones(c.palabras_no)
  into v_onu, v_si, v_no
  from oportunidades_config c
  where c.company_id = p_company;

  delete from mercado_marcas where company_id = p_company;

  if coalesce(cardinality(v_onu), 0) = 0
    and coalesce(cardinality(v_si), 0) = 0 then
    return 0;
  end if;

  insert into mercado_marcas (company_id, tipo, region_codigo, codigo, mes)
  select p_company, m.tipo, coalesce(m.region_codigo, 0), m.codigo, m.mes
  from mercado_compras m
  cross join lateral (select mercado_texto(m.nombre) as t) x
  where m.mes >= (date_trunc('month', current_date) - interval '40 months')::date
    and (m.onu && v_onu or mercado_calza(x.t, v_si))
    and not mercado_calza(x.t, v_no)
  on conflict (company_id, tipo, region_codigo, codigo) do nothing;

  get diagnostics v_filas = row_count;
  return v_filas;
end
$$;

-- ------------------------------------------------------------
-- 4. Marcar un mes recién resumido (todas las empresas con reglas)
-- ------------------------------------------------------------
-- p_tipo: 'licitacion' o 'compra_agil' (el tipo de mercado_compras). Antes
-- de marcar se borra lo de ese mes y lo de los códigos que ahora están en
-- él (mercado_resumir_mes rehace en el mes nuevo un código que pasó de otro
-- mes; su marca vieja tendría otro mes o, rara vez, otra región).
create or replace function public.mercado_marcar_mes(p_mes date, p_tipo text)
returns integer
language plpgsql
set search_path = public
set statement_timeout = '60s'
as $$
declare
  v_filas integer := 0;
begin
  if p_tipo is null or p_tipo not in ('licitacion', 'compra_agil') then
    raise exception 'mercado_marcar_mes: tipo desconocido %', p_tipo;
  end if;

  delete from mercado_marcas k
  using mercado_compras m
  where m.tipo = p_tipo and m.mes = p_mes
    and k.codigo = m.codigo and k.tipo = p_tipo;

  delete from mercado_marcas where tipo = p_tipo and mes = p_mes;

  with reglas as (
    select c.company_id, c.onu_familias as onu,
      mercado_patrones(c.palabras) as dentro,
      mercado_patrones(c.palabras_no) as fuera
    from oportunidades_config c
    where cardinality(c.onu_familias) > 0 or cardinality(c.palabras) > 0
  )
  insert into mercado_marcas (company_id, tipo, region_codigo, codigo, mes)
  select r.company_id, m.tipo, coalesce(m.region_codigo, 0), m.codigo, m.mes
  from mercado_compras m
  cross join lateral (select mercado_texto(m.nombre) as t) x
  join reglas r
    on (m.onu && r.onu or mercado_calza(x.t, r.dentro))
    and not mercado_calza(x.t, r.fuera)
  where m.tipo = p_tipo and m.mes = p_mes
  on conflict (company_id, tipo, region_codigo, codigo)
    do update set mes = excluded.mes;

  get diagnostics v_filas = row_count;
  return v_filas;
end
$$;

-- ------------------------------------------------------------
-- 5. La zona de una empresa
-- ------------------------------------------------------------
-- Las mismas columnas que MercadoDeLaZonaRepository lee de mercado_compras
-- (COLUMNAS_DE_COMPRAS: el monto estimado se llama monto_estimado), solo lo
-- marcado de la empresa en una región, desde un mes, después de un código
-- y hasta p_limite filas (tope 1000, el de PostgREST).
create or replace function public.mercado_zona_de_empresa(
  p_company bigint,
  p_region smallint,
  p_desde date,
  p_despues text default null,
  p_limite integer default 1000,
  p_tipo text default 'licitacion')
returns table (
  codigo text,
  nombre text,
  organismo text,
  organismo_codigo text,
  unidad text,
  comuna text,
  region text,
  fecha_publicacion date,
  fecha_cierre date,
  monto_estimado numeric,
  oferentes integer,
  rubros text[],
  ganadores jsonb)
language sql
stable
set search_path = public
set statement_timeout = '30s'
as $$
  select m.codigo, m.nombre, m.organismo, m.organismo_codigo, m.unidad,
    m.comuna, m.region, m.fecha_publicacion, m.fecha_cierre, m.monto,
    m.oferentes, m.rubros, m.ganadores
  from mercado_marcas k
  join mercado_compras m on m.codigo = k.codigo
  where k.company_id = p_company
    and k.tipo = p_tipo
    and k.region_codigo = p_region
    and k.mes >= p_desde
    and (p_despues is null or k.codigo > p_despues)
  order by k.codigo
  limit least(greatest(coalesce(p_limite, 1000), 1), 1000)
$$;

-- ------------------------------------------------------------
-- 6. Qué es cada cosa y permisos: solo el motor
-- ------------------------------------------------------------
comment on function public.mercado_texto(text) is
  'Un nombre sin tildes, en minúsculas, con lo que no es letra o número como espacio y un espacio a cada lado, para buscar palabras del rubro (Licita, 25-11-2026).';
comment on function public.mercado_patrones(text[]) is
  'Las palabras de una empresa listas para mercado_calza (con un espacio adelante), sin vacías ni repetidas.';
comment on function public.mercado_calza(text, text[]) is
  'Si un nombre ya pasado por mercado_texto contiene alguno de los patrones de mercado_patrones (al comienzo de una palabra).';
comment on function public.mercado_marcar_empresa(bigint) is
  'Rehace todas las marcas de una empresa con su rubro guardado en oportunidades_config; devuelve cuántas compras marcó.';
comment on function public.mercado_marcar_mes(date, text) is
  'Rehace las marcas de todas las empresas con reglas para un mes y tipo de mercado_compras recién resumido; devuelve cuántas escribió.';
comment on function public.mercado_zona_de_empresa(bigint, smallint, date, text, integer, text) is
  'Lo marcado de una empresa en una región desde un mes, con las columnas de la capa resumida, en orden de código y de a páginas.';

revoke execute on function public.mercado_texto(text),
  public.mercado_patrones(text[]),
  public.mercado_calza(text, text[]),
  public.mercado_marcar_empresa(bigint),
  public.mercado_marcar_mes(date, text),
  public.mercado_zona_de_empresa(bigint, smallint, date, text, integer, text)
  from public, anon, authenticated;
grant execute on function public.mercado_texto(text),
  public.mercado_patrones(text[]),
  public.mercado_calza(text, text[]),
  public.mercado_marcar_empresa(bigint),
  public.mercado_marcar_mes(date, text),
  public.mercado_zona_de_empresa(bigint, smallint, date, text, integer, text)
  to service_role;
