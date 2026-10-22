-- 151: ARMAR LA OFERTA (decisión 33 del doc 17, 19-10-2026).
--
-- Felipe: "busca una forma que sea escalable... quizás vincular a la
-- cotización y que ambos lean la cotización". La oferta de una licitación
-- se arma una sola vez, con IA: por cada especificación técnica de las
-- bases, qué se ofrece y con qué productos del catálogo (la matriz), más lo
-- que falta en el catálogo. De ahí sale la cotización vinculada, y de la
-- cotización, la propuesta técnica y los anexos. Es un trabajo más de la IA,
-- con la misma forma que los demás (oportunidad_generacion, migración 129):
-- un tipo nuevo, 'oferta'.
--
-- Primero en el laboratorio (Cotizador); a producción, con el OK de Felipe.

alter table public.oportunidad_generacion
  drop constraint if exists oportunidad_generacion_tipo_check;
alter table public.oportunidad_generacion
  add constraint oportunidad_generacion_tipo_check
  check (tipo in ('anexos', 'firma', 'propuesta', 'resumen', 'oferta'));
