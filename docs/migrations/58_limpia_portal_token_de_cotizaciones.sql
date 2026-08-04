-- Migración 58 — limpieza anunciada por la 48: quotations.portal_token
-- (migración 47) quedó sin uso cuando el enlace del portal pasó a
-- vivir en la PERSONA (client_contacts.portal_token). El código no la
-- referencia en ninguna parte (verificado 03-08-2026). Idempotente:
-- en producción la columna ya no existía; en el laboratorio la borra.
ALTER TABLE public.quotations DROP COLUMN IF EXISTS portal_token;
