import { UserRole } from 'src/users/entities/user.entity';

// RECEPCIÓN CON BELIA (doc 20 §13; Felipe, 04-11-2026: "pasarle Belia a la
// recepcionista para que pueda hacer preguntas sobre disponibilidad,
// seguimientos que sigue ocultando el tema de los montos totales" y, de la
// bitácora, "más que mostrarles, como darle contexto").
//
// Recepción ve el calendario, en qué va el pedido de cada cliente y la
// bitácora como contexto, y crea requerimientos. Nunca ve un monto, un
// precio ni el enlace a la ficha del negocio, que su pantalla no abre. La
// barrera está acá, en el código y no en las instrucciones: las
// herramientas le devuelven los datos sin plata, y todo lo que le llega
// pasa además por `sinMontos`, por si un monto venía escrito a mano en una
// nota.

export const esRecepcion = (rol: string | null | undefined): boolean =>
  rol === UserRole.RECEPCION;

/** Lo que parece plata: «$1.250.000», «$ 45.000», «US$ 30», «1.250.000
 *  pesos», «25 lucas», «3 UF». */
const PLATA: readonly RegExp[] = [
  /(?:US|CL)?\$\s?\d[\d.,]*/gi,
  /\b\d{1,3}(?:\.\d{3})+(?:,\d+)?\s?(?:pesos|clp)\b/gi,
  /\b\d+(?:[.,]\d+)?\s?(?:lucas|palos|millones|mill[oó]n|mil pesos|uf)\b/gi,
];

export const MONTO_TAPADO = '[monto]';

/** El texto con la plata tapada. */
export const sinMontos = (texto: string): string =>
  PLATA.reduce((t, r) => t.replace(r, MONTO_TAPADO), texto);
