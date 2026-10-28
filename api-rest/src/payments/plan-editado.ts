/**
 * EDITAR EL PLAN DE PAGOS (Felipe, 28-10-2026; doc 14 §Editar el plan).
 *
 * Caso 703 (27-10-2026): el plan nació con una sola cuota del 100% para ese
 * mismo día y después no había cómo repartirlo —Post-Venta solo movía la
 * fecha y la nota de una cuota—, así que se anuló y se volvió a aceptar, y
 * el evento desapareció de Post-Venta. Felipe: "ella quería editar las
 * cuotas, igual los eventos no deberían desaparecer".
 *
 * La regla, la misma al armar el plan y al editarlo:
 * - las cuotas con plata (con algún pago registrado, marcadas pagadas o
 *   «pagadas por fuera») quedan como están, primero y en su orden;
 * - las cuotas sin un peso se reemplazan por las nuevas, en el orden en que
 *   vienen: comentario, fecha y monto;
 * - entre todas suman AL PESO el total de la cotización (el portero del
 *   caso 501, 06-09).
 * Después el servicio vuelve a repartir lo pagado desde la primera (regla 3
 * del doc 14): como las cuotas con plata van primero, la plata no se mueve.
 *
 * Antes (hasta el 28-10-2026) armar el plan borraba TODAS las cuotas y las
 * creaba de nuevo: con abonos encima el borrado fallaba en silencio (la base
 * no deja borrar una cuota con pagos colgando) y el plan quedaba duplicado.
 */
import { diaDe, pesos } from './cuotas-que-se-llenan';

export interface CuotaQueEsta {
  readonly id: string;
  readonly payment_number: number;
  readonly amount: number | string;
  readonly due_date: string | Date | null;
  readonly status: string;
  readonly pagadaPorFuera?: boolean;
}

export interface PiezaQueEsta {
  readonly payment_id: string | null;
}

/** Lo que pide la pantalla por cada cuota sin plata. */
export interface CuotaPedida {
  readonly payment_type?: string | null;
  readonly due_date?: string | Date | null;
  readonly amount?: number | string | null;
  readonly notes?: string | null;
}

export interface CuotaPorCrear {
  payment_number: number;
  payment_type: string;
  due_date: string;
  amount: number;
  notes: string;
  status: 'pendiente' | 'vencido';
}

export type PlanEditado =
  | {
      readonly ok: true;
      /** Cuotas con plata: quedan como están. */
      readonly fijas: CuotaQueEsta[];
      /** Cuotas sin un peso: se borran. */
      readonly borrar: string[];
      /** Las nuevas, numeradas después de las fijas. */
      readonly crear: CuotaPorCrear[];
    }
  | { readonly ok: false; readonly motivo: string };

/** ¿La cuota tiene plata? Un pago registrado (aunque sea de $0: la base no
 *  deja borrar una cuota con pagos colgando), marcada pagada o «pagada por
 *  fuera». La misma idea que `updatePaymentSchedule` (Nivel A). */
export const tienePlata = (
  c: CuotaQueEsta,
  piezas: readonly PiezaQueEsta[],
): boolean =>
  c.pagadaPorFuera === true ||
  c.status === 'pagado' ||
  piezas.some((p) => p.payment_id === c.id);

const clp = (n: number) => `$${n.toLocaleString('es-CL')}`;

export function planEditado(
  cuotas: readonly CuotaQueEsta[],
  piezas: readonly PiezaQueEsta[],
  pedidas: readonly CuotaPedida[],
  totalCrudo: number | string | null | undefined,
  hoy: string,
): PlanEditado {
  const total = pesos(totalCrudo);
  const fijas = cuotas
    .filter((c) => tienePlata(c, piezas))
    .sort((a, b) => a.payment_number - b.payment_number);
  const borrar = cuotas.filter((c) => !tienePlata(c, piezas)).map((c) => c.id);

  // Primero el portero: es lo que avisa que el total cambió (caso 501).
  const conPlata = fijas.reduce((s, c) => s + pesos(c.amount), 0);
  const nuevas = pedidas.reduce((s, p) => s + pesos(p.amount), 0);
  if (conPlata + nuevas !== total) {
    return {
      ok: false,
      motivo:
        fijas.length > 0
          ? `Las cuotas con pagos suman ${clp(conPlata)} y las nuevas ${clp(nuevas)}: entre todas deben sumar ${clp(total)}, el total de la cotización. Si el total cambió hace poco, recarga la página y arma el plan de nuevo.`
          : `Las cuotas suman ${clp(nuevas)} pero la cotización vale ${clp(total)}. El total pudo cambiar hace poco: recarga la página y arma el plan de nuevo.`,
    };
  }

  const ultimaFija = fijas.reduce((m, c) => Math.max(m, c.payment_number), 0);
  const crear: CuotaPorCrear[] = [];
  for (const [i, p] of pedidas.entries()) {
    const comentario = String(p.payment_type ?? '').trim();
    const dia = diaDe(p.due_date ?? null);
    const monto = pesos(p.amount);
    if (!comentario) {
      return { ok: false, motivo: `La cuota ${i + 1} no tiene comentario.` };
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) {
      return {
        ok: false,
        motivo: `La cuota ${i + 1} no tiene fecha de vencimiento.`,
      };
    }
    if (monto <= 0) {
      return {
        ok: false,
        motivo: `La cuota ${i + 1} debe tener un monto mayor que cero.`,
      };
    }
    crear.push({
      payment_number: ultimaFija + i + 1,
      payment_type: comentario,
      due_date: dia,
      amount: monto,
      notes: String(p.notes ?? ''),
      // Vencida = su día ya pasó en Chile (doc 14, "El reloj de la noche").
      status: dia < hoy ? 'vencido' : 'pendiente',
    });
  }

  return { ok: true, fijas, borrar, crear };
}
