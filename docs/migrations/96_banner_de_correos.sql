-- 96 · Banner de correos de marketing (26-08-2026)
-- Ver docs/arquitectura/11_MODULO_DE_MARKETING.md
--
-- Imagen ancha de marca (ideal ~1200x300) que, cuando existe,
-- REEMPLAZA el encabezado del correo (nombre + logo): el banner ya
-- trae la marca adentro, y por ser imagen se ve identica en modo
-- claro y oscuro. Se sube en Configuracion (balde company-logos,
-- <empresa>_banner). Sin banner: encabezado en el color primario.

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS banner_url text;
