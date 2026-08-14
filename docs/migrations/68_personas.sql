-- ===========================================================================
-- MÓDULO DE GESTIÓN DE PERSONAS — Etapa 1: la ficha de la persona
--
-- Acordado con Felipe el 14-08-2026. El detalle completo está en
-- 00_DOCUMENTACION/10_MODULO_DE_PERSONAS.md
--
-- Crea dos tablas:
--   · job_roles — el catálogo de cargos (garzón, cocina, cajera…)
--   · people    — las personas, con sus datos bancarios
--
-- POR QUÉ EXISTE: hoy los pagos viven en un Excel de nueve hojas. En las
-- nueve NO hay ni un RUT ni una cuenta bancaria: Felipe los teclea a mano
-- en el portal del banco cada semana. Y la misma persona aparece escrita
-- de varias formas — se midieron 11 pares duplicados por un espacio o una
-- tilde, con $9.520.018 repartidos en dos montones.
--
-- ⚠ ESTA MIGRACIÓN NO LA CORRE EL SISTEMA. Hay que aplicarla a mano en
--   Supabase, primero en el laboratorio y después en producción.
-- ===========================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) EL CATÁLOGO DE CARGOS
--
-- Solo nombres. Un cargo NO trae escrito si lleva propina o no: eso se
-- decide en cada reparto (decisión de Felipe, 14-08). Por eso acá no hay
-- ninguna columna de porcentaje ni de "participa en propina".
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.job_roles (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id  bigint      NOT NULL REFERENCES public.companies (id),
  name        text        NOT NULL,
  is_active   boolean     NOT NULL DEFAULT true,
  sort_order  integer     NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- El mismo cargo no se puede cargar dos veces. Se compara sin mayúsculas y
-- sin espacios de sobra, que es exactamente como se coló "Garzón" y
-- "Garzones" como si fueran cosas distintas en el Excel.
CREATE UNIQUE INDEX IF NOT EXISTS job_roles_company_name_uniq
  ON public.job_roles (company_id, lower(btrim(name)));

CREATE INDEX IF NOT EXISTS job_roles_company_activos_idx
  ON public.job_roles (company_id, sort_order) WHERE is_active;

COMMENT ON TABLE public.job_roles IS
  'Catálogo de cargos. Solo nombres: si un cargo lleva propina o no se decide en cada reparto.';

-- ---------------------------------------------------------------------------
-- 2) LAS PERSONAS
--
-- El cargo y planta/freelance son valores POR DEFECTO, no propiedades
-- fijas: se cambian en el día que corresponda. En los datos, Soledad
-- Molina pasó de freelance a planta a mitad de agosto, y Camila Carvajal,
-- siendo planta, cobró jornada dos días porque trabajó en su día libre.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.people (
  id              bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id      bigint      NOT NULL REFERENCES public.companies (id),

  name            text        NOT NULL,
  rut             text,
  phone           text,
  email           text,

  -- Datos bancarios. El banco se guarda por su CÓDIGO de la CMF, como
  -- texto y con los ceros adelante ('001', '012', '037').
  bank_code       text,
  account_type    text,
  account_number  text,

  default_role_id bigint      REFERENCES public.job_roles (id) ON DELETE SET NULL,
  default_kind    text        NOT NULL DEFAULT 'freelance',

  status          text        NOT NULL DEFAULT 'activa',
  blocked_reason  text,
  notes           text,

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT people_default_kind_chk
    CHECK (default_kind IN ('planta', 'freelance')),

  -- "No disponible" NO es una mala nota: alguien puede ser excelente y
  -- haberse ido a estudiar. Por eso es un estado aparte de "bloqueada".
  CONSTRAINT people_status_chk
    CHECK (status IN ('activa', 'no_disponible', 'bloqueada')),

  -- La CuentaRUT de BancoEstado es una cuenta vista; se guarda aparte
  -- solo porque su número se llena solo (el RUT sin el dígito verificador).
  CONSTRAINT people_account_type_chk
    CHECK (account_type IS NULL
           OR account_type IN ('cuenta_rut', 'corriente', 'vista', 'ahorro')),

  -- SOLO DÍGITOS Y GUARDADO COMO TEXTO. Si se guardara como número se
  -- comerían los ceros del principio, y hay cuentas chilenas reales que
  -- parten en 0051. No hay largo fijo por banco: Santander tiene cuentas
  -- de 8 y de 10 dígitos, así que el rango es ancho a propósito.
  CONSTRAINT people_account_number_chk
    CHECK (account_number IS NULL OR account_number ~ '^[0-9]{5,20}$'),

  -- El RUT se guarda limpio: sin puntos, con guion y la K en mayúscula.
  -- El dígito verificador lo revisa la aplicación (módulo 11); acá solo
  -- se cuida la forma.
  CONSTRAINT people_rut_chk
    CHECK (rut IS NULL OR rut ~ '^[0-9]{7,8}-[0-9K]$'),

  -- Bloquear a alguien sin decir por qué no sirve de nada: en ocho meses
  -- nadie se acuerda, y si entra otra persona a usar el sistema, menos.
  CONSTRAINT people_bloqueada_con_motivo
    CHECK (status <> 'bloqueada' OR btrim(coalesce(blocked_reason, '')) <> '')
);

-- ⭐ LA REGLA QUE RESUELVE EL PROBLEMA DEL EXCEL.
-- Un RUT no se puede repetir dentro de la misma empresa. Con esto,
-- "Valentina Salgado" y "Valentina Salgado " (con un espacio invisible al
-- final) dejan de poder ser dos personas con dos montones de plata.
CREATE UNIQUE INDEX IF NOT EXISTS people_company_rut_uniq
  ON public.people (company_id, rut) WHERE rut IS NOT NULL;

CREATE INDEX IF NOT EXISTS people_company_status_idx
  ON public.people (company_id, status);

COMMENT ON COLUMN public.people.account_number IS
  'TEXTO, nunca número: hay cuentas que parten en cero y como cifra se pierden.';
COMMENT ON COLUMN public.people.bank_code IS
  'Código de institución de la CMF, 3 dígitos con ceros adelante. Ej: 012 BancoEstado.';
COMMENT ON COLUMN public.people.default_kind IS
  'Valor por defecto, NO fijo: se puede cambiar en cada día trabajado.';

-- ---------------------------------------------------------------------------
-- 3) updated_at al día
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.people_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS people_touch_updated_at_trg ON public.people;
CREATE TRIGGER people_touch_updated_at_trg
  BEFORE UPDATE ON public.people
  FOR EACH ROW EXECUTE FUNCTION public.people_touch_updated_at();

COMMIT;
