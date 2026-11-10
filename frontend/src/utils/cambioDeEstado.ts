// EL CAMBIO DE ESTADO EN EL SEGUIMIENTO (Felipe, 09-11-2026): "cuando
// alguien mueva una cotización de estado, ¿se puede generar el registro en
// seguimiento? de quién la movió, de qué estado a cuál estado"; "que no
// cuente como gestión en el semáforo, y que lo firme quien lo mueve".
//
// La línea la escribe el motor (api-rest/src/quotation-followups/
// cambio-de-estado.ts): «Cambió el estado de Enviada a En Negociación.»,
// con el tipo «estado». Nadie la elige al anotar, y nadie la edita ni la
// borra: es un registro.

export const TIPO_CAMBIO_DE_ESTADO = "estado";

export const esCambioDeEstado = (nota: {
  readonly tipo?: string | null;
}): boolean => nota.tipo === TIPO_CAMBIO_DE_ESTADO;

/** ¿Alguien la movió a Enviada? Entonces la línea gris «Cotización enviada
 *  al cliente», que sale de `sent_at`, repetiría lo mismo sin firma. */
export const pasoAEnviada = (
  notas: readonly { readonly tipo?: string | null; readonly note: string }[],
): boolean =>
  notas.some((n) => esCambioDeEstado(n) && / a Enviada\.(\s|$)/.test(n.note));
