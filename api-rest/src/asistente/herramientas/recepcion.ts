import { trabajaElTipo, type TiposQueTrabaja } from 'src/auth/permisos';
import type { AlcanceDeRecepcion } from 'src/clients/alcance-de-recepcion';
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
//
// Desde el doc 21 (Felipe, 04-11-2026: "Belia sí le puede dar con montos
// para recepción, pero solo de cotizaciones para particulares"): lo que es
// de un cliente particular le llega completo, con la marca `trabaja: true`,
// y la red no lo toca. Lo demás, igual que antes.
//
// Desde el doc 22 §9 (05-11-2026), lo mismo para cualquier cargo al que le
// apaguen un tipo de cliente en Permisos por cargo: lo de los tipos que
// trabaja le llega completo, con la marca; lo de los demás, sin plata. Un
// cargo que trabaja todos los tipos no pasa por la red, como siempre.

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

/** La red sobre lo que devuelve una herramienta a un cargo que no trabaja
 *  todos los tipos de cliente: tapa la plata escrita en todos los textos,
 *  menos dentro de lo que trae la marca `trabaja: true` (una fila, una ficha
 *  o un cliente de un tipo que su cargo trabaja). La marca la pone el código
 *  de la herramienta, nunca un texto de la base: un texto que la diga es
 *  solo un texto, y se tapa. */
export const taparPlata = (valor: unknown): unknown => {
  if (typeof valor === 'string') return sinMontos(valor);
  if (Array.isArray(valor)) return valor.map(taparPlata);
  if (valor && typeof valor === 'object') {
    const o = valor as Record<string, unknown>;
    if (o.trabaja === true) return o;
    return Object.fromEntries(
      Object.entries(o).map(([k, v]) => [k, taparPlata(v)]),
    );
  }
  return valor;
};

/** Ningún tipo: lo de quien no se puede saber qué trabaja. */
const NINGUNO: TiposQueTrabaja = {
  prendidos: new Set(),
  conocidos: new Set(),
  sinTipo: false,
};

/** Los tipos de cliente que trabaja el cargo de quien escribe (doc 22 §9;
 *  a recepción, de fábrica, los particulares, doc 21); null si los trabaja
 *  todos. Sin la pieza, lo de fábrica sin tipos: recepción, ninguno. Si
 *  falla la lectura, ninguno: sin plata. */
export const tiposPara = async (ctx: {
  usuario: { role?: string | null; company_id: number };
  alcance?: Pick<AlcanceDeRecepcion, 'tiposDelCargo'>;
}): Promise<TiposQueTrabaja> => {
  if (!ctx.alcance) return esRecepcion(ctx.usuario.role) ? NINGUNO : null;
  try {
    return await ctx.alcance.tiposDelCargo(ctx.usuario);
  } catch {
    return NINGUNO;
  }
};

/** Para una fila: null si el cargo trabaja todos los tipos (sin red); si
 *  no, si trabaja el de esta. */
export const loTrabaja = (
  tipos: TiposQueTrabaja,
  tipo: string | null | undefined,
): boolean | null => (tipos ? trabajaElTipo(tipos, tipo) : null);
