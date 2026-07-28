-- Migración 40 (APLICADA 28-07-2026): se cierran TODAS las puertas
-- laterales. Culminación de "una sola puerta" (mudanzas 1-7): el
-- frontend ya no toca ninguna tabla directo (censo: 0 accesos, 0
-- realtime), así que ni siquiera una SESIÓN VÁLIDA puede leer o
-- escribir tablas directo — todo pasa por el backend y sus guardias
-- (sesión, cargo, empresa, frecuencia, registros limpios).
-- El backend usa la llave de servicio (inmune a RLS por diseño).
-- Storage (archivos) y Auth no se tocan.
-- Reversa: 40_cerrar_acceso_directo.reversa.sql

DO $$
DECLARE p RECORD;
BEGIN
  FOR p IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND policyname = 'app_authenticated'
  LOOP
    EXECUTE format('DROP POLICY %I ON %I.%I', p.policyname, p.schemaname, p.tablename);
  END LOOP;
END $$;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM authenticated;
