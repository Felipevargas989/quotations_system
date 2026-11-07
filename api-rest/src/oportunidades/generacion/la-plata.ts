// LA PLATA DE LA OFERTA: el IVA, el neto y cómo se escriben los pesos.
// Aparte de instrucciones.ts (que la vuelve a exportar) para que el reparto
// del precio (postulacion/el-reparto.ts) la lea sin importarse en círculo.

export const IVA = 0.19;

/** El monto de la oferta: la empresa pone el total con IVA (así piensa
 *  Felipe: "valores con IVA porque se factura") y el neto y el IVA salen de
 *  aquí, no de la IA. */
export const desgloseDeOferta = (total: number) => {
  const neto = Math.round(total / (1 + IVA));
  return { total, neto, iva: total - neto };
};

export const pesos = (n: number): string => `$${n.toLocaleString('es-CL')}`;
