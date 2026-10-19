-- 152: LAS EXIGENCIAS QUE MARCA LA EMPRESA (19-10-2026).
--
-- Felipe, revisando «Bases y criterios»: "debería ser como un listado de
-- exigencias, así como almuerzo, esto. Y marcar algunos que sean como lo
-- tengo y otro hay que conseguir o revisar. Y quizás con alguna función que
-- yo pueda ir haciendo un check... Y si marco uno que no puedo, bueno,
-- desisto con la postulación."
--
-- Por oportunidad, lo que la empresa marcó en cada exigencia de las bases:
--   {"<la exigencia, en minúsculas y sin tildes>": "lo_tengo" | "no_puedo"}
-- La clave es el texto de la exigencia, no su posición: si se vuelven a
-- analizar las bases, lo marcado sigue con su exigencia.
--
-- Número 152: del 146 al 149 los usa la otra conversación de Eventia.
-- Primero en el laboratorio (Cotizador); a producción, con el OK de Felipe.

alter table public.oportunidades
  add column if not exists exigencias_marcadas jsonb not null default '{}'::jsonb;

comment on column public.oportunidades.exigencias_marcadas is
  'Lo que la empresa marcó en cada exigencia de las bases: lo_tengo o no_puedo, por el texto de la exigencia (migración 152).';
