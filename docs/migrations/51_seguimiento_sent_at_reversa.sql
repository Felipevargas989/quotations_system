-- REVERSA migración 51.
ALTER TABLE public.quotations DROP COLUMN IF EXISTS sent_at;
