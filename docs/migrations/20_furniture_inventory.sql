-- Módulo Logística · Fase 5: el mobiliario pasa a ser INVENTARIO.
--   category:  cristaleria / cuchilleria / vajilla / mobiliario / otro
--   stock:     unidades disponibles (fluctúa por temporada, editable)
--   photo_url: foto de referencia (bucket público furniture-photos) para
--              distinguir ítems parecidos (7 tipos de platos, 5 cuchillos...)
--
-- Regla de consolidación (frontend): el mobiliario se lava y REUTILIZA
-- entre servicios → la necesidad de un evento es el MÁXIMO simultáneo
-- entre servicios, no la suma. Un ítem se libera al día siguiente, así
-- que los conflictos de stock son entre eventos de la MISMA fecha.

ALTER TABLE public.furniture_items
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'otro',
  ADD COLUMN IF NOT EXISTS stock numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS photo_url text;

-- Bucket público para las fotos + políticas (espejo de payment-receipts):
INSERT INTO storage.buckets (id, name, public)
  VALUES ('furniture-photos', 'furniture-photos', true)
  ON CONFLICT (id) DO NOTHING;

CREATE POLICY fp_auth_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'furniture-photos');
CREATE POLICY fp_auth_update ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'furniture-photos')
  WITH CHECK (bucket_id = 'furniture-photos');
CREATE POLICY fp_auth_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'furniture-photos');
CREATE POLICY fp_public_select ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'furniture-photos');
