-- La baja (y el rebote) recuerdan DE QUÉ CAMPAÑA vinieron, para la
-- cajita "Bajas" de la ficha (tasa de deserción por campaña).
-- Los links viejos sin campaña siguen funcionando: la columna es nula.
ALTER TABLE public.marketing_suppressions
  ADD COLUMN IF NOT EXISTS campaign_id bigint;
GRANT ALL ON public.marketing_suppressions TO service_role;
