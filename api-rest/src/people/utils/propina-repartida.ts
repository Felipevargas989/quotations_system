/**
 * LA PROPINA NO SE DESHACE A MEDIAS (doc 10 §14, 19-11-2026).
 *
 * El 19-11 se repartieron $20.000 en el día de staff del 14-11; después
 * ese día se reabrió, el pozo se bajó a $0 y se marcó «sin propina». El
 * día quedó «sin propina» con pozo $0, pero los $20.000 siguieron
 * escritos en cinco filas, rumbo a la nómina: ni bajar el pozo ni
 * «sin propina» borraban lo repartido. Felipe: «ok arreglemoslo».
 *
 * Funciones puras: cuánto hay repartido en un pozo y qué total queda
 * cuando se le cambia el monto. Las decisiones viven en
 * PropinaRepartidaService.
 */

/** Lo que se lee de cada fila de un pozo. */
export interface FilaDelPozo {
  person_id: number | null;
  tip_amount: number | string | null;
  tip_payroll_id: number | null;
}

/** Lo repartido en un pozo: cuánta plata, entre cuántas personas, en
 *  cuántas filas, y si algo ya entró a una nómina. */
export interface Repartido {
  monto: number;
  personas: number;
  filas: number;
  enNomina: boolean;
}

export const NADA_REPARTIDO: Repartido = {
  monto: 0,
  personas: 0,
  filas: 0,
  enNomina: false,
};

/** Supabase entrega numeric como texto (mordió el 24-08): Number() antes
 *  de sumar. */
const num = (v: number | string | null | undefined) => Number(v ?? 0) || 0;

export function resumirRepartido(filas: readonly FilaDelPozo[]): Repartido {
  const conPlata = filas.filter((f) => num(f.tip_amount) !== 0);
  return {
    monto: Math.round(conPlata.reduce((t, f) => t + num(f.tip_amount), 0)),
    personas: new Set(conPlata.map((f) => f.person_id).filter((p) => p != null))
      .size,
    filas: filas.length,
    enNomina: filas.some((f) => f.tip_payroll_id != null),
  };
}

/**
 * El total que queda en el pozo después del cambio, o null si el cambio
 * no toca los montos (solo el área, por ejemplo). Lo que el cambio no
 * trae se toma del pozo como está.
 */
export function totalTrasCambio(
  actual: {
    first_amount: number | string | null;
    second_amount: number | string | null;
  },
  cambio: { first_amount?: number; second_amount?: number },
): number | null {
  if (cambio.first_amount === undefined && cambio.second_amount === undefined) {
    return null;
  }
  return Math.round(
    num(cambio.first_amount ?? actual.first_amount) +
      num(cambio.second_amount ?? actual.second_amount),
  );
}

/** $20.000, con punto de miles, sin depender del idioma del servidor. */
export function pesos(monto: number): string {
  const signo = monto < 0 ? '-' : '';
  const entero = String(Math.abs(Math.round(monto)));
  return `${signo}$${entero.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
}

/** «$20.000 de propina repartida entre 5 personas». */
export function textoDelRepartido(r: Repartido): string {
  const quien = r.personas === 1 ? '1 persona' : `${r.personas} personas`;
  return `${pesos(r.monto)} de propina repartida entre ${quien}`;
}

export const YA_EN_NOMINA =
  'Esa propina ya entró a una nómina: no se puede borrar. Lo que haya que corregir se ajusta en la nómina siguiente.';
