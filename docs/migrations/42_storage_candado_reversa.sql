-- REVERSA de la migración 42 en PRODUCCIÓN (estado exacto del
-- 28-07-2026, capturado con pg_get_expr antes de borrar). Emergencia.
UPDATE storage.buckets SET public = true WHERE id = 'payment-receipts';
CREATE POLICY "pr_auth_insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'payment-receipts');
CREATE POLICY "pr_auth_update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'payment-receipts') WITH CHECK (bucket_id = 'payment-receipts');
CREATE POLICY "pr_auth_delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'payment-receipts');
CREATE POLICY "pr_public_select" ON storage.objects FOR SELECT TO public USING (bucket_id = 'payment-receipts');
CREATE POLICY "cl_auth_insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'company-logos');
CREATE POLICY "cl_auth_update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'company-logos') WITH CHECK (bucket_id = 'company-logos');
CREATE POLICY "cl_auth_delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'company-logos');
CREATE POLICY "cl_public_select" ON storage.objects FOR SELECT TO public USING (bucket_id = 'company-logos');
CREATE POLICY "fp_auth_insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'furniture-photos');
CREATE POLICY "fp_auth_update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'furniture-photos') WITH CHECK (bucket_id = 'furniture-photos');
CREATE POLICY "fp_auth_delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'furniture-photos');
CREATE POLICY "fp_public_select" ON storage.objects FOR SELECT TO public USING (bucket_id = 'furniture-photos');
