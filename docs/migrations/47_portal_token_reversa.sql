-- REVERSA migración 47: elimina el token del portal.
ALTER TABLE public.quotations DROP COLUMN IF EXISTS portal_token;
