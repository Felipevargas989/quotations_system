-- REVERSA de la migración 109 — vuelve a dejar get_backup_tables() al
-- alcance de cualquiera con la llave publicable.
--
-- OJO: esto reabre `/rest/v1/rpc/get_backup_tables` al mundo, o sea vuelve a
-- entregar el nombre de todas las tablas del esquema public a quien lo pida.
-- Existe solo porque toda migración lleva su reversa.
--
-- NO hace falta para arreglar el respaldo diario: el respaldo usa
-- service_role, que conserva su permiso explícito en la 109. Si el respaldo
-- fallara, el problema NO es esta migración — revisar el balde `backups` y
-- el log de BackupCronService antes de revertir.

GRANT EXECUTE ON FUNCTION public.get_backup_tables() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_backup_tables() TO anon, authenticated;
