-- Migración 108 — CERRAR EL GRIFO: que las tablas NUEVAS dejen de nacer
-- abiertas (11-09-2026). DECISIÓN APARTE de la 107: la 107 cierra las 12
-- que ya están abiertas; esta impide que aparezca una decimotercera.
--
-- LO MEDIDO EL 11-09 EN PRODUCCIÓN (yxezscjznhlnxxdmuvoq): el esquema
-- public arrastra unos "permisos por defecto" que le entregan permisos
-- COMPLETOS a los roles públicos en cada tabla nueva creada por `postgres`:
--
--   esquema public · tablas ->
--     {postgres=arwdDxtm, anon=arwdDxtm, authenticated=arwdDxtm,
--      service_role=arwdDxtm}
--
-- Eso es exactamente por qué las 12 de la migración 107 nacieron abiertas
-- pese a que las migraciones 40 y 41 habían cerrado todo en julio: el
-- REVOKE de julio limpió las tablas de ese momento, pero el grifo quedó
-- abierto para las siguientes.
--
-- DATO QUE LO CONFIRMA: el LABORATORIO (uonjtbyoxawxvhuikbgx) NO tiene esta
-- entrada para public. Por eso allá las mismas 12 tablas existen pero
-- `anon` y `authenticated` no tienen ni un permiso, y el lab lleva meses
-- funcionando perfecto así. El lab es la prueba de que el sistema no
-- necesita estos permisos para nada.
--
-- QUÉ CAMBIA HACIA ADELANTE: una tabla nueva nacerá SIN permisos para los
-- roles públicos. Las migraciones de la casa ya le dan GRANT explícito a
-- service_role (es la costumbre desde la migración 49), así que el motor no
-- se entera. Si algún día una tabla SÍ necesita que el navegador la lea
-- directo, hay que dárselo a mano y con RLS + políticas de verdad.
--
-- NO TOCA NINGUNA TABLA EXISTENTE. En particular `rutina_gym_state` (la app
-- personal de Felipe, que sí entra con la llave pública) queda intacta: ya
-- tiene su seguridad de fila encendida con su política, y los permisos por
-- defecto solo afectan a lo que se cree DESPUÉS. Si algún día esa app
-- necesita una tabla nueva, habrá que darle el GRANT a mano.
--
-- LÍMITE HONESTO: existe una segunda entrada de permisos por defecto a
-- nombre de `supabase_admin` (rol de la plataforma) que desde acá no se
-- puede modificar. Las tablas del sistema las crea `postgres`, que es la
-- que esta migración cierra.
--
-- Reversa: 108_cerrar_el_grifo.reversa.sql
-- CORRER EN PRODUCCIÓN. (En el lab no hace falta: allá el grifo ya está
-- cerrado — no existe la entrada.)

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- CÓMO COMPROBAR QUE QUEDÓ BIEN (correr después de aplicar):
--
--   SELECT pg_get_userbyid(d.defaclrole) AS rol_creador,
--          n.nspname AS esquema,
--          d.defaclobjtype AS tipo,
--          d.defaclacl::text AS permisos_por_defecto
--   FROM pg_default_acl d
--   LEFT JOIN pg_namespace n ON n.oid = d.defaclnamespace
--   WHERE n.nspname = 'public';
--
-- En las filas de `postgres` ya no deben aparecer `anon=` ni
-- `authenticated=`. `service_role` SÍ debe seguir apareciendo.
-- ---------------------------------------------------------------------------
