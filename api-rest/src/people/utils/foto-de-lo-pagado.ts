/**
 * LA FOTO DE LO PAGADO (doc 10 §15, 20-11-2026, migración 213).
 *
 * La nómina no guardaba montos: `payroll_people` solo tiene las marcas de
 * pagado, y cada pantalla sumaba el monto de HOY de cada fila. Cuando el
 * 19-11 una fila ya pagada bajó de $25.000 a $20.000, la nómina 11 pasó a
 * decir $20.000, aunque el banco pagó $25.000, y nada guardaba lo
 * pagado de verdad.
 *
 * Desde la 213, al sellar una fila en una nómina se guarda lo que se
 * pagó (`monto_pagado`, `propina_pagada`), y todo lo que muestra o suma
 * una nómina lee esa foto, no el valor de hoy. Las filas selladas antes
 * de la 213 se rellenaron con el valor que tenían ese día y quedan
 * marcadas `foto_reconstruida`: es una reconstrucción, no una medición.
 */

export interface FilaConFoto {
  payroll_id?: number | null;
  tip_payroll_id?: number | null;
  amount?: number | string | null;
  tip_amount?: number | string | null;
  monto_pagado?: number | string | null;
  propina_pagada?: number | string | null;
}

/** La misma fila, con la jornada y la propina SELLADAS leídas de la foto.
 *  Lo que no está en una nómina, o no tiene foto, queda como está. */
export function conFoto<T extends FilaConFoto>(f: T): T {
  return {
    ...f,
    amount:
      f.payroll_id != null && f.monto_pagado != null
        ? f.monto_pagado
        : f.amount,
    tip_amount:
      f.tip_payroll_id != null && f.propina_pagada != null
        ? f.propina_pagada
        : f.tip_amount,
  };
}
