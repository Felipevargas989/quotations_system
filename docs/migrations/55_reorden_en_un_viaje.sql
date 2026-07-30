-- Migración 55 — REORDEN EN UN VIAJE (30-07-2026, pillada de Felipe:
-- arrastrar en servicios fijos "se demora"). El backend actualizaba el
-- orden mandando UNA orden por servicio (37 viajes para la caja Sin
-- sección). Estas funciones hacen todo el reorden de una pasada.

-- Fijos: sección destino + orden final (el arrastre y la cajita).
CREATE OR REPLACE FUNCTION public.reorder_fixed_services(
  p_company_id bigint,
  p_section_id bigint,
  p_ids bigint[]
) RETURNS void
LANGUAGE sql AS $$
  UPDATE public.fixed_services f
  SET section_id = p_section_id,
      sort_order = u.ord
  FROM unnest(p_ids) WITH ORDINALITY AS u(id, ord)
  WHERE f.id = u.id
    AND f.company_id = p_company_id;
$$;

-- Variables: orden de los servicios DENTRO de una categoría (los
-- vínculos multi-categoría de la migración 5).
CREATE OR REPLACE FUNCTION public.reorder_services_in_category(
  p_company_id bigint,
  p_category_id bigint,
  p_ids bigint[]
) RETURNS void
LANGUAGE sql AS $$
  UPDATE public.variable_service_categories l
  SET sort_order = u.ord
  FROM unnest(p_ids) WITH ORDINALITY AS u(id, ord)
  WHERE l.variable_service_id = u.id
    AND l.category_id = p_category_id
    AND l.company_id = p_company_id;
$$;

GRANT EXECUTE ON FUNCTION public.reorder_fixed_services(bigint, bigint, bigint[])
  TO service_role;
GRANT EXECUTE ON FUNCTION
  public.reorder_services_in_category(bigint, bigint, bigint[])
  TO service_role;
