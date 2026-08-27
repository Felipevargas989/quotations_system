-- Selección MÚLTIPLE de audiencias por campaña (27-08): la campaña
-- guarda la lista completa en jsonb; las columnas viejas quedan como
-- espejo de compatibilidad (primera audiencia + nombre combinado).
-- Campañas antiguas: audiencias NULL -> el motor usa las columnas viejas.
ALTER TABLE public.marketing_campaigns
  ADD COLUMN IF NOT EXISTS audiencias jsonb;
GRANT ALL ON public.marketing_campaigns TO service_role;
