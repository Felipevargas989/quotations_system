import type { PaymentTransaction } from "../../services/paymentTransactions.service";

/**
 * UN PAGO REPARTIDO EN VARIAS CUOTAS ES UNO SOLO (cuotas que se llenan,
 * docs/arquitectura/14_CUOTAS_QUE_SE_LLENAN.md, caso 11; Felipe,
 * 07-10-2026). Lo pagado llena las cuotas desde la primera, así que un
 * mismo pago puede quedar en dos cuotas (Linde: $1.000.000 = $950.250 en
 * la 1 + $49.750 en la 2). Cada pedazo es un registro; todos comparten
 * `pago_grupo`. Corregirlo o borrarlo es sobre el pago ENTERO — el motor
 * ya lo hace así; esto es para que la pantalla lo diga.
 */

type ConRegistros = { readonly transactions?: PaymentTransaction[] };

/** Todos los pedazos del pago al que pertenece `t`. */
export const piezasDelPago = (
  cuotas: readonly ConRegistros[],
  t: PaymentTransaction,
): PaymentTransaction[] => {
  if (!t.pago_grupo) return [t];
  const piezas = cuotas
    .flatMap((c) => c.transactions ?? [])
    .filter((x) => x.pago_grupo === t.pago_grupo);
  return piezas.length > 0 ? piezas : [t];
};

/** El pago entero: el registro con el monto de todas sus piezas. Es lo
 *  que se abre al rectificar. */
export const pagoEntero = (
  cuotas: readonly ConRegistros[],
  t: PaymentTransaction,
): PaymentTransaction => ({
  ...t,
  amount: piezasDelPago(cuotas, t).reduce((s, p) => s + Number(p.amount), 0),
});

/** La pregunta antes de borrar: si el pago está repartido, lo avisa. */
export const preguntaAlBorrar = (
  cuotas: readonly ConRegistros[],
  t: PaymentTransaction,
): string => {
  const piezas = piezasDelPago(cuotas, t);
  if (piezas.length < 2) return "¿Eliminar este pago?";
  const total = piezas.reduce((s, p) => s + Number(p.amount), 0);
  return `¿Eliminar este pago de $${total.toLocaleString("es-CL")}? Está repartido en ${piezas.length} cuotas y se elimina entero.`;
};
