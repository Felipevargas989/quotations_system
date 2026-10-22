-- 153: LA COMPARACIÓN DE OFERTAS (19-10-2026, decisión 41 del doc 17).
--
-- Felipe: "en las postuladas quiero una opción... para poder descargar
-- toda la información que haya subido otro posible competidor y analizar
-- la probabilidad de quién se va a adjudicar la licitación en base a los
-- criterios de evaluación... cargamos ambas ofertas, la mía va a salir de
-- acá, la otra la descargo y la sumo, y que la IA analice porcentualmente
-- quién cumple mejor según cada parámetro y cada nota según los criterios
-- de evaluación".
--
-- 1. Las ofertas de la competencia son archivos de la oportunidad: una
--    sección más, 'competencia', y de quién es cada uno (`competidor`, el
--    nombre del oferente como lo escribe la empresa).
-- 2. La comparación es un trabajo más de la IA: tipo 'comparacion'.
--
-- Número 153: del 146 al 149 los usa la otra conversación de Eventia.
-- Primero en el laboratorio (Cotizador); a producción, antes del motor.

alter table public.oportunidad_adjuntos
  drop constraint if exists oportunidad_adjuntos_seccion_check;
alter table public.oportunidad_adjuntos
  add constraint oportunidad_adjuntos_seccion_check
  check (seccion = any (array['bases'::text, 'postulacion'::text, 'competencia'::text]));

alter table public.oportunidad_adjuntos
  add column if not exists competidor text;

comment on column public.oportunidad_adjuntos.competidor is
  'Solo en la sección competencia: de qué oferente es la oferta (migración 153).';

alter table public.oportunidad_generacion
  drop constraint if exists oportunidad_generacion_tipo_check;
alter table public.oportunidad_generacion
  add constraint oportunidad_generacion_tipo_check
  check (tipo = any (array['anexos'::text, 'firma'::text, 'propuesta'::text, 'resumen'::text, 'oferta'::text, 'comparacion'::text]));
