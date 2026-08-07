-- Reversa de la migración 65.
ALTER TABLE public.quotation_followups
  DROP COLUMN IF EXISTS next_contact_done_at;
