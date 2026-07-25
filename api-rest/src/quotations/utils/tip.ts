// ---------- LA PROPINA (24-07, decisión de Felipe) ----------
// Criterio ÚNICO para todo el sistema: la propina pasa por la empresa
// pero NO es venta ni margen. Va entera al equipo.
//
// Por eso las ventas y la rentabilidad se miran SIEMPRE sobre el monto
// sin propina. Lo que NO se toca: lo que paga el cliente (total_amount),
// el documento que se le manda, el plan de pagos y lo cobrado — ahí la
// propina sí va, porque es plata que efectivamente se factura y se cobra.
//
// Ojo con esto: el MONTO de la propina no está guardado en la base. Se
// guarda solo el porcentaje (tip_percentage) y el monto se recalcula,
// porque el % se aplica sobre los servicios VARIABLES (la comida), no
// sobre el total. De ahí que exista este archivo: para que la fórmula
// viva en UN solo lugar y no se desalinee entre pantallas.
//
// El espejo de este archivo en el frontend es
// frontend/src/utils/quotationMoney.ts — si cambias uno, cambia el otro.

// Lo mínimo que se necesita para reconstruir la propina.
export interface TipSource {
  subtotal_amount?: number | null;
  fixed_value?: number | null;
  total_amount?: number | null;
  tip_percentage?: number | null;
}

// Servicios variables = subtotal − fijos. Es exacto por construcción: el
// cotizador guarda subtotal_amount = variables + fijos, y fixed_value =
// fijos. Se recalcula así (y no desde los items) para no depender del
// snapshot: las columnas se reescriben juntas cada vez que se guarda.
const variableTotalOf = (q: TipSource): number =>
  Math.max(0, (Number(q.subtotal_amount) || 0) - (Number(q.fixed_value) || 0));

// Monto de la propina de una cotización. 0 si no tiene.
// El tope de 100% es el mismo del cotizador, que es el que calculó el
// total guardado; sin el tope, restaríamos más de lo que se sumó.
export const tipAmountOf = (q: TipSource | null | undefined): number => {
  if (!q) return 0;
  const pct = Number(q.tip_percentage);
  if (!pct || Number.isNaN(pct) || pct <= 0) return 0;
  return Math.round((variableTotalOf(q) * Math.min(pct, 100)) / 100);
};

// LA base de ventas y de margen: lo cotizado menos la propina.
export const saleWithoutTip = (q: TipSource | null | undefined): number => {
  if (!q) return 0;
  return Math.round((Number(q.total_amount) || 0) - tipAmountOf(q));
};
