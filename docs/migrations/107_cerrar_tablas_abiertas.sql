-- Migración 107 — CERRAR LAS 12 TABLAS QUE NACIERON ABIERTAS (11-09-2026).
--
-- QUÉ PASA HOY (medido el 11-09-2026 en PRODUCCIÓN, yxezscjznhlnxxdmuvoq):
-- estas 12 tablas tienen la seguridad de fila APAGADA y los roles públicos
-- `anon` y `authenticated` con permisos COMPLETOS sobre ellas:
--   SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER.
-- La llave `anon` es publicable y viaja DENTRO del bundle del frontend, así
-- que cualquiera que la saque de la web puede leer, modificar, borrar o
-- vaciar estas tablas por la API REST, saltándose el motor entero.
-- Comprobado desde afuera con la llave real del sitio (solo conteos, sin
-- leer filas): marketing_contacts respondió 2.150 · marketing_sends 3.501 ·
-- quotation_followups 203 · marketing_suppressions 224.
--
-- POR QUÉ PASÓ: las migraciones 40 y 41 (28-07) cerraron todas las tablas
-- que existían ESE DÍA, pero el esquema public conserva unos "permisos por
-- defecto" que le regalan permisos completos a anon y authenticated en CADA
-- TABLA NUEVA. Las tablas creadas después que sí hicieron
-- `ENABLE ROW LEVEL SECURITY` (people, payrolls, staff_sheets, day_notes,
-- event_staff, push_devices…) quedaron protegidas igual. Estas 12 se
-- saltaron ese paso. El grifo mismo se cierra en la 108, que va aparte.
--
-- QUÉ NO CAMBIA: el motor entra con service_role, que tiene GRANT propio en
-- las 12 (verificado el 11-09) y además es inmune a RLS por diseño. El
-- frontend y la app móvil NO tocan estas tablas directo — censo en los
-- bundles PUBLICADOS de producción: 0 accesos, la llave anon se usa solo
-- para iniciar sesión. Las puertas públicas (formulario de consultas,
-- portal del mandante, baja de correos) pasan todas por el motor con
-- @Public. Nadie legítimo pierde acceso.
--
-- Es exactamente el patrón de la migración 68 (people/job_roles): permisos
-- solo para service_role, seguridad de fila ENCENDIDA y SIN políticas.
--
-- Reversa: 107_cerrar_tablas_abiertas.reversa.sql
-- CORRER EN LAB Y EN PRODUCCIÓN. (En el lab el REVOKE no encuentra nada que
-- quitar —ahí anon/authenticated nunca tuvieron permisos— y solo actúa el
-- ENABLE: sirve igual como ensayo de que encender RLS no rompe el motor.)

BEGIN;

-- 1) Quitarle a los roles públicos TODO permiso sobre estas 12 tablas.
REVOKE ALL ON TABLE
  public.portal_receipts,
  public.fixed_service_sections,
  public.quotation_followups,
  public.marketing_contacts,
  public.marketing_suppressions,
  public.marketing_campaigns,
  public.marketing_sends,
  public.marketing_audiences,
  public.service_group_collection_fixed_services,
  public.consultas,
  public.consulta_config,
  public.event_types
FROM anon, authenticated;

-- 2) Encender la seguridad de fila, sin ninguna política. Segundo candado
--    (si un permiso volviera a colarse, RLS igual bloquea) y apaga el error
--    `rls_disabled_in_public` del asesor de Supabase.
ALTER TABLE public.portal_receipts                         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fixed_service_sections                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotation_followups                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_contacts                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_suppressions                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_campaigns                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_sends                         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_audiences                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_group_collection_fixed_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consultas                               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consulta_config                         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_types                             ENABLE ROW LEVEL SECURITY;

COMMIT;

-- ---------------------------------------------------------------------------
-- CÓMO COMPROBAR QUE QUEDÓ BIEN (correr después de aplicar):
--
--   SELECT c.relname,
--          c.relrowsecurity AS rls,
--          bool_or(g.grantee IN ('anon','authenticated')) AS quedan_publicos,
--          bool_or(g.grantee = 'service_role')            AS motor_ok
--   FROM pg_class c
--   JOIN pg_namespace n ON n.oid = c.relnamespace
--   LEFT JOIN information_schema.role_table_grants g
--     ON g.table_schema='public' AND g.table_name=c.relname
--   WHERE n.nspname='public' AND c.relkind='r' AND c.relname IN (
--     'portal_receipts','fixed_service_sections','quotation_followups',
--     'marketing_contacts','marketing_suppressions','marketing_campaigns',
--     'marketing_sends','marketing_audiences',
--     'service_group_collection_fixed_services','consultas',
--     'consulta_config','event_types')
--   GROUP BY 1,2 ORDER BY 1;
--
-- Las 12 tienen que quedar: rls = true · quedan_publicos = false ·
-- motor_ok = true. Y el asesor de seguridad debe bajar de 12 a 0 errores
-- de `rls_disabled_in_public`.
-- ---------------------------------------------------------------------------
