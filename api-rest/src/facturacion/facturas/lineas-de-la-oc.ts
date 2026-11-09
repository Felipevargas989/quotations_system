import { valorDeLaLinea } from '../archivo/comun';
import { montosDesdeElNeto, TASA_IVA } from '../archivo/montos';
import { textoLimpio } from '../archivo/texto';
import type { LineaDeDetalle } from '../archivo/tipos';
import type { LineaDeLaOC } from '../ordenes-de-compra/leer-orden-de-compra';

/**
 * LA FACTURA CON LAS LÍNEAS DE SU OC (doc 19 §9.37). Felipe, 08-11, con la
 * #481 de Santo Tomás: *"la orden de compra tenía dos líneas, un menú
 * adulto, un menú niño, ese menú adulto tenía un valor y el menú niño tenía
 * otro valor y una cantidad. Eso no lo está trayendo. La idea es que esto
 * lea exactamente lo que dice la orden de compra"*. Y del precio: *"tejemos
 * siempre el precio con IVA redondo y cuadrémonos"*.
 *
 * - Cada línea de la OC es una línea de la factura: su descripción, su
 *   cantidad y su precio CON IVA redondo, el que da justo el neto de la OC
 *   (el neto de $46.218 es $55.000 con IVA: 55.000 / 1,19 = 46.218,49).
 * - Una parte de la OC (el 50 %) parte las cantidades (78 → 39), siempre
 *   que se partan exactas; si no, la factura va en una línea por el monto,
 *   como antes.
 * - El cuadre: con precios con IVA, cada factura puede quedar unos pesos
 *   arriba o abajo de su parte (la 386: $20). La que cierra la OC se
 *   cuadra con lo que queda: el motor ajusta el neto de su última línea,
 *   con los decimales que admite el SII, y así la OC termina exacta.
 */

/** El precio con IVA, en pesos, que da ese neto: de los que dan el mismo
 *  neto al peso, el más redondo (55.000 antes que 54.999). */
export const precioConIvaDe = (neto: number, tasa = TASA_IVA): number => {
  const factor = 1 + tasa / 100;
  const buscado = Math.round(neto);
  const desde = Math.floor((buscado - 0.5) * factor);
  const hasta = Math.ceil((buscado + 0.5) * factor);
  const ceros = (n: number) => {
    let c = 0;
    for (let x = n; x > 0 && x % 10 === 0; x /= 10) c++;
    return c;
  };
  let mejor: number | null = null;
  for (let g = desde; g <= hasta; g++) {
    if (g <= 0 || Math.round(g / factor) !== buscado) continue;
    if (
      mejor == null ||
      ceros(g) > ceros(mejor) ||
      (ceros(g) === ceros(mejor) &&
        Math.abs(g - neto * factor) < Math.abs(mejor - neto * factor))
    )
      mejor = g;
  }
  return mejor ?? Math.round(neto * factor);
};

/** Lo que se pide de cada línea: como `LineaPedida` del borrador. */
export interface LineaDesdeLaOC {
  descripcion: string;
  descripcion_larga: null;
  cantidad: number;
  precio: number;
}

/**
 * Las líneas de la factura por `parte` de la OC (todo, el 50 %, lo que
 * queda), o nulo si la OC no trae líneas o sus cantidades no se parten
 * exactas en esa parte.
 */
export function lineasDeLaOC(
  oc: { total: number; lineas?: LineaDeLaOC[] | null },
  parte: number,
  glosa: (texto: string) => string = (t) => textoLimpio(t),
): LineaDesdeLaOC[] | null {
  const lineas = oc.lineas ?? [];
  if (!lineas.length || parte <= 0 || oc.total <= 0) return null;
  const fraccion = parte / oc.total;
  const toda = Math.abs(fraccion - 1) < 1e-6;
  const salida: LineaDesdeLaOC[] = [];
  for (const l of lineas) {
    let cantidad = l.cantidad;
    if (!toda) {
      const partida = l.cantidad * fraccion;
      cantidad = Math.round(partida);
      if (cantidad <= 0 || Math.abs(partida - cantidad) > 0.01) return null;
    }
    const descripcion = glosa(l.descripcion);
    if (!descripcion || !(cantidad > 0) || !(l.precio > 0)) return null;
    salida.push({
      descripcion,
      descripcion_larga: null,
      cantidad,
      precio: l.con_iva ? Math.round(l.precio) : precioConIvaDe(l.precio),
    });
  }
  return salida;
}

/**
 * El cuadre de la factura que cierra la OC: si sus líneas suman lo que le
 * queda a la OC con una diferencia de redondeo (a lo más $1 por unidad),
 * el neto de la última línea se ajusta para que el total sea justo lo que
 * queda. Nulo si no corresponde (no cierra la OC, lleva descuentos o ya
 * calza).
 */
export function cuadrarConLoQueQueda(
  lineas: LineaDeDetalle[],
  queda: number,
): { lineas: LineaDeDetalle[]; diferencia: number } | null {
  if (!lineas.length || queda <= 0 || lineas.some((l) => l.descuento))
    return null;
  const neto = lineas.reduce((s, l) => s + valorDeLaLinea(l), 0);
  const total = montosDesdeElNeto(neto).total;
  const diferencia = total - queda;
  const unidades = lineas.reduce((s, l) => s + l.cantidad, 0);
  if (diferencia === 0 || Math.abs(diferencia) > Math.max(1, unidades))
    return null;
  // El neto que da justo lo que queda con su IVA.
  const base = Math.round(queda / (1 + TASA_IVA / 100));
  const netoBuscado = [base, base - 1, base + 1].find(
    (n) => montosDesdeElNeto(n).total === queda,
  );
  if (netoBuscado == null) return null;
  const ultima = lineas[lineas.length - 1];
  const otras = neto - valorDeLaLinea(ultima);
  const valor = netoBuscado - otras;
  if (valor <= 0) return null;
  const precio = Math.round((valor / ultima.cantidad) * 1e6) / 1e6;
  const ajustada = { ...ultima, precio };
  if (valorDeLaLinea(ajustada) !== valor) return null;
  return { lineas: [...lineas.slice(0, -1), ajustada], diferencia };
}
