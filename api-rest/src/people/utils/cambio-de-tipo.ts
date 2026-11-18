import { laPuedeQuitarLaProyeccion } from '../people.service';
import { tipoALaFecha, type ConHistorial, type Tipo } from './tipo-vigente';

/**
 * QUÉ LES PASA A SUS DÍAS DE STAFF AL CAMBIAR DE TIPO (doc 10 §12).
 *
 * La tabla que aprobó Felipe el 17-11-2026, con maqueta:
 *
 *  - Desde la fecha, sus días de STAFF (sin evento) toman el tipo nuevo.
 *  - Lo que ya está en una liquidación o una nómina NO se toca; la ventana
 *    dice cuántos días quedan así.
 *  - De planta a freelance: los días de planta que puso el sistema y
 *    todavía no llegan se quitan; los que ya trabajó (hasta hoy) quedan
 *    como freelance esperando su monto.
 *  - De freelance a planta: el día pasa a planta, sin monto y confirmado
 *    (es su turno). Queda marcado como día puesto a mano ('trabaja') para
 *    que la proyección no lo borre si cae en su día libre.
 *  - Los días de eventos NO cambian, ni la fila solo-de-propina.
 *
 * Los días de planta que faltan desde la fecha (hoy en adelante) los pone
 * la proyección de siempre, que lee el tipo de cada día del historial. El
 * pasado nunca se rellena: un día que no tiene fila no se inventa.
 *
 * Función pura: la misma cuenta sirve para la ventana (cuántos cambian) y
 * para aplicar el cambio.
 */

export interface FilaDeStaff {
  id: number;
  day: string;
  quotation_id: string | null;
  kind: string | null;
  amount: number | null;
  tip_amount: number | null;
  payroll_id: number | null;
  tip_payroll_id: number | null;
  ajuste: 'trabaja' | 'descansa' | null;
  solo_propina?: boolean | null;
}

export interface PlanDelCambio {
  /** Cada grupo va en un solo viaje a la base: mismos cambios, varias filas. */
  cambios: { ids: number[]; datos: Record<string, unknown> }[];
  quitar: number[];
  aPlanta: number;
  aFreelance: number;
  /** Los que habría que tocar pero ya están liquidados o en una nómina. */
  sinTocar: number;
}

const A_PLANTA = {
  kind: 'planta',
  amount: null,
  status: 'confirmado',
  ajuste: 'trabaja',
};
const A_FREELANCE_SIN_MONTO = {
  kind: 'freelance',
  ajuste: null,
  status: 'por_confirmar',
};
// Una planta con asignación extra ya tiene monto: no vuelve a «por
// confirmar», solo cambia de tipo.
const A_FREELANCE_CON_MONTO = { kind: 'freelance', ajuste: null };

export const planDelCambioDeTipo = (args: {
  filas: readonly FilaDeStaff[];
  /** La persona con el historial YA con el cambio nuevo. */
  persona: ConHistorial;
  desde: string;
  hoy: string;
  /** Días de staff con la propina ya resuelta (liquidados). */
  liquidados: ReadonlySet<string>;
}): PlanDelCambio => {
  const { filas, persona, desde, hoy, liquidados } = args;
  const aPlanta: number[] = [];
  const aFreelanceSin: number[] = [];
  const aFreelanceCon: number[] = [];
  const quitar: number[] = [];
  let sinTocar = 0;

  for (const fila of filas) {
    const dia = String(fila.day).slice(0, 10);
    // Los eventos no cambian, y la fila solo-de-propina tampoco: es la
    // propina de un evento repartida en el día, no una jornada.
    if (fila.quotation_id !== null || fila.solo_propina) continue;
    if (dia < desde) continue;

    const tipo: Tipo = tipoALaFecha(persona, dia);
    const esPlanta = (fila.kind ?? 'planta') === 'planta';
    let destino: 'planta' | 'freelance' | 'quitar' | null = null;
    if (tipo === 'planta' && !esPlanta) destino = 'planta';
    if (tipo === 'freelance' && esPlanta) {
      if (fila.ajuste === 'descansa') {
        // El día dormido de su patrón: ya no es su patrón. El que viene se
        // quita; el que pasó no se trabajó y se deja como estaba.
        destino = dia > hoy ? 'quitar' : null;
      } else if (
        dia > hoy &&
        fila.ajuste === null &&
        laPuedeQuitarLaProyeccion(fila)
      ) {
        destino = 'quitar'; // lo puso el sistema y todavía no llega
      } else {
        destino = 'freelance'; // ya lo trabajó, o lo pusieron a mano
      }
    }
    if (destino === null) continue;

    const enNomina =
      fila.payroll_id != null ||
      fila.tip_payroll_id != null ||
      liquidados.has(dia);
    if (enNomina) {
      sinTocar += 1;
      continue;
    }

    if (destino === 'quitar') quitar.push(fila.id);
    else if (destino === 'planta') aPlanta.push(fila.id);
    else if (Number(fila.amount ?? 0) > 0) aFreelanceCon.push(fila.id);
    else aFreelanceSin.push(fila.id);
  }

  const cambios = [
    { ids: aPlanta, datos: A_PLANTA },
    { ids: aFreelanceSin, datos: A_FREELANCE_SIN_MONTO },
    { ids: aFreelanceCon, datos: A_FREELANCE_CON_MONTO },
  ].filter((c) => c.ids.length > 0);

  return {
    cambios,
    quitar,
    aPlanta: aPlanta.length,
    aFreelance: aFreelanceSin.length + aFreelanceCon.length,
    sinTocar,
  };
};
