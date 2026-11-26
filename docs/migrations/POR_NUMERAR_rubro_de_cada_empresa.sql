-- ============================================================
-- POR NUMERAR · EL RUBRO DE CADA EMPRESA (25-11-2026) — BORRADOR, NO APLICADA
-- ============================================================
-- ⚠ SIN NÚMERO A PROPÓSITO: el número se reserva desde otra sesión (varias
-- trabajan a la vez y se reparten los números). Al reservarlo, renombrar
-- este archivo a <número>_rubro_de_cada_empresa.sql y cambiar este
-- encabezado.
--
-- ORDEN (las cuatro de Licita, una detrás de otra):
--   1. POR_NUMERAR_onu_por_fila.sql
--   2. POR_NUMERAR_rubro_de_cada_empresa.sql   ← esta
--   3. POR_NUMERAR_catalogo_onu.sql
--   4. POR_NUMERAR_marcas_por_empresa.sql
-- Todas antes del motor que las usa. Son para la base de Licita (FISCOPIO):
-- Eventia (rubro «eventos») no lee ni escribe nada de esto; correrlas allá
-- no cambia nada, salvo que las dos tablas nuevas de la 3 y la 4 entran
-- vacías a su respaldo diario (no están en FUERA_DEL_RESPALDO).
--
-- Qué hace. En una instalación de rubro «general» la marca `del_rubro` del
-- mercado no sirve: es una para toda la base y está hecha para eventos.
-- Cada empresa guarda su propio filtro junto a su perfil:
--   - onu_familias: prefijos de código ONU de 4, 6 u 8 dígitos (los largos
--     en que el motor expande cada código en la columna `onu`);
--   - palabras: lo que aparece en el nombre de una compra de su rubro;
--   - palabras_no: lo que la deja fuera aunque calce con lo anterior;
--   - rubro_leido_de: la huella del perfil del que salió el rubro (si el
--     perfil cambia, la pantalla avisa).
-- No se reutiliza `categorias` (migración 173): son las categorías de
-- ChileCompra, otra cosa, y el motor no las lee desde la decisión 112.
--
-- Y en mercado_cargas, `reglas_huella`: con qué unión de las reglas de
-- todas las empresas se cargó cada mes. Si la unión cambia, la carga de la
-- noche vuelve a bajar las compras ágiles de los últimos 8 meses.
--
-- Idempotente. oportunidades_config ya tiene RLS y solo service_role
-- (migración 122); mercado_cargas, igual (168). Las columnas heredan eso.
-- ============================================================

-- ------------------------------------------------------------
-- 1. El rubro, en la configuración de cada empresa
-- ------------------------------------------------------------
-- Con un valor por defecto constante, Postgres no reescribe la tabla.
alter table public.oportunidades_config
  add column if not exists onu_familias text[] not null default '{}',
  add column if not exists palabras text[] not null default '{}',
  add column if not exists palabras_no text[] not null default '{}',
  add column if not exists rubro_leido_de text;

-- Cada familia, de 4, 6 u 8 dígitos (el motor también lo valida). Los
-- dígitos no llevan comas, así que el arreglo se revisa como un texto.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'oportunidades_config_onu_familias_largo'
      and conrelid = 'public.oportunidades_config'::regclass
  ) then
    alter table public.oportunidades_config
      add constraint oportunidades_config_onu_familias_largo
      check (
        array_to_string(onu_familias, ',')
          ~ '^((\d{4}|\d{6}|\d{8})(,(\d{4}|\d{6}|\d{8}))*)?$'
      );
  end if;
end
$$;

comment on column public.oportunidades_config.onu_familias is
  'El rubro de la empresa por código ONU: prefijos de 4, 6 u 8 dígitos. Una compra es suya si alguno de sus códigos (mercado_compras.onu) es uno de estos. Solo en una instalación de rubro general (Licita, 25-11-2026).';
comment on column public.oportunidades_config.palabras is
  'El rubro de la empresa por nombre: palabras en minúsculas y sin tildes que calzan con el comienzo de una palabra del nombre de la compra (mercado_calza). Solo en una instalación de rubro general.';
comment on column public.oportunidades_config.palabras_no is
  'Lo que deja una compra fuera del rubro de la empresa aunque calce con sus familias o sus palabras. Solo en una instalación de rubro general.';
comment on column public.oportunidades_config.rubro_leido_de is
  'La huella (sha256, 16 letras) del perfil con que se guardó el rubro: si el perfil cambió, la pantalla avisa. Solo en una instalación de rubro general.';

-- ------------------------------------------------------------
-- 2. Con qué reglas se cargó cada mes
-- ------------------------------------------------------------
alter table public.mercado_cargas
  add column if not exists reglas_huella text;

comment on column public.mercado_cargas.reglas_huella is
  'Con qué unión de las reglas de las empresas se cargó el mes (instalación de rubro general): si cambia, se vuelven a bajar las compras ágiles de los últimos 8 meses. Null en Eventia.';
