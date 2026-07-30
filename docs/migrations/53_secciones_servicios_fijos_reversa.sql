-- REVERSA migración 53.
ALTER TABLE public.fixed_services
  DROP COLUMN IF EXISTS section_id,
  DROP COLUMN IF EXISTS sort_order;
DROP TABLE IF EXISTS public.fixed_service_sections;
