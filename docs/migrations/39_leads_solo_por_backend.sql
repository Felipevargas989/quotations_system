-- Migración 39: los leads entran SOLO por el backend (28-07-2026).
--
-- Mudanza #1 de "una sola puerta". La Fase 0 (RLS) dejó UNA política
-- pública viva: anon podía INSERT en leads, porque el formulario de la
-- landing escribía directo. Ese formulario ahora pasa por el backend
-- (POST /super-admin/lead: valida, guarda con la llave de servicio y
-- avisa a los admins), así que la puerta anónima se cierra.
--
-- ORDEN: aplicar SOLO después de desplegar el backend y publicar el
-- frontend con la mudanza. Al revés, el formulario de la landing
-- fallaría hasta publicar.
--
-- REVERSA: 39_leads_solo_por_backend.reversa.sql

DROP POLICY IF EXISTS public_insert_leads ON leads;
REVOKE INSERT ON leads FROM anon;
