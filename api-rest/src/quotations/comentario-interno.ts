// EL COMENTARIO INTERNO NO SALE DE LA EMPRESA (17-10-2026, migración 128).
//
// Felipe pidió dos comentarios por requerimiento: Observaciones, que ve el
// cliente (sale en el PDF), y uno interno para el equipo ("menú económico,
// tres días, con desayuno", "se excede el presupuesto"). El PDF, el correo
// y el portal arman sus datos con lista blanca (hoja-publica.ts), así que
// por ahí no sale. Pero GET /quotations/:id es una puerta pública —la abre
// la encuesta de satisfacción, sin sesión (mapa 01, zona de riesgo 8)— y
// devuelve la fila completa. Acá se le quita el comentario a quien no trae
// una sesión de la misma empresa de la cotización.

type FilaConComentario = {
  company_id?: number | string | null;
  comentario_interno?: string | null;
};

/** La misma fila sin `comentario_interno`, en una copia (la original no
 *  se toca). La usa también el formulario público, que devuelve la fila
 *  recién creada al visitante. */
export function filaSinComentario<T extends object>(fila: T): T {
  if (!fila || typeof fila !== 'object' || !('comentario_interno' in fila)) {
    return fila;
  }
  const copia = { ...fila } as T & { comentario_interno?: unknown };
  delete copia.comentario_interno;
  return copia;
}

/**
 * La respuesta tal cual si quien pregunta es de la empresa de la
 * cotización; si no (sin sesión, o de otra empresa), la misma respuesta
 * sin el campo `comentario_interno`.
 */
export function sinComentarioAjeno<T extends { data?: unknown }>(
  respuesta: T,
  empresaDeLaSesion: number | null,
): T {
  const fila = respuesta?.data as FilaConComentario | null | undefined;
  if (!fila || typeof fila !== 'object') return respuesta;
  if (
    empresaDeLaSesion !== null &&
    Number(fila.company_id) === empresaDeLaSesion
  ) {
    return respuesta;
  }
  return { ...respuesta, data: filaSinComentario(fila) };
}
