-- Regla de negocio: los recursos de tipo PERSONAL nunca se cobran por
-- persona (en 4 años jamás ocurrió; delimitar evita errores de tipeo que
-- se multiplican × invitados). El frontend deshabilita el campo; esta
-- limpieza normaliza los datos existentes.

UPDATE public.management_resources
  SET list_price_per_person = NULL
  WHERE type = 'personal' AND list_price_per_person IS NOT NULL;

UPDATE public.event_resources er
  SET price_per_person = 0
  FROM public.management_resources mr
  WHERE er.resource_id = mr.id
    AND mr.type = 'personal'
    AND er.price_per_person > 0;
