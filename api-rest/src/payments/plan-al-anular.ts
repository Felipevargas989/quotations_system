/**
 * AL ANULAR, LO PAGADO ES EL 100% (Felipe, 22-10-2026; doc 14 §Anular).
 * "Cuando un evento se anule, (…) dejar todo como está, asumir que eso es
 * el 100%, ya sea que tenga cuotas semi pagadas, y generar el reembolso o
 * no". El plan de pagos se cierra en lo que ya se pagó:
 * - una cuota pagada queda igual;
 * - una cuota a medio pagar queda en lo abonado, pagada;
 * - una cuota sin abonos se borra.
 * Así no queda nada por cobrar: ni cobranza, ni «Vencido», ni una deuda
 * falsa en la ficha del cliente. El reembolso es la pregunta aparte de
 * siempre (utils/reembolso-al-anular.ts). Las cuotas «pagadas por fuera»
 * (pagadas sin registros, datos de carga) no se tocan nunca, como en el
 * resto del doc 14.
 */
export interface CuotaAlAnular {
  readonly id: string;
  readonly amount: number | string;
  readonly status: string;
  readonly pagadaPorFuera?: boolean;
}

export interface PiezaAlAnular {
  readonly payment_id: string;
  readonly amount: number | string;
}

export interface PlanAlAnular {
  /** Cuotas que quedan en lo abonado (o se marcan pagadas). */
  readonly cerrar: { id: string; amount: number }[];
  /** Cuotas sin un peso abonado: se borran. */
  readonly borrar: string[];
}

export function planAlAnular(
  cuotas: readonly CuotaAlAnular[],
  piezas: readonly PiezaAlAnular[],
): PlanAlAnular {
  // Supabase entrega numeric como texto: todo se suma con Number().
  const abonado = new Map<string, number>();
  for (const p of piezas)
    abonado.set(
      p.payment_id,
      (abonado.get(p.payment_id) ?? 0) + Number(p.amount),
    );

  const cerrar: { id: string; amount: number }[] = [];
  const borrar: string[] = [];
  for (const c of cuotas) {
    if (c.pagadaPorFuera) continue;
    const pagado = Math.round(abonado.get(c.id) ?? 0);
    const monto = Math.round(Number(c.amount));
    if (pagado <= 0) borrar.push(c.id);
    else if (pagado < monto) cerrar.push({ id: c.id, amount: pagado });
    else if (c.status !== 'pagado') cerrar.push({ id: c.id, amount: monto });
  }
  return { cerrar, borrar };
}
