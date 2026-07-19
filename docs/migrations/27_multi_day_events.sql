-- Eventos de más de un día (Etapa 2): la cotización gana un "hasta"
-- opcional. NULL = evento de un solo día (todo lo histórico sigue igual).
-- El evento se cotiza como un todo (camino A): mismos servicios y total;
-- el rango manda en conflictos de fecha y en la retención de mobiliario
-- (el stock se descuenta TODOS los días del rango y se libera al día
-- siguiente del último).

ALTER TABLE public.quotations
  ADD COLUMN IF NOT EXISTS event_end_date timestamptz;
