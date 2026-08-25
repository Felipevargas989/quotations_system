-- 90 · El sello "puesto en" de la jornada (25-08-2026)
--
-- Felipe: "que el personal que voy agregando vaya quedando en el
-- ultimo lugar, como es una lista agregada". El orden de llegada no
-- puede salir del id (sentarse en una SILLA del plan reusa una fila
-- vieja) ni del updated_at (cualquier edicion lo mueve). La jornada
-- guarda CUANDO se sento a la persona y las casillas ordenan por eso.

ALTER TABLE public.event_staff
  ADD COLUMN IF NOT EXISTS puesto_en timestamptz;

COMMENT ON COLUMN public.event_staff.puesto_en IS
  'Cuando se sento a la persona en esta jornada (migracion 90). Las casillas de Planificacion ordenan por esto: lista de agregado, el nuevo al final. NULL = anterior a la migracion (se ordena por created_at).';
