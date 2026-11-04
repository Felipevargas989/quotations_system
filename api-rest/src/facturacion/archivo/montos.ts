/**
 * EL NETO, EL IVA Y EL TOTAL DE UN DOCUMENTO (doc 19, L8 y L17)
 *
 * La factura se arma desde el neto, como lo calcula el SII: el IVA es el
 * 19 % del neto, redondeado al peso, y el total es la suma. En Eventia todo
 * va con IVA incluido, y no todo total con IVA sale exacto desde un neto:
 * a veces queda $1 arriba o abajo. Por eso el armador busca el neto que
 * más se acerca y dice cuánto se aleja, para avisarlo antes de emitir.
 */

export const TASA_IVA = 19;

export interface Montos {
  neto: number;
  exento: number;
  iva: number;
  total: number;
}

/** Del neto (y lo exento): el IVA redondeado al peso y el total. */
export const montosDesdeElNeto = (
  neto: number,
  exento = 0,
  tasa = TASA_IVA,
): Montos => {
  const iva = Math.round((neto * tasa) / 100);
  return { neto, exento, iva, total: neto + exento + iva };
};

/**
 * El neto que deja el total con IVA más cerca del pedido. `diferencia` es
 * lo que el documento queda arriba (+) o abajo (−) del total pedido: 0 si
 * calza al peso.
 */
export const netoParaElTotal = (
  total: number,
  tasa = TASA_IVA,
): Montos & { diferencia: number } => {
  const base = Math.round(total / (1 + tasa / 100));
  let mejor = montosDesdeElNeto(base, 0, tasa);
  for (const neto of [base - 1, base + 1]) {
    const otro = montosDesdeElNeto(neto, 0, tasa);
    if (Math.abs(otro.total - total) < Math.abs(mejor.total - total))
      mejor = otro;
  }
  return { ...mejor, diferencia: mejor.total - total };
};

/**
 * El neto y el IVA que van DENTRO de un total con IVA, como en la boleta y
 * en los PDF de la casa: el neto redondeado y el IVA, lo que falta. Calza
 * siempre al peso.
 */
export const desgloseDelTotal = (total: number, tasa = TASA_IVA): Montos => {
  const neto = Math.round(total / (1 + tasa / 100));
  return { neto, exento: 0, iva: total - neto, total };
};

/**
 * El neto de un precio con IVA, con los 6 decimales que admite el archivo:
 * así 78 menús de $55.000 suman exacto $4.290.000 con su IVA.
 */
export const precioNetoDe = (precioConIva: number, tasa = TASA_IVA): number =>
  Math.round((precioConIva / (1 + tasa / 100)) * 1e6) / 1e6;
