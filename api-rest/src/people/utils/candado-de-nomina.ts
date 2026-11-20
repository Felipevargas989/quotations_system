/**
 * EL CANDADO A LO PAGADO (doc 10 §15, 20-11-2026).
 *
 * Felipe: «Una vez que el día se paga y se liquida, ya no se puede
 * editar, ni sumar, ni nada. Si no, va a pasar esto, que se van a
 * modificar los días para atrás, que ya están pagados, y el sistema va a
 * quedar en un bucle porque no se puede pagar y no se puede borrar y no
 * se sabe por qué pasó esto.»
 *
 * Lo que lo gatilló, en producción: el día de staff 09-11 se pagó en la
 * nómina del 10-11; el 11-11 se anotó a una persona más en ese día (quedó
 * suelta, imposible de pagar y de reabrir), y el 19-11 se bajó de $25.000
 * a $20.000 el monto de una fila ya pagada.
 *
 * LA REGLA, una sola: un día de staff o un evento con CUALQUIER fila en
 * una nómina (jornada o propina) queda congelado entero: no se agrega,
 * no se cambia y no se borra ninguna de sus filas. Es la misma regla que
 * ya usaba «Devolver a Liquidación» (`hayPagosEn`): las dos miran el
 * mismo grupo.
 *
 * Funciones puras: qué es un grupo y qué dice el mensaje. Las lecturas y
 * el candado en sí viven en CandadoDeNominaRepository, que llaman las
 * escrituras de jornadas de PeopleRepository.
 */

/** Un evento entero, o un día de staff (las filas sin evento de ese día). */
export type Grupo =
  | { quotation_id: string; day?: undefined }
  | { quotation_id?: undefined; day: string };

/** El grupo de una fila: su evento, o su día si no tiene evento. */
export function grupoDe(fila: {
  quotation_id?: string | null;
  day?: string | null;
}): Grupo | null {
  if (fila.quotation_id) return { quotation_id: fila.quotation_id };
  if (fila.day) return { day: String(fila.day).slice(0, 10) };
  return null;
}

/** Una clave para comparar grupos: «ev:<uuid>» o «dia:2026-11-09». */
export function claveDe(g: Grupo): string {
  return g.quotation_id ? `ev:${g.quotation_id}` : `dia:${g.day}`;
}

/** La nómina que selló el grupo, para nombrarla en el mensaje. */
export interface Sello {
  payroll_id: number;
  label: string | null;
}

/** «Este día ya se pagó en la Nómina 10-11-2026: …». */
export function mensajeDelCandado(g: Grupo, sello: Sello): string {
  const que = g.quotation_id ? 'Este evento' : 'Este día';
  const nomina = sello.label?.trim() || `nómina N° ${sello.payroll_id}`;
  return `${que} ya se pagó en la ${nomina}: no se puede agregar, cambiar ni borrar nada. Si falta pagar algo, anótalo como ajuste en un día abierto.`;
}
