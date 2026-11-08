/**
 * LA NOTA DE CRÉDITO TRAÍDA (doc 19 §9.36). Felipe, 08-11, con la #481 de
 * Santo Tomás: la 374 y la 375 se anularon en la página de facturacion.cl y
 * se volvieron a emitir como la 377 y la 378: *"tráete las notas de crédito
 * y las facturas, por favor"*. La nota entra a la cadena (§9.5) como si se
 * hubiera emitido acá: modifica el documento de su referencia, que tiene
 * que estar en Eventia, y dice cómo.
 *
 * El PDF de facturacion.cl no imprime el código de referencia (anula,
 * corrige un texto, rebaja), y el XML, que sí lo trae, se cobra aparte
 * (§9.33). Se saca de los montos, como los arma el SII: por el total del
 * documento, anula; en cero, corrige un texto; por menos, rebaja. Por más
 * que el documento, no cuadra y no se trae.
 */

/** Lo que una nota de crédito puede modificar: un documento con folio. */
export const MODIFICABLES = new Set(['33', '34', '39', '56']);

export const codigoPorLosMontos = (
  nota: number,
  delDocumento: number,
): 1 | 2 | 3 | null => {
  if (nota === delDocumento) return 1;
  if (nota === 0) return 2;
  return nota > 0 && nota < delDocumento ? 3 : null;
};
