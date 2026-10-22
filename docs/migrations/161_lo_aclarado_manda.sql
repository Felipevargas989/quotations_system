-- 161: LO ACLARADO MANDA (22-10-2026, decisión 68 del doc 17).
--
-- Felipe: "una sola memoria por licitación ok". La memoria de una licitación
-- es el análisis de las bases más lo aclarado en «Pregúntale a la IA»: las
-- respuestas que dicen los documentos (seguridad alta) entran solas; las
-- deducciones (media) y lo que no está (baja) entran solo cuando la persona
-- anota lo que confirmó el comprador. La oferta, los anexos, la propuesta
-- técnica y la validación leen esa misma memoria.
--
-- confirmado_por va SIN llave foránea a user_profiles a propósito: la tabla
-- ya tiene preguntado_por → user_profiles, y una segunda llave haría ambiguo
-- el `quien:user_profiles(full_name)` del motor que esté corriendo.

alter table public.oportunidad_preguntas
  add column if not exists confirmado text,
  add column if not exists confirmado_por uuid,
  add column if not exists confirmado_en timestamptz;
