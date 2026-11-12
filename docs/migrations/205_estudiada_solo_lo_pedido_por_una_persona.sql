-- 205 · «ESTUDIADA» CUENTA SOLO LO QUE PIDIÓ UNA PERSONA (decisión 129 del
-- doc 17, sprint 2)
--
-- Felipe, 11-11-2026: *"de todo lo que marque amarillo o verde leyamos las
-- bases... hay un revisor que me dice claramente cuando algo no es para
-- mi"*. Desde la 129 las nuevas verdes y amarillas se preparan solas
-- después de cada pasada del radar: el motor trae sus documentos y pide el
-- análisis de las bases sin sesión, así que esas filas quedan con
-- `subido_por` y `pedido_por` vacíos (`PrepararLaLicitacionService`).
--
-- La 175 anotaba «estudiada» la primera vez que se suben o se traen las
-- bases o se pide su análisis, viniera de quien viniera. Con lo automático,
-- «estudiada» se llenaría de lo que nadie miró y el aprendizaje del
-- semáforo (decisión 113) perdería esa señal. Desde hoy cuenta solo lo que
-- pidió una persona: las bases que subió o trajo alguien
-- (`subido_por` con valor) y el análisis que pidió alguien (`pedido_por`
-- con valor). La función de la 175 no cambia; cambian las condiciones de
-- los dos triggers. Lo ya anotado se queda como está.
--
-- Se corre a mano en Supabase, en el laboratorio y en producción, antes del
-- motor que prepara solo. No depende de él: lo que sube o pide una persona
-- lleva su perfil, así que para ella nada cambia; solo deja de anotarse lo
-- que el motor hace sin nadie. Idempotente.

drop trigger if exists anotar_estudio_por_bases on public.oportunidad_adjuntos;
create trigger anotar_estudio_por_bases
  after insert on public.oportunidad_adjuntos
  for each row when (new.seccion = 'bases' and new.subido_por is not null)
  execute function public.oportunidades_anotar_estudio();

drop trigger if exists anotar_estudio_por_analisis on public.oportunidad_analisis;
create trigger anotar_estudio_por_analisis
  after insert on public.oportunidad_analisis
  for each row when (new.pedido_por is not null)
  execute function public.oportunidades_anotar_estudio();

-- Para deshacer (volver a la 175):
--   drop trigger if exists anotar_estudio_por_bases on public.oportunidad_adjuntos;
--   create trigger anotar_estudio_por_bases after insert on public.oportunidad_adjuntos
--     for each row when (new.seccion = 'bases')
--     execute function public.oportunidades_anotar_estudio();
--   drop trigger if exists anotar_estudio_por_analisis on public.oportunidad_analisis;
--   create trigger anotar_estudio_por_analisis after insert on public.oportunidad_analisis
--     for each row execute function public.oportunidades_anotar_estudio();
