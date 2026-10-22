/**
 * EL ABONO PARA RESERVAR LA FECHA (Felipe, 22-10-2026; migración 160).
 * Cada empresa configura su porcentaje y la hoja de la cotización lo
 * muestra bajo el TOTAL. Supabase entrega `numeric` como TEXTO ("30.00"):
 * acá se vuelve número, y todo lo que no sea un % válido mayor que cero
 * queda en null (la línea no sale).
 */
export const pctDeAbono = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 && n <= 100 ? n : null;
};
