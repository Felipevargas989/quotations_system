-- Reversa de 61: elimina el motivo de pérdida.
ALTER TABLE public.quotations DROP COLUMN IF EXISTS loss_reason;
