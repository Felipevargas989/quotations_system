-- Módulo de Consultas, el embudo (05-09-2026, doc 12): las consultas
-- masivas de matrimonio/paseo de curso/graduación dejan de crear
-- cotizaciones; quedan acá y reciben el brochure por correo.
-- CORRER EN LAB Y EN PRODUCCIÓN.

CREATE TABLE IF NOT EXISTS public.consultas (
  id bigserial PRIMARY KEY,
  company_id bigint NOT NULL REFERENCES public.companies(id),
  name text NOT NULL,
  email text NOT NULL,
  phone text NOT NULL,
  client_type text,
  event_type text NOT NULL,
  event_date date,
  people_count int,
  children_count int,
  observations text,
  estado text NOT NULL DEFAULT 'respondida'
    CHECK (estado IN ('respondida', 'convertida', 'descartada')),
  correo_enviado boolean NOT NULL DEFAULT false,
  client_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS consultas_company_created
  ON public.consultas (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS consultas_company_email
  ON public.consultas (company_id, lower(email));

CREATE TABLE IF NOT EXISTS public.consulta_config (
  company_id bigint NOT NULL REFERENCES public.companies(id),
  event_type text NOT NULL,
  texto text,
  brochures jsonb NOT NULL DEFAULT '[]'::jsonb,
  PRIMARY KEY (company_id, event_type)
);
