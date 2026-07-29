-- Migración 44 — EVENTIA MÓVIL: checklist de la ficha de cocina
-- (aditiva; aplicada en LAB 29-07). Marca qué ítem del retiro de
-- bodega / mobiliario ya está listo, quién y cuándo. La ficha en sí
-- sigue siendo calculada (solo lectura); esto guarda SOLO los checks.
CREATE TABLE IF NOT EXISTS public.kitchen_checklist_marks (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id bigint NOT NULL,
  quotation_id uuid NOT NULL,
  clave text NOT NULL,
  marcado_por text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (quotation_id, clave)
);
CREATE INDEX IF NOT EXISTS kitchen_marks_quotation_idx
  ON public.kitchen_checklist_marks (quotation_id);
ALTER TABLE public.kitchen_checklist_marks ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.kitchen_checklist_marks TO service_role;
