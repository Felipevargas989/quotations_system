-- 95 · Contacto de marca en la empresa (25-08-2026)
-- Ver docs/arquitectura/11_MODULO_DE_MARKETING.md
--
-- Los correos de marketing llevan por defecto los canales de la
-- empresa: boton de WhatsApp (link abreviado generado del numero),
-- boton al formulario publico de cotizacion, y en la franja de cierre
-- los iconos de Instagram, Facebook y sitio web. Cada campo vacio
-- simplemente no aparece. Se configuran una vez en Configuracion.

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS whatsapp text,
  ADD COLUMN IF NOT EXISTS instagram text,
  ADD COLUMN IF NOT EXISTS facebook text,
  ADD COLUMN IF NOT EXISTS sitio_web text;
