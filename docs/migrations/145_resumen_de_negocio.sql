-- 145: EL RESUMEN DE NEGOCIO DE UNA LICITACIÓN SEGUIDA (decisión 30 del doc
-- 17, 19-10-2026).
--
-- Felipe: "que analice todos los documentos y que me haga un resumen con
-- perspectiva de negocio: quién se la ganó, qué incluye el programa, qué
-- postuló, bajo qué precios... información que me pueda servir para
-- negocios del Valle". Es un trabajo más de la IA, con la misma forma que
-- los demás (oportunidad_generacion, migración 129): un tipo nuevo,
-- 'resumen'.
--
-- Primero en el laboratorio (Cotizador); a producción, con el OK de Felipe.

alter table public.oportunidad_generacion
  drop constraint if exists oportunidad_generacion_tipo_check;
alter table public.oportunidad_generacion
  add constraint oportunidad_generacion_tipo_check
  check (tipo in ('anexos', 'firma', 'propuesta', 'resumen'));
