-- Bucket público de Storage para comprobantes de pago, comprobantes de
-- reembolso (prefijo refund-receipts/) y documentos del evento (prefijo
-- event-documents/). En dev no existía; esto también habilita la subida de
-- comprobantes de pago ya implementada.
INSERT INTO storage.buckets (id, name, public)
VALUES ('payment-receipts', 'payment-receipts', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "pr_auth_insert" ON storage.objects;
CREATE POLICY "pr_auth_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'payment-receipts');

DROP POLICY IF EXISTS "pr_auth_update" ON storage.objects;
CREATE POLICY "pr_auth_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'payment-receipts')
  WITH CHECK (bucket_id = 'payment-receipts');

DROP POLICY IF EXISTS "pr_auth_delete" ON storage.objects;
CREATE POLICY "pr_auth_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'payment-receipts');

DROP POLICY IF EXISTS "pr_public_select" ON storage.objects;
CREATE POLICY "pr_public_select" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'payment-receipts');
