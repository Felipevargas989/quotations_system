-- Migración 65 — PENDIENTE CUMPLIDO (07-08-2026, diseño de Felipe al
-- llevar el hilo de seguimiento a Post-Venta).
--
-- El hilo ya permite anotar un "próximo contacto". Cuando ese día llega,
-- Post-Venta lo avisa con un signo ámbar. Hacía falta poder apagarlo de
-- dos maneras (las dos que pidió Felipe): escribiendo la gestión
-- siguiente, o con un botón "Listo" para cuando uno cumplió y no tiene
-- nada que anotar.
--
-- Se marca con una FECHA, no borrando next_contact_date: la casa no
-- reescribe la historia. "Quedé de llamar el 11 y lo hice el 12" es un
-- dato; dejar la nota sin fecha sería perderlo.
-- 100 % aditiva.
ALTER TABLE public.quotation_followups
  ADD COLUMN IF NOT EXISTS next_contact_done_at timestamptz;

COMMENT ON COLUMN public.quotation_followups.next_contact_done_at IS
  'Cuándo se dio por cumplido el próximo contacto de esta nota. NULL con next_contact_date en el pasado = pendiente (aviso ámbar en Post-Venta).';
