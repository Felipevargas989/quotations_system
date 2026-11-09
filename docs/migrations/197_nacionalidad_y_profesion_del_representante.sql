-- 197: LA NACIONALIDAD Y LA PROFESIÓN DEL REPRESENTANTE LEGAL (09-11-2026,
-- decisión 121 del doc 17).
--
-- En la 2656-97-LE26 (Municipalidad de Tomé), el Anexo N°1 pedía la
-- nacionalidad y la profesión u oficio del representante legal, y la IA
-- los dejó pendientes: «Mi empresa» no tenía dónde guardarlos. Felipe:
-- "soy chileno y mi profesión es ingeniero civil industrial, y eso déjalo
-- guardado".
--
-- Número 197, reservado el 09-11 con las otras sesiones (Facturación tomó
-- hasta la 196). Primero en el laboratorio (Cotizador); a producción, antes
-- del motor (el motor pide estas columnas al leer «Mi empresa»).

alter table public.oportunidades_oferente
  add column if not exists representante_nacionalidad text,
  add column if not exists representante_profesion text;
