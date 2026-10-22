// EL COMENTARIO INTERNO (17-10-2026, migración 128).
//
// Felipe: "cada requerimiento debería tener dos campos de comentario, uno
// que lo ve el cliente y otro interno". Observaciones es el que ve el
// cliente (sale en el PDF); este es el del equipo, y nunca sale.
//
// El motor lo entrega solo a una sesión de la misma empresa (la ficha
// pública de la encuesta lo quita). Si una cotización llega sin el campo,
// la pantalla no lo deja editar ni lo manda al guardar: mandar un vacío
// borraría lo que el equipo escribió.

/** La cotización llegó sin el campo: no se edita. */
export const comentarioNoCargado = (
  valor: string | null | undefined,
): boolean => valor === undefined;

/** Lo que viaja al guardar: el texto (en blanco = null) si se cargó; nada
 *  si no se cargó, y así el motor conserva el que tenía. */
export const comentarioParaGuardar = (
  valor: string | null | undefined,
): { comentario_interno?: string | null } => {
  if (valor === undefined) return {};
  return { comentario_interno: valor && valor.trim() ? valor : null };
};
