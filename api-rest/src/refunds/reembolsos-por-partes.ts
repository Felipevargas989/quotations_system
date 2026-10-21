// REEMBOLSOS POR PARTES (20-10-2026). Felipe, al registrar $4.000.000 de un
// reembolso de $10.000.000 en el laboratorio: "no me deja seguir ingresando
// reembolsos". «Registrar» reemplazaba el monto del reembolso pendiente por
// lo registrado y el resto se perdía. Ahora lo PENDIENTE es lo que falta por
// devolver (la barra roja de la ficha) y cada registro es una fila pagada:
// registrar descuenta de lo pendiente, eliminar lo devuelve, y nunca se
// registra más de lo que falta.

export type Pendiente = { readonly id: string; readonly amount: number };

/** Cómo descontar `monto` de los pendientes, del más antiguo al más nuevo:
 *  los que se cubren enteros se borran; el último se achica. */
export const descontarDePendientes = (
  pendientes: readonly Pendiente[],
  monto: number,
): { achicar: Pendiente[]; borrar: string[]; resto: number } => {
  const achicar: Pendiente[] = [];
  const borrar: string[] = [];
  let resto = monto;
  for (const p of pendientes) {
    if (resto <= 0) break;
    if (p.amount <= resto) {
      borrar.push(p.id);
      resto -= p.amount;
    } else {
      achicar.push({ id: p.id, amount: p.amount - resto });
      resto = 0;
    }
  }
  return { achicar, borrar, resto };
};

const creadoEl = (r: Record<string, unknown>): string =>
  typeof r.created_at === 'string' ? r.created_at : '';

/** Los reembolsos pendientes de una cotización, del más antiguo al más nuevo. */
export const pendientesDe = (
  reembolsos: readonly Record<string, unknown>[],
): Pendiente[] =>
  reembolsos
    .filter((r) => r.is_paid !== true)
    .sort((a, b) => creadoEl(a).localeCompare(creadoEl(b)))
    .map((r) => ({ id: String(r.id), amount: Number(r.amount) || 0 }));

export const faltaPorDevolver = (pendientes: readonly Pendiente[]): number =>
  pendientes.reduce((total, p) => total + p.amount, 0);

export const masDeLoQueFalta = (falta: number): string =>
  `No se puede registrar más de lo que falta por reembolsar ($${falta.toLocaleString('es-CL')}).`;

export const PENDIENTE_NO_SE_ELIMINA =
  'Lo pendiente es lo que falta por devolver: baja registrando reembolsos.';
