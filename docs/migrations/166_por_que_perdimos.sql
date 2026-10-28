-- Migración 166 (decisión 97 del doc 17, 27-10): «Por qué perdimos».
-- Un trabajo de la IA más en oportunidad_generacion: cuando una postulada
-- queda perdida, explica por qué y si era razonable, con los criterios de
-- «Cómo te evalúan». No deja archivos. Se aplica en las dos bases.

alter table public.oportunidad_generacion
  drop constraint if exists oportunidad_generacion_tipo_check;

alter table public.oportunidad_generacion
  add constraint oportunidad_generacion_tipo_check
  check (tipo in ('anexos', 'firma', 'propuesta', 'resumen', 'oferta', 'comparacion', 'aprendizaje', 'experiencia', 'por_que'));
