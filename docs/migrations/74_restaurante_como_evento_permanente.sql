-- ===========================================================================
-- EL RESTAURANTE COMO EVENTO PERMANENTE (Felipe, 15-08)
--
-- "Tratarlo como un evento más, con fecha de inicio y término indefinida,
-- y que solo hago las liquidaciones de pago."
--
-- Una asignación SIN evento (quotation_id NULL) es del restaurante. La
-- sábana lo muestra SIEMPRE — por eso la vista de planificación existe
-- aunque no haya ningún evento — y la nómina liquidará sus jornadas y
-- propinas igual que las de cualquier evento. Reemplaza a la "ficha de
-- restaurante semanal" de la etapa 7: misma función, cero pantallas
-- nuevas.
--
-- ⚠ NO LA CORRE EL SISTEMA. Aplicada y verificada en el laboratorio.
-- ===========================================================================

ALTER TABLE public.event_staff
  ALTER COLUMN quotation_id DROP NOT NULL;

COMMENT ON COLUMN public.event_staff.quotation_id IS
  'El evento. NULL = restaurante: el evento permanente, sin fechas.';

-- En el restaurante, una persona una vez por día. (En eventos ya existe la
-- unicidad por evento+persona+día; una persona SÍ puede tener restaurante
-- Y un evento el mismo día — pasa en el Excel: Soledad Molina el 1 de mayo.)
CREATE UNIQUE INDEX IF NOT EXISTS event_staff_restaurante_persona_dia_uniq
  ON public.event_staff (company_id, person_id, day)
  WHERE quotation_id IS NULL;
