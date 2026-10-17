-- ============================================================
-- 140 · El derecho «Seguimiento con IA» para Valle del Sol (17-10-2026)
--
-- El botón «✉ Generar seguimiento» (doc 18) escribe con Claude el correo de
-- seguimiento de una cotización cuyo próximo contacto venció y es por
-- correo, y lo deja como BORRADOR en el hilo del cliente en Outlook. Las
-- llaves (Anthropic y Outlook) y los buzones son de Valle del Sol, así que
-- es un MÓDULO PROPIO, como cotizar_con_ia (migración 130): no lo da ningún
-- plan, lo da la columna `modulos_propios`.
--
-- Solo datos: agrega 'seguimiento_con_ia' a la empresa 1 si no lo tiene. Se
-- aplica primero en el laboratorio y después en producción, ANTES de
-- publicar el motor que lo pide. Idempotente.
--
-- Número: de la 131 en adelante usa Oportunidades; la 140 quedó reservada
-- para esto (acordado con esa sesión el 17-10).
-- ============================================================

update public.companies
   set modulos_propios = array_append(modulos_propios, 'seguimiento_con_ia')
 where id = 1
   and not ('seguimiento_con_ia' = any (modulos_propios));

-- ============================================================
-- REVERSA (Valle del Sol deja de ver el botón; nada más cambia):
--   update public.companies
--      set modulos_propios = array_remove(modulos_propios, 'seguimiento_con_ia')
--    where id = 1;
-- ============================================================
