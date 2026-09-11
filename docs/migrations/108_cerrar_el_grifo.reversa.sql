-- REVERSA de la migración 108 — vuelve a abrir el grifo: las tablas nuevas
-- del esquema public volverán a nacer con permisos completos para los roles
-- públicos `anon` y `authenticated`.
--
-- OJO: esto restaura justamente la condición que creó el problema del
-- 11-09-2026 (12 tablas abiertas al mundo sin que nadie lo pidiera). No
-- debería necesitarse nunca. Existe solo porque toda migración lleva su
-- reversa.

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON TABLES TO anon, authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON SEQUENCES TO anon, authenticated;
