-- ===========================================================================
-- FUSIÓN DE LOS CARGOS CON LOS RECURSOS DE PERSONAL
--
-- Decisión de Felipe el 14-08-2026, textual: "FUSIONALO ES LO MISMO TODO".
--
-- POR QUÉ: la migración 68 creó `job_roles` con los 10 cargos… y el sistema
-- YA tenía esa lista, en `management_resources` con type='personal'. Garzón
-- estaba escrito en las dos. Es exactamente el frankenstein que este módulo
-- venía a evitar, y lo introdujo el módulo mismo.
--
-- GANA `management_resources` porque ya está cableada en todo el sistema:
-- event_resources apunta ahí, Recursos la lee, Gestión calcula con ella.
-- Mover eso serían tres pantallas grandes; mover los cargos es una columna.
--
-- SE HACE AHORA porque hay UNA sola persona cargada. En un mes, con 186
-- fichas apuntando a job_roles, esto ya no sería gratis.
--
-- EQUIVALENCIAS, confirmadas por Felipe:
--     Desconche = Desconches          Mucama  = Personal aseo
--     Nochero   = Guardia nocturno    Monitor = Monitor actividad
-- Se conserva el nombre que YA se usaba en Recursos, porque es el que está
-- en uso. Renombrar es un clic desde Personas → Cargos.
--
-- EL PRECIO ES SOLO UNA SUGERENCIA, no decide nada. Se intentó usarlo como
-- señal de "este cargo se contrata" y Felipe lo desarmó el mismo día: un
-- garzón de PLANTA no cuesta y el mismo cargo con un freelance sí. Lo que
-- decide si una jornada cuesta plata es si LA PERSONA es planta o freelance
-- ESE DÍA — atributo de la persona, no del cargo.
-- Por eso TODOS los cargos aparecen en todas partes, tengan precio o no:
-- cualquiera puede necesitar un freelance alguna vez.
--
-- ⚠ EL ORDEN IMPORTA: la llave vieja se suelta ANTES de traducir. Al revés,
--   la traducción choca contra ella (se aprendió al primer intento).
--
-- ⚠ NO LA CORRE EL SISTEMA. Se aplica a mano en Supabase, laboratorio
--   primero. Aplicada y verificada en el laboratorio el 14-08-2026.
-- ===========================================================================

BEGIN;

CREATE TEMP TABLE equivalencias(cargo text, en_recursos text) ON COMMIT DROP;
INSERT INTO equivalencias VALUES
  ('Garzón','Garzón'), ('Desconche','Desconches'), ('Mucama','Personal aseo'),
  ('Nochero','Guardia nocturno'), ('Monitor','Monitor actividad'),
  ('Cocina','Cocina'), ('Cajera','Cajera'), ('Recepción','Recepción'),
  ('Patio','Patio'), ('Salvavidas','Salvavidas');

-- 1) Soltar la llave vieja PRIMERO.
ALTER TABLE public.people DROP CONSTRAINT IF EXISTS people_default_role_id_fkey;

-- 2) Crear solo los cargos que faltan de verdad. Sin precio: son de planta.
INSERT INTO public.management_resources (company_id, name, type, is_active)
SELECT DISTINCT jr.company_id, e.en_recursos, 'personal', true
FROM public.job_roles jr
JOIN equivalencias e ON e.cargo = jr.name
WHERE NOT EXISTS (
  SELECT 1 FROM public.management_resources m
  WHERE m.company_id = jr.company_id AND m.type = 'personal'
    AND lower(btrim(m.name)) = lower(btrim(e.en_recursos))
);

-- 3) Traducir el cargo de cada persona a su nueva casa.
UPDATE public.people p
SET default_role_id = m.id
FROM public.job_roles jr
JOIN equivalencias e ON e.cargo = jr.name
JOIN public.management_resources m
  ON m.company_id = jr.company_id AND m.type = 'personal'
 AND lower(btrim(m.name)) = lower(btrim(e.en_recursos))
WHERE p.default_role_id = jr.id;

-- Lo que no se pudo traducir queda SIN cargo, antes que apuntando mal.
UPDATE public.people p SET default_role_id = NULL
WHERE p.default_role_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.management_resources m WHERE m.id = p.default_role_id
  );

-- 4) La llave nueva.
ALTER TABLE public.people
  ADD CONSTRAINT people_default_role_id_fkey
  FOREIGN KEY (default_role_id) REFERENCES public.management_resources (id)
  ON DELETE SET NULL;

-- 5) Fuera la duplicada.
DROP TABLE IF EXISTS public.job_roles;

-- 6) Un cargo no se repite dentro de la empresa. Misma lección que el RUT:
--    "Garzón" y "Garzones " no pueden ser dos cosas distintas.
CREATE UNIQUE INDEX IF NOT EXISTS management_resources_company_tipo_nombre_uniq
  ON public.management_resources (company_id, type, lower(btrim(name)));

COMMENT ON COLUMN public.management_resources.list_price_fixed IS
  'Precio de referencia: una sugerencia para ahorrar tecleo. NO decide si el cargo se contrata — eso depende de si la persona es planta o freelance ese dia.';

COMMIT;

-- ---------------------------------------------------------------------------
-- CÓMO COMPROBAR QUE QUEDÓ BIEN:
--
--   SELECT m.name AS cargo, coalesce(m.list_price_fixed::text,'sin sugerencia') AS precio
--   FROM public.management_resources m
--   WHERE m.type='personal' AND m.is_active ORDER BY m.name;
--
-- Tienen que salir los 10 cargos, y NINGUNA persona puede quedar con un
-- default_role_id que no exista:
--
--   SELECT count(*) FROM public.people p
--   WHERE p.default_role_id IS NOT NULL
--     AND NOT EXISTS (SELECT 1 FROM public.management_resources m
--                     WHERE m.id = p.default_role_id);   -- tiene que dar 0
-- ---------------------------------------------------------------------------
