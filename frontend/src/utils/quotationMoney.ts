// ---------- LA PROPINA (24-07, decisión de Felipe) ----------
// Criterio ÚNICO para todo el sistema: la propina pasa por la empresa
// pero NO es venta ni margen. Va entera al equipo.
//
// Por eso las ventas y la rentabilidad se miran SIEMPRE sobre el monto
// sin propina. Lo que NO se toca: lo que paga el cliente (total_amount),
// el documento que se le manda, el plan de pagos y lo cobrado — ahí la
// propina sí va, porque es plata que efectivamente se factura y se cobra.
// Consecuencia conocida y aceptada: en el Dashboard, Ventas (sin propina)
// y Cobrado (con propina) NO calzan al peso. Está dicho en la leyenda.
//
// ---------- DE DÓNDE SALE EL MONTO (25-07, migración 37) ----------
// El monto de la propina se GUARDA (columna tip_amount), no se recalcula.
// El porcentaje es la regla con la que se llegó al número; el monto es el
// hecho, y los hechos de una cotización ya enviada no pueden cambiar
// solos. Si mañana se toca la fórmula, las cotizaciones viejas tienen que
// seguir mostrando la propina que se les cobró. Es la misma convención
// del descuento, que guarda porcentaje y monto desde la migración 6.
//
// Antes de la 37 el monto se reconstruía en cada pantalla, y de ahí viene
// la reconstrucción que quedó abajo como respaldo: sigue haciendo falta
// para los borradores (el cotizador en pantalla todavía no guardó nada) y
// para las filas a medias de la ventana entre correr el SQL y desplegar
// el código.
//
// El espejo de este archivo en el backend es
// api-rest/src/quotations/utils/tip.ts — si cambias uno, cambia el otro.
//
// Quién NO usa esto y por qué:
//  - El cotizador (QuotationForm) calcula la propina en vivo mientras la
//    editas, con la misma fórmula, porque ahí el monto todavía no existe:
//    justamente ese cálculo es el que después se guarda.
//  - QuotationViewer y la edición de Post-venta la sacan de los items que
//    ya tienen en pantalla, también con la misma fórmula.

// Lo mínimo que se necesita para saber la propina de una cotización.
export interface TipSource {
  subtotal_amount?: number | null;
  fixed_value?: number | null;
  total_amount?: number | null;
  tip_percentage?: number | null;
  tip_amount?: number | null;
}

// Servicios variables = subtotal − fijos. Es exacto por construcción: el
// cotizador guarda subtotal_amount = variables + fijos, y fixed_value =
// fijos. Solo se usa en la reconstrucción de respaldo.
const variableTotalOf = (q: TipSource): number =>
  Math.max(0, (Number(q.subtotal_amount) || 0) - (Number(q.fixed_value) || 0));

// Monto de la propina de una cotización. 0 si no tiene.
export const tipAmountOf = (q: TipSource | null | undefined): number => {
  if (!q) return 0;

  // El tope de 100% es el mismo del cotizador, que es el que calculó el
  // total guardado; sin el tope, restaríamos más de lo que se sumó.
  const pct = Math.min(Math.max(Number(q.tip_percentage) || 0, 0), 100);
  const guardado = q.tip_amount == null ? null : Number(q.tip_amount);

  // El monto guardado manda.
  if (guardado != null && !Number.isNaN(guardado) && guardado > 0) {
    return Math.round(guardado);
  }

  // Respaldo, solo dos casos:
  //  - Borrador: el cotizador en pantalla todavía no guarda nada.
  //  - Fila a medias: monto en 0 pero con porcentaje > 0. Pasa nada más
  //    en la ventana entre correr la migración 37 y desplegar el código.
  // Con monto 0 y sin porcentaje no hay nada que reconstruir: no hubo
  // propina, y así se queda.
  if (pct <= 0) return 0;
  return Math.round((variableTotalOf(q) * pct) / 100);
};

// LA base de ventas y de margen: lo cotizado menos la propina.
export const saleWithoutTip = (q: TipSource | null | undefined): number => {
  if (!q) return 0;
  return Math.round((Number(q.total_amount) || 0) - tipAmountOf(q));
};
