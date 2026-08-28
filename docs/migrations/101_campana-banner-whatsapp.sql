-- Banner y WhatsApp PROPIOS por campaña (Felipe 28-08): opcionales —
-- nulos = se usa la marca de Configuración, como siempre. Ejemplo:
-- empresas con su número, cabañas con el de recepción.
ALTER TABLE public.marketing_campaigns
  ADD COLUMN IF NOT EXISTS banner_url text,
  ADD COLUMN IF NOT EXISTS whatsapp text;
GRANT ALL ON public.marketing_campaigns TO service_role;
