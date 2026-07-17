-- Reembolso "rico": fecha, medio de pago y comprobante adjunto.
-- La tabla refunds ya tiene: id, created_at, amount, quotation_id, is_paid.
ALTER TABLE public.refunds
  ADD COLUMN IF NOT EXISTS refund_date date,
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS receipt_url text;
