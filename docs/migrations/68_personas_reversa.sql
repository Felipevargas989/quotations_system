-- ===========================================================================
-- REVERSA de 68_personas.sql
--
-- ⚠ BORRA LAS DOS TABLAS Y TODO LO QUE TENGAN ADENTRO.
--   Solo tiene sentido si la etapa 1 se acaba de aplicar y todavía no se
--   cargó gente. Si ya hay personas con sus datos bancarios, esto pierde
--   ese trabajo — y es trabajo que no está guardado en ninguna otra parte,
--   porque en el Excel esos datos NO existen.
-- ===========================================================================

BEGIN;

DROP TRIGGER  IF EXISTS people_touch_updated_at_trg ON public.people;
DROP FUNCTION IF EXISTS public.people_touch_updated_at();

DROP TABLE IF EXISTS public.people;
DROP TABLE IF EXISTS public.job_roles;

COMMIT;
