// EL ABONO PARA RESERVAR LA FECHA (Felipe, 22-10-2026): "en empresa poner
// una parte donde se configure qué porcentaje de abono, y abajo del precio
// poner el % y el abono calculado para la reserva". El % vive en la
// configuración de la empresa (companies.abono_reserva_pct, migración 160);
// vacío o 0 = la cotización no muestra la línea. Se calcula sobre el total
// con IVA SIN la propina sugerida, que es opcional.

/** El % de abono de la empresa como número, o null si no corresponde.
 *  Supabase entrega numeric como texto ("30.00"). */
export const pctDeAbono = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 && n <= 100 ? n : null;
};

/** El abono en pesos, o null si la empresa no lo usa o el total no da.
 *  Lo usan la línea de la hoja y la primera cuota del plan de pagos
 *  (28-10-2026), así el plan parte con el mismo monto que vio el cliente. */
export const montoDelAbono = (
  totalSinPropina: number,
  pctCrudo: unknown,
): number | null => {
  const pct = pctDeAbono(pctCrudo);
  if (pct === null || !(totalSinPropina > 0)) return null;
  return Math.round((totalSinPropina * pct) / 100);
};

/** La línea que va bajo el TOTAL de la hoja, o null si la empresa no la
 *  usa o el total no da para calcularla. */
export const lineaDelAbono = (
  totalSinPropina: number,
  pctCrudo: unknown,
): string | null => {
  const pct = pctDeAbono(pctCrudo);
  const monto = montoDelAbono(totalSinPropina, pctCrudo);
  if (pct === null || monto === null) return null;
  const pctTxt = pct.toLocaleString("es-CL", { maximumFractionDigits: 2 });
  return `La fecha queda reservada solo al recibir el abono del ${pctTxt}%: $${monto.toLocaleString("es-CL")}.`;
};
