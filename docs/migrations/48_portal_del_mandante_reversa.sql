-- REVERSA migración 48.
ALTER TABLE public.quotations DROP COLUMN IF EXISTS client_contact_id;
ALTER TABLE public.client_contacts DROP COLUMN IF EXISTS portal_token;
