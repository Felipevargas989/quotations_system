-- ============================================================
-- 77 — EL CICLO DE LA FICHA, LAS PROPINAS Y LA NÓMINA (15-08)
--
-- La estructura completa de las etapas 4 a 6 del módulo de
-- Personal (docs/arquitectura/10_MODULO_DE_PERSONAS.md):
--
--  · staff_sheets   — el ciclo de la ficha de cada evento:
--                     armando → confirmado → trabajado → cerrada.
--  · tip_pools      — los pozos de propina. De un evento
--                     (quotation_id) o de la planta (day, con área
--                     opcional). El pozo llega en DOS entregas.
--  · person_reviews — las estrellas: una evaluación por persona
--                     por evento al cerrar la ficha; la nota puede
--                     ir sin estrella ("solo fines de semana").
--  · payrolls       — la nómina NO es una semana: es un selector
--                     de qué se liquida. payroll_people lleva el
--                     pago persona a persona (jornada y propina
--                     POR SEPARADO — los eventos cruzan semanas).
--  · event_staff    — cada día gana su propina repartida
--                     (tip_amount, al peso, sin sobrantes) y las
--                     marcas de en qué nómina cayó cada cosa:
--                     NULL = pendiente. No hay que acordarse de nada.
--
-- Aplicada en LABORATORIO: 15-08-2026.
-- Aplicada en PRODUCCIÓN: pendiente (paquete 68→77).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.staff_sheets (
  id           serial PRIMARY KEY,
  company_id   integer NOT NULL REFERENCES public.companies(id),
  quotation_id uuid NOT NULL REFERENCES public.quotations(id),
  status       text NOT NULL DEFAULT 'armando'
               CHECK (status IN ('armando','confirmado','trabajado','cerrada')),
  closed_at    timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, quotation_id)
);

CREATE TABLE IF NOT EXISTS public.tip_pools (
  id             serial PRIMARY KEY,
  company_id     integer NOT NULL REFERENCES public.companies(id),
  quotation_id   uuid REFERENCES public.quotations(id),
  day            date,
  area           text,
  first_amount   numeric NOT NULL DEFAULT 0,
  second_amount  numeric NOT NULL DEFAULT 0,
  distributed_at timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  -- De un evento O de un día de la planta, nunca de nada.
  CHECK (quotation_id IS NOT NULL OR day IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS public.person_reviews (
  id           serial PRIMARY KEY,
  company_id   integer NOT NULL REFERENCES public.companies(id),
  person_id    integer NOT NULL REFERENCES public.people(id),
  quotation_id uuid REFERENCES public.quotations(id),
  stars        integer CHECK (stars BETWEEN 1 AND 5),
  note         text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.payrolls (
  id         serial PRIMARY KEY,
  company_id integer NOT NULL REFERENCES public.companies(id),
  label      text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.payroll_people (
  id            serial PRIMARY KEY,
  company_id    integer NOT NULL REFERENCES public.companies(id),
  payroll_id    integer NOT NULL REFERENCES public.payrolls(id),
  person_id     integer NOT NULL REFERENCES public.people(id),
  jornada_paid  boolean NOT NULL DEFAULT false,
  propina_paid  boolean NOT NULL DEFAULT false,
  paid_at       timestamptz,
  UNIQUE (payroll_id, person_id)
);

ALTER TABLE public.event_staff
  ADD COLUMN IF NOT EXISTS tip_amount numeric,
  ADD COLUMN IF NOT EXISTS tip_pool_id integer REFERENCES public.tip_pools(id),
  ADD COLUMN IF NOT EXISTS payroll_id integer REFERENCES public.payrolls(id),
  ADD COLUMN IF NOT EXISTS tip_payroll_id integer REFERENCES public.payrolls(id);

COMMENT ON COLUMN public.event_staff.tip_amount IS
  'Propina del dia ya repartida, al peso. NULL = sin repartir.';
COMMENT ON COLUMN public.event_staff.payroll_id IS
  'Nomina que liquido la JORNADA. NULL = pendiente.';
COMMENT ON COLUMN public.event_staff.tip_payroll_id IS
  'Nomina que liquido la PROPINA. NULL = pendiente.';

-- ------------------------------------------------------------
-- PERMISOS — la lección del 42501 (migración 68): sin el GRANT al
-- service_role el backend recibe "permission denied" y la pantalla
-- se queda colgada. SIEMPRE va junto a la tabla nueva.
-- ------------------------------------------------------------
GRANT ALL ON public.staff_sheets    TO service_role;
GRANT ALL ON public.tip_pools       TO service_role;
GRANT ALL ON public.person_reviews  TO service_role;
GRANT ALL ON public.payrolls        TO service_role;
GRANT ALL ON public.payroll_people  TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.staff_sheets_id_seq   TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.tip_pools_id_seq      TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.person_reviews_id_seq TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.payrolls_id_seq       TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.payroll_people_id_seq TO service_role;

ALTER TABLE public.staff_sheets   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tip_pools      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.person_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payrolls       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_people ENABLE ROW LEVEL SECURITY;
