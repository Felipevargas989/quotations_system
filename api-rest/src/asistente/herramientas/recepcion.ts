import { UserRole } from 'src/users/entities/user.entity';
import type { ContextoDeHerramienta } from './comun';

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
// de un cliente particular le llega completo, con la marca
// `particular: true`, y la red no lo toca. Lo demás, igual que antes.

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

/** La red de recepción sobre lo que devuelve una herramienta: tapa la plata
 *  escrita en todos los textos, menos dentro de lo que trae la marca
 *  `particular: true` (una fila, una ficha o un cliente de un particular,
 *  doc 21). La marca la pone el código de la herramienta, nunca un texto de
 *  la base: un texto que la diga es solo un texto, y se tapa. */
export const taparPlata = (valor: unknown): unknown => {
  if (typeof valor === 'string') return sinMontos(valor);
  if (Array.isArray(valor)) return valor.map(taparPlata);
  if (valor && typeof valor === 'object') {
    const o = valor as Record<string, unknown>;
    if (o.particular === true) return o;
    return Object.fromEntries(
      Object.entries(o).map(([k, v]) => [k, taparPlata(v)]),
    );
  }
  return valor;
};

/** Los tipos de cliente particulares de la empresa, para recepción (doc
 *  21). Los demás cargos no los necesitan: ven toda la plata. Sin la pieza,
 *  o si falla la lectura, ninguno: recepción sigue sin plata. */
export const particularesPara = async (
  ctx: Pick<ContextoDeHerramienta, 'usuario' | 'alcance'>,
): Promise<ReadonlySet<string>> => {
  if (!esRecepcion(ctx.usuario.role) || !ctx.alcance) return new Set();
  try {
    return await ctx.alcance.particulares(ctx.usuario.company_id);
  } catch {
    return new Set();
  }
};
