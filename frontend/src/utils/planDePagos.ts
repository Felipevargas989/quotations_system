import { repartirEnCuotas } from "./repartirEnCuotas";

/**
 * EL PLAN DE PAGOS: CÓMO PARTE Y QUÉ SE PUEDE EDITAR (Felipe, 28-10-2026;
 * doc 14 §Editar el plan).
 *
 * Caso 703 (27-10-2026): el plan nació con una sola cuota del 100% para
 * ese mismo día —lo que proponía el editor— y Post-Venta no dejaba
 * repartirlo, así que se anuló y se volvió a aceptar, y el evento
 * desapareció de Post-Venta. Desde hoy:
 * - el plan parte con el ABONO de Mi empresa (el mismo que dice la hoja de
 *   la cotización bajo el TOTAL) para hoy y el saldo 7 días antes del
 *   evento. Siete es la mediana de los planes de dos cuotas de Valle del
 *   Sol desde junio (14 planes, medido el 28-10-2026). Sin % en la
 *   empresa, una cuota por el total, como antes;
 * - las cuotas con plata no se tocan: el editor las muestra fijas y lo que
 *   se reparte es el resto.
 */

/** Una cuota como la entrega `GET /payments?quotationId=`. */
export interface CuotaDelPlan {
  id: string;
  payment_number: number;
  amount: number | string;
  due_date: string | Date;
  status: string;
  payment_type?: string | null;
  notes?: string | null;
  payment_transactions?: { amount: number | string }[] | null;
}

/** Una fila del editor: comentario, fecha y monto en pesos. */
export interface FilaDelPlan {
  label: string;
  due_date: string;
  amount: number | undefined;
}

const pesos = (n: unknown) => Math.round(Number(n) || 0);

/** ¿La cuota tiene plata? Pagada o con algún pago registrado: esa no se
 *  mueve (el motor piensa igual, `tienePlata` en plan-editado.ts). */
export const cuotaConPlata = (c: CuotaDelPlan): boolean =>
  c.status === "pagado" || (c.payment_transactions || []).length > 0;

/** Lo abonado en una cuota. */
export const abonadoEn = (c: CuotaDelPlan): number =>
  (c.payment_transactions || []).reduce((s, t) => s + pesos(t.amount), 0);

/** ¿Las cuotas suman el total, al peso? Si no, al aceptar se abre el
 *  editor para completar el plan (un anulado que se vuelve a aceptar
 *  guarda solo lo pagado: «al anular, lo pagado es el 100%»). */
export const planCubreElTotal = (
  cuotas: readonly { amount: number | string }[],
  total: number | string | null | undefined,
): boolean =>
  cuotas.length > 0 &&
  cuotas.reduce((s, c) => s + pesos(c.amount), 0) === pesos(total);

/** La fecha del saldo: 7 días antes del evento, nunca antes de hoy. Las
 *  fechas de evento se guardan a medianoche UTC: se trabaja con el día. */
export const fechaDelSaldo = (
  fechaEvento: string | Date | null | undefined,
  hoy: string,
): string => {
  if (!fechaEvento) return hoy;
  const dia = (
    fechaEvento instanceof Date ? fechaEvento.toISOString() : fechaEvento
  ).slice(0, 10);
  const ms = Date.parse(`${dia}T00:00:00Z`);
  if (Number.isNaN(ms)) return hoy;
  const saldo = new Date(ms - 7 * 86_400_000).toISOString().slice(0, 10);
  return saldo < hoy ? hoy : saldo;
};

/** Cómo se reparte `objetivo` en `n` cuotas: con abono, la primera es el
 *  abono y el resto se reparte parejo en las demás; sin abono, todas
 *  parejas (Felipe, 06-10-2026: "que la propuesta inicial siempre sea
 *  fraccionada"). El resto de la división va a la primera que se reparte. */
export const propuestaDeMontos = (
  objetivo: number,
  n: number,
  abono: number | null,
): number[] => {
  if (n <= 0) return [];
  if (abono !== null && n >= 2 && abono > 0 && abono < objetivo) {
    return [abono, ...repartirEnCuotas(objetivo - abono, n - 1)];
  }
  return repartirEnCuotas(objetivo, n);
};

/** Las filas con que parte el editor cuando no hay cuotas sin plata que
 *  mostrar. Sin cuotas pagadas: abono hoy y saldo 7 días antes del evento.
 *  Con cuotas pagadas (un anulado que se vuelve a aceptar): una sola cuota
 *  por lo que falta, en la fecha del saldo. */
export const filasIniciales = ({
  objetivo,
  abono,
  conPagos,
  hoy,
  fechaEvento,
}: {
  objetivo: number;
  abono: number | null;
  conPagos: number;
  hoy: string;
  fechaEvento?: string | Date | null;
}): FilaDelPlan[] => {
  if (objetivo <= 0) return [];
  const saldo = fechaDelSaldo(fechaEvento, hoy);
  if (conPagos > 0) {
    return [
      { label: `Cuota ${conPagos + 1}`, due_date: saldo, amount: objetivo },
    ];
  }
  if (abono !== null && abono > 0 && abono < objetivo) {
    return [
      { label: "Cuota 1", due_date: hoy, amount: abono },
      { label: "Cuota 2", due_date: saldo, amount: objetivo - abono },
    ];
  }
  return [{ label: "Cuota 1", due_date: hoy, amount: objetivo }];
};
