-- ============================================================
-- 130 · El derecho «Cotizar con IA» para Valle del Sol (17-10-2026)
--
-- El botón «✨ Crear con IA» (doc 16, sección 6) arma la cotización de un
-- requerimiento con Claude. La llave de Anthropic la paga Valle del Sol y
-- las reglas del armado son las suyas, así que es un MÓDULO PROPIO, como
-- personal y marketing (migración 111): no lo da ningún plan, lo da la
-- columna `modulos_propios`. Felipe decide después si entra en algún plan
-- para otras empresas (roadmap del botón, paso 4).
--
-- Solo datos: agrega 'cotizar_con_ia' a la empresa 1 si no lo tiene. Se
-- aplica primero en el laboratorio y después en producción, ANTES de
-- publicar el motor que lo pide. Idempotente.
--
-- Número: la 129 es de Oportunidades (129_oportunidades_generacion).
-- ============================================================

update public.companies
   set modulos_propios = array_append(modulos_propios, 'cotizar_con_ia')
 where id = 1
   and not ('cotizar_con_ia' = any (modulos_propios));

-- ============================================================
-- REVERSA (Valle del Sol deja de ver el botón; nada más cambia):
--   update public.companies
--      set modulos_propios = array_remove(modulos_propios, 'cotizar_con_ia')
--    where id = 1;
-- ============================================================
