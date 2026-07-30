-- REVERSA migración 55.
DROP FUNCTION IF EXISTS public.reorder_fixed_services(bigint, bigint, bigint[]);
DROP FUNCTION IF EXISTS public.reorder_services_in_category(bigint, bigint, bigint[]);
