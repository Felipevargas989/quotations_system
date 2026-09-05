-- Tipos de evento ADMINISTRABLES (05-09-2026, doc 12): dejan de ser
-- lista fija en el código. Cada tipo lleva su categoría de ENTRADA:
-- 'cotizacion' (el formulario público crea cotización, como siempre) o
-- 'consulta' (entra al embudo: consulta + brochure por correo).
-- Se siembran los 8 históricos como 'cotizacion' para cada empresa.
-- CORRER EN LAB Y EN PRODUCCIÓN.

CREATE TABLE IF NOT EXISTS public.event_types (
  id bigserial PRIMARY KEY,
  company_id bigint NOT NULL REFERENCES public.companies(id),
  name text NOT NULL,
  entrada text NOT NULL DEFAULT 'cotizacion'
    CHECK (entrada IN ('cotizacion', 'consulta')),
  -- Un tipo EN USO no se elimina (regla de siempre): se INACTIVA — deja
  -- de ofrecerse en los formularios, el histórico queda intacto.
  activo boolean NOT NULL DEFAULT true,
  sort_order int,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, name)
);

INSERT INTO public.event_types (company_id, name, entrada, sort_order)
SELECT c.id, t.name, 'cotizacion', t.ord
FROM public.companies c
CROSS JOIN (VALUES
  ('Almuerzo o Cena', 1),
  ('Paseo de Curso', 2),
  ('Uso salones', 3),
  ('Estadía y Alimentación', 4),
  ('Paseo fin de año', 5),
  ('Celebraciones', 6),
  ('Matrimonios', 7),
  ('Graduación', 8)
) AS t(name, ord)
ON CONFLICT (company_id, name) DO NOTHING;
