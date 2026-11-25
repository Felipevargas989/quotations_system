import { valorDeLaLinea } from '../archivo/comun';
import { montosDesdeElNeto, precioNetoDe, TASA_IVA } from '../archivo/montos';
import { textoLimpio } from '../archivo/texto';
import type { LineaDeDetalle } from '../archivo/tipos';
import { Cadena, type DocumentoDeLaCadena } from '../notas/cadena';
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
  /** «Se facturan 189 de 379» en el saldo de la OC (§9.52); nulo si no. */
  descripcion_larga: string | null;
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
      precio: precioDeLaLinea(l),
    });
  }
  return salida;
}

/** El precio CON IVA con que una línea de la OC va en la factura. */
const precioDeLaLinea = (l: LineaDeLaOC) =>
  l.con_iva ? Math.round(l.precio) : precioConIvaDe(l.precio);

/**
 * LO QUE YA SE LE FACTURÓ A LA OC, LÍNEA POR LÍNEA (doc 19 §9.52): el
 * detalle de cada factura vigente contra ella, documento por documento (sus
 * líneas en el orden en que salieron). Una factura anulada por su NC no
 * cuenta (como en `facturadoDeLasOC`); una rebajada por una NC de monto no
 * se sabe a qué línea rebaja: esa OC queda en nulo y su saldo va por el
 * monto, como antes.
 */
export type FacturadoDeLaOC = LineaDeDetalle[][] | null;

export function lineasFacturadasDeLasOC(
  filas: (DocumentoDeLaCadena & {
    orden_de_compra_id: number | null;
    detalle?: unknown;
  })[],
  cadena = new Cadena(filas),
): Map<number, FacturadoDeLaOC> {
  const porOC = new Map<number, FacturadoDeLaOC>();
  for (const d of filas) {
    if (d.tipo !== 33 || d.orden_de_compra_id == null) continue;
    const vale = cadena.facturado(d.id);
    if (vale <= 0) continue;
    const ya = porOC.has(d.orden_de_compra_id)
      ? porOC.get(d.orden_de_compra_id)!
      : [];
    const detalle = Array.isArray(d.detalle)
      ? (d.detalle as LineaDeDetalle[])
      : null;
    porOC.set(
      d.orden_de_compra_id,
      ya && detalle?.length && vale === Number(d.total)
        ? [...ya, detalle]
        : null,
    );
  }
  return porOC;
}

const comoTexto = (t: string | null | undefined) =>
  textoLimpio(t ?? '').toLocaleLowerCase('es-CL');

/**
 * EL SALDO DE LA OC CON SUS LÍNEAS (doc 19 §9.52). Felipe, 16-11, con la
 * OC N° 16.617 de Ecofor (#616): la primera factura salió en las tres líneas
 * de la OC (190 de 379, 97 de 194 y 3 de 6) y lo que quedaba se proponía en
 * una sola línea, porque el saldo partía las cantidades de la OC entera por
 * su fracción (379 × 0,4988 = 189,04, no exacto). Ahora el saldo va línea
 * por línea: lo que pide la OC menos lo ya facturado en esa línea, con
 * «Se facturan 189 de 379».
 *
 * El calce: cada factura anterior, por posición (su línea 1 con la línea 1
 * de la OC) y con la misma descripción y el mismo precio. Nulo (y el saldo
 * va por el monto, como antes) si algo no calza, si una línea queda en cero
 * o menos, o si las líneas no suman lo que le queda a la OC (con los pesos
 * de redondeo que cuadra `cuadrarConLoQueQueda`).
 */
