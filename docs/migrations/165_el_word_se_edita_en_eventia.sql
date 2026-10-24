-- 165: EL WORD SE EDITA EN EVENTIA (24-10-2026, decisión 78 del doc 17).
--
-- Felipe, con el Formulario N°4 lleno de [COMPLETAR] en el visor: "hoy para
-- completar eso debo bajarlo, editarlo y subirlo... podríamos tener un
-- documento editable que pueda escribir y/o modificar en línea (lo básico:
-- escribir, borrar, negrita, cursiva)". «Editar» abre un Word de «Mi
-- postulación» en Eventia y guarda lo editado en el MISMO Word (solo los
-- párrafos que cambiaron; el diseño del formulario no se toca). La fila
-- pasa al archivo nuevo y queda dicho cuándo.
--
-- oportunidad_adjuntos.editado_en: cuándo se editó en Eventia (null =
-- nunca). Sirve para mostrarlo en la lista y para saber si lo validado es
-- de antes de editar.
--
-- OJO: el motor lee esta columna en TODAS las listas de archivos de una
-- oportunidad (`AdjuntosRepository`, COLUMNAS). Se corre a mano en cada
-- base ANTES del motor que la usa: sin ella, «Bases y anexos» y «Mi
-- postulación» dejan de cargar.

alter table public.oportunidad_adjuntos
  add column if not exists editado_en timestamptz;
