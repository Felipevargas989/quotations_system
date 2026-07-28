-- Migración 42 — MISIÓN STORAGE: candado del balde de comprobantes.
-- Ensayada COMPLETA en el laboratorio el 28-07 (nombres de política del
-- lab difieren; los de abajo son los REALES de producción, capturados
-- con pg_get_expr antes de aplicar). APLICADA EN PRODUCCIÓN 28-07.
--
-- 1) payment-receipts deja de ser público: ver un archivo exige enlace
--    firmado que entrega el backend tras verificar el dueño (empresa).
-- 2) Fuera TODAS las políticas de storage.objects: el navegador no
--    puede leer/escribir baldes directo. La única puerta es el backend
--    (service_role no depende de políticas). company-logos y
--    furniture-photos siguen PÚBLICOS de lectura (bucket public=true
--    sirve /object/public sin políticas); su escritura va por backend.

UPDATE storage.buckets SET public = false WHERE id = 'payment-receipts';

DROP POLICY IF EXISTS "pr_auth_insert" ON storage.objects;
DROP POLICY IF EXISTS "pr_auth_update" ON storage.objects;
DROP POLICY IF EXISTS "pr_auth_delete" ON storage.objects;
DROP POLICY IF EXISTS "pr_public_select" ON storage.objects;
DROP POLICY IF EXISTS "cl_auth_insert" ON storage.objects;
DROP POLICY IF EXISTS "cl_auth_update" ON storage.objects;
DROP POLICY IF EXISTS "cl_auth_delete" ON storage.objects;
DROP POLICY IF EXISTS "cl_public_select" ON storage.objects;
DROP POLICY IF EXISTS "fp_auth_insert" ON storage.objects;
DROP POLICY IF EXISTS "fp_auth_update" ON storage.objects;
DROP POLICY IF EXISTS "fp_auth_delete" ON storage.objects;
DROP POLICY IF EXISTS "fp_public_select" ON storage.objects;