export function lineasDelSaldo(
  oc: { lineas?: LineaDeLaOC[] | null },
  facturadas: FacturadoDeLaOC | undefined,
  queda: number,
  glosa: (texto: string) => string = (t) => textoLimpio(t),
): LineaDesdeLaOC[] | null {
  const lineas = oc.lineas ?? [];
  if (!lineas.length || !facturadas?.length || queda <= 0) return null;
  const ya = lineas.map(() => 0);
  for (const factura of facturadas) {
    if (factura.length > lineas.length) return null;
    for (let i = 0; i < factura.length; i++) {
      const f = factura[i];
      const o = lineas[i];
      if (f.descuento) return null;
      const de = comoTexto(f.descripcion);
      const completa = comoTexto(o.descripcion);
      const calza =
        !!de &&
        (de === comoTexto(glosa(o.descripcion)) || completa.startsWith(de));
      const neto = precioNetoDe(precioDeLaLinea(o));
      if (!calza || !(Math.abs(Number(f.precio) - neto) <= 1)) return null;
      ya[i] += Number(f.cantidad) || 0;
    }
  }
  const salida: LineaDesdeLaOC[] = [];
  for (let i = 0; i < lineas.length; i++) {
    const o = lineas[i];
    const cantidad = Math.round((o.cantidad - ya[i]) * 1e6) / 1e6;
    const descripcion = glosa(o.descripcion);
    if (!(cantidad > 0) || !descripcion || !(o.precio > 0)) return null;
    salida.push({
      descripcion,
      descripcion_larga: `Se facturan ${cantidad} de ${o.cantidad}`,
      cantidad,
      precio: precioDeLaLinea(o),
    });
  }
  // Lo que suman, como lo cuenta la factura (en neto): justo lo que queda,
  // o a unos pesos que la revisión cuadra en la última línea.
  const netas: LineaDeDetalle[] = salida.map((l) => ({
    descripcion: l.descripcion,
    cantidad: l.cantidad,
    precio: precioNetoDe(l.precio),
  }));
  const total = montosDesdeElNeto(
    netas.reduce((s, l) => s + valorDeLaLinea(l), 0),
  ).total;
  if (total !== queda && !cuadrarConLoQueQueda(netas, queda)) return null;
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

/**
 * UNA FACTURA POR LÍNEA DE LA OC (doc 19 §9.59). Felipe, 25-11-2026, con la
 * OC 4505522493 de Transportes CCU (#407): CCU manda una nota de pedido
 * (802) por cada línea de la OC y pide una factura por cada una, con la OC y
 * su nota de pedido. *"Un evento, una orden de compra puede tener varias
 * facturas. Déjalo programado para que esto ya sea automático."*
 *
 * La OC va así cuando tiene más de una línea y su receptor pide la nota de
 * pedido (802 en «Referencias que pide» de su razón social). Las OC de
 * varias líneas de quien no la pide (Santo Tomás, Ecofor) siguen yendo en
 * una factura por OC, como antes.
 */
export const pideUnaFacturaPorLinea = (
  oc: { lineas?: LineaDeLaOC[] | null },
  exigidas: readonly string[] | null | undefined,
): boolean => (oc.lineas?.length ?? 0) > 1 && !!exigidas?.includes('802');

/** La línea `indice` de la OC sola y entera, como va en su factura; nulo
 *  si no existe o no se puede facturar (sin descripción, sin precio). */
export function lineaSolaDeLaOC(
  oc: { lineas?: LineaDeLaOC[] | null },
  indice: number,
  glosa: (texto: string) => string = (t) => textoLimpio(t),
): LineaDesdeLaOC | null {
  const l = oc.lineas?.[indice];
  if (!l || !Number.isInteger(indice)) return null;
  const descripcion = glosa(l.descripcion);
  if (!descripcion || !(l.cantidad > 0) || !(l.precio > 0)) return null;
  return {
    descripcion,
    descripcion_larga: null,
    cantidad: l.cantidad,
    precio: precioDeLaLinea(l),
  };
}

/**
 * Las líneas de la OC (sus índices, desde 0) que todavía no tienen factura,
 * cuando la OC va en una factura por línea. Cada factura vigente contra la
 * OC tiene que ser de UNA línea, y calza con la primera línea libre de la OC
 * con la misma cantidad y el mismo precio neto (al peso; la que cierra la OC
 * puede ajustar el redondeo). Nulo si algo no calza (una factura de varias
 * líneas, o rebajada: no se sabe qué línea cubre): entonces la OC va en una
 * factura por el saldo, como antes.
 */
export function lineasPorFacturarDeLaOC(
  oc: { lineas?: LineaDeLaOC[] | null },
  facturadas: FacturadoDeLaOC | undefined,
): number[] | null {
  const lineas = oc.lineas ?? [];
  if (lineas.length < 2 || facturadas === null) return null;
  const libre = lineas.map(() => true);
  for (const factura of facturadas ?? []) {
    if (factura.length !== 1) return null;
    const f = factura[0];
    const i = lineas.findIndex(
      (o, j) =>
        libre[j] &&
        Math.abs(Number(f.cantidad) - o.cantidad) < 1e-6 &&
        Math.abs(Number(f.precio) - precioNetoDe(precioDeLaLinea(o))) <= 1,
    );
    if (i < 0) return null;
    libre[i] = false;
  }
  return libre.flatMap((l, i) => (l ? [i] : []));
}

/**
 * Las líneas de la factura desde su OC: la línea sola si la OC va en una
 * factura por línea (§9.59); si no, el saldo línea por línea (§9.52) o la
 * parte de la OC (§9.37). Nulo sin OC o si no se puede: va una línea por
 * el monto.
 */
export function lineasDesdeLaOC(
  oc: {
    total: number;
    facturado: number;
    lineas?: LineaDeLaOC[] | null;
    lineasFacturadas?: FacturadoDeLaOC;
  } | null,
  parte: number,
  queda: number,
  linea: number | null | undefined,
  glosa: (texto: string) => string,
): { lineas: LineaDesdeLaOC[] | null; linea: number | null } {
  if (!oc) return { lineas: null, linea: null };
  const sola = linea != null ? lineaSolaDeLaOC(oc, linea, glosa) : null;
  if (sola) return { lineas: [sola], linea: linea ?? null };
  const delSaldo =
    oc.facturado > 0 && parte === queda
      ? lineasDelSaldo(oc, oc.lineasFacturadas, queda, glosa)
      : null;
  return { lineas: delSaldo ?? lineasDeLaOC(oc, parte, glosa), linea: null };
}
