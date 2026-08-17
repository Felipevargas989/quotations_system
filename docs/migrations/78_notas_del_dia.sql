-- ============================================================
-- 78 — LAS NOTAS DEL DÍA (15-08)
--
-- Pedido de Felipe al pulir el resumen del día: "inclusive uno
-- podría dejar algunas notas de cosas que tiene que hacer el
-- personal".
--
-- Son recados operativos de UN día, no del evento ni de la
-- persona: "llegan a las 11, el bus se estaciona atrás", "sacar
-- las mesas del galpón", "confirmar torta con la señora Rosa".
-- Se escriben y se leen en el resumen del día.
--
--  · quotation_id NULL = nota del día completo.
--  · quotation_id con valor = nota de ESE evento ese día.
--  · done = se puede ir marcando lo hecho, sin borrarlo.
--
-- El índice por (company_id, day) es el que usa el resumen: se
-- piden las notas del rango visible de la sábana, no todas.
--
-- Aplicada en LABORATORIO: 15-08-2026.
-- Aplicada en PRODUCCIÓN: pendiente (paquete 68→78).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.day_notes (
  id           serial PRIMARY KEY,
  company_id   integer NOT NULL REFERENCES public.companies(id),
  day          date NOT NULL,
  quotation_id uuid REFERENCES public.quotations(id),
  text         text NOT NULL,
  done         boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS day_notes_company_day_idx
  ON public.day_notes (company_id, day);

COMMENT ON TABLE public.day_notes IS
  'Recados operativos de un dia: lo que el personal tiene que hacer. quotation_id NULL = del dia completo.';

-- ------------------------------------------------------------
-- PERMISOS — la lección del 42501 (migración 68): sin el GRANT al
-- service_role el backend recibe "permission denied" y la pantalla
-- se queda colgada. SIEMPRE va junto a la tabla nueva.
-- ------------------------------------------------------------
GRANT ALL ON public.day_notes TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.day_notes_id_seq TO service_role;

ALTER TABLE public.day_notes ENABLE ROW LEVEL SECURITY;
