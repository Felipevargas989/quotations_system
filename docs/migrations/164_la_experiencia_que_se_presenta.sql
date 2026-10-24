-- 164: LA EXPERIENCIA QUE SE PRESENTA (24-10-2026, decisión 76 del doc 17).
--
-- Felipe, con el anexo de experiencia del Día de Campo del Dirigente 2026:
-- "hay dos fuentes de información. La información que yo cargo en mi
-- empresa, que son todas las órdenes de compra que han pasado por el
-- mercado público... pueden ser la primera prioridad para completar esto.
-- Pero en caso de que ahí no esté la mejor experiencia... en segunda
-- instancia tiene que ir a la base de datos de Eventia... me puede
-- preguntar cuál está pensando traer. Yo le confirmo si sí o si no, que
-- busque otras. Y listo, con eso las arma. Dejemos eso como el proceso
-- estricto". Y sobre qué mostrar: "quiero no decir tanto mis clientes, que
-- me pueden ir a buscar... CCU es buena opción porque es un cliente
-- fidelizado... todo lo que sea municipalidad es correcto".
--
-- 1. oportunidad_generacion: un trabajo nuevo, 'experiencia'. La IA propone
--    la experiencia según las bases (resultado.elegidas, .faltan) y queda
--    ahí también lo que la empresa confirmó (resultado.confirmada). Sin
--    archivos. El índice único `oportunidad_generacion_una_en_curso` ya
--    cuida que haya uno solo en curso por tipo.
-- 2. oportunidades_oferente.clientes_que_se_muestran: los clientes privados
--    (sus id de Eventia) que la empresa deja mostrar como experiencia. Los
--    de tipo «Empresas Publicas» se muestran solos y los «Particulares»
--    nunca, sin importar esta lista.
--
-- Se corre a mano en las dos bases (laboratorio y producción), ANTES del
-- motor que la usa.

alter table public.oportunidad_generacion
  drop constraint if exists oportunidad_generacion_tipo_check;

alter table public.oportunidad_generacion
  add constraint oportunidad_generacion_tipo_check
  check (tipo in ('anexos', 'firma', 'propuesta', 'resumen', 'oferta', 'comparacion', 'aprendizaje', 'experiencia'));

alter table public.oportunidades_oferente
  add column if not exists clientes_que_se_muestran jsonb not null default '[]'::jsonb;
