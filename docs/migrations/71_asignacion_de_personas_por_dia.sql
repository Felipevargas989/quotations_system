-- ===========================================================================
-- QUIÉN TRABAJA CADA DÍA
--
-- Es el equivalente de la hoja "trabajadores" del Excel: UNA FILA POR
-- PERSONA Y POR DÍA. Todo lo demás —la nómina, el detalle del garzón, el
-- costo real del evento— son VISTAS de esta tabla. No guardan nada propio.
--
-- El cargo y planta/freelance se guardan ACÁ, no solo en la ficha de la
-- persona, porque son valores DEL DÍA. Está medido en el Excel: Camila
-- Ganga fue Recepción el 2 de agosto y Garzón el 6; Soledad Molina pasó de
-- freelance a planta a mitad de agosto; Camila Carvajal, siendo cajera de
-- planta, cobró jornada dos días porque trabajó en su día libre.
--
-- Ver docs/arquitectura/10_MODULO_DE_PERSONAS.md
--
-- ⚠ NO LA CORRE EL SISTEMA. Aplicada y verificada en el laboratorio.
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.event_staff (
  id             bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id     bigint      NOT NULL REFERENCES public.companies (id),
  quotation_id   uuid        NOT NULL REFERENCES public.quotations (id) ON DELETE CASCADE,
  person_id      bigint      NOT NULL REFERENCES public.people (id) ON DELETE RESTRICT,

  day            date        NOT NULL,
  role_id        bigint      REFERENCES public.management_resources (id) ON DELETE SET NULL,
  kind           text        NOT NULL DEFAULT 'freelance',

  starts_at      time,
  ends_at        time,
  break_minutes  integer,

  status         text        NOT NULL DEFAULT 'confirmado',
  amount         numeric,
  notes          text,

  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT event_staff_kind_chk   CHECK (kind IN ('planta', 'freelance')),
  CONSTRAINT event_staff_status_chk CHECK (status IN ('confirmado', 'por_confirmar')),
  CONSTRAINT event_staff_amount_chk CHECK (amount IS NULL OR amount >= 0)
);

-- La misma persona no puede estar dos veces el mismo día en el MISMO
-- evento. En eventos distintos sí: Soledad Molina el 1 de mayo cobró por
-- Joker 5 y por Joker 9.
CREATE UNIQUE INDEX IF NOT EXISTS event_staff_evento_persona_dia_uniq
  ON public.event_staff (quotation_id, person_id, day);

CREATE INDEX IF NOT EXISTS event_staff_quotation_day_idx
  ON public.event_staff (quotation_id, day);
CREATE INDEX IF NOT EXISTS event_staff_person_day_idx
  ON public.event_staff (person_id, day);

-- ⚠ LOS PERMISOS. Sin esto la pantalla se queda cargando para siempre: el
-- backend recibe 42501 "permission denied". Se aprendió a golpes con la
-- tabla people el mismo día.
GRANT ALL ON TABLE public.event_staff TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;
ALTER TABLE public.event_staff ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.event_staff_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS event_staff_touch_updated_at_trg ON public.event_staff;
CREATE TRIGGER event_staff_touch_updated_at_trg
  BEFORE UPDATE ON public.event_staff
  FOR EACH ROW EXECUTE FUNCTION public.event_staff_touch_updated_at();
