-- Migración 54 — CÓDIGOS DE SERVICIO EN USO (30-07-2026, regla de
-- Felipe): el basurero del catálogo se apaga para servicios que
-- aparecen en alguna cotización (la foto guarda el CÓDIGO, no el id).
-- Función de solo lectura que entrega los códigos usados por empresa;
-- cubre fijos, y variables tanto en cajas (items anidados) como al
-- nivel superior (formatos antiguos).

CREATE OR REPLACE FUNCTION public.used_service_codes(p_company_id bigint)
RETURNS TABLE(code text)
LANGUAGE sql STABLE AS $$
  SELECT DISTINCT f->>'codigo'
  FROM public.quotations q,
       jsonb_array_elements(coalesce(q.items->'fixed_services','[]'::jsonb)) f
  WHERE q.company_id = p_company_id AND coalesce(f->>'codigo','') <> ''
  UNION
  SELECT DISTINCT i->>'codigo'
  FROM public.quotations q,
       jsonb_array_elements(coalesce(q.items->'variable_services','[]'::jsonb)) v,
       jsonb_array_elements(coalesce(v->'items','[]'::jsonb)) i
  WHERE q.company_id = p_company_id AND coalesce(i->>'codigo','') <> ''
  UNION
  SELECT DISTINCT v->>'codigo'
  FROM public.quotations q,
       jsonb_array_elements(coalesce(q.items->'variable_services','[]'::jsonb)) v
  WHERE q.company_id = p_company_id AND coalesce(v->>'codigo','') <> ''
$$;

GRANT EXECUTE ON FUNCTION public.used_service_codes(bigint) TO service_role;
