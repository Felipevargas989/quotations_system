import { desgloseDeOferta, pesos } from '../generacion/la-plata';
import type {
  DiaDeLaCotizacion,
  LineaDeLaCotizacion,
} from './la-cotizacion-detallada';

// EL REPARTO DEL PRECIO (decisión 119 del doc 17, 07-11). Felipe: "la
// cotización no es el que manda en el precio. La cotización manda en los
// servicios que estoy ofreciendo... el precio debería armarse desde lo que
// coloco yo para postular y de ahí completarse a los formularios... en caso
// que sí lo pidan, los precios se reparten con algún criterio y que la suma
// calce perfecto". El criterio: cada precio de la cotización sube o baja en
// la misma proporción hasta el precio que se postula, en pesos enteros, y
// los pesos del redondeo los absorbe el salón (lo fijo de cantidad 1, el
// más caro; si hay varios iguales, por partes iguales). Se calcula una vez
// en «Armar postulación», con IVA y en neto, y las mismas cifras van a la
// cotización detallada y a los formularios: las dos sumas calzan al peso.

/** Los precios unitarios que suman justo `objetivo`, o null si no hay forma
 *  exacta en pesos enteros sin tocar la cantidad de ninguna línea. */
const repartir = (
  lineas: LineaDeLaCotizacion[],
  base: number,
  objetivo: number,
): number[] | null => {
  const precios = lineas.map((l) =>
    l.unitario > 0 ? Math.round((l.unitario * objetivo) / base) : 0,
  );
  const resto =
    objetivo - lineas.reduce((s, l, i) => s + l.unidades * precios[i], 0);
  if (resto === 0) return precios;
  const conPrecio = lineas
    .map((_, i) => i)
    .filter((i) => lineas[i].unitario > 0);
  // El salón absorbe el redondeo; dos salones iguales, por partes iguales,
  // para que sigan iguales.
  const fijos = conPrecio.filter((i) => lineas[i].unidades === 1);
  if (fijos.length > 0) {
    const mayor = Math.max(...fijos.map((i) => lineas[i].unitario));
    const salones = fijos.filter((i) => lineas[i].unitario === mayor);
    const parte = Math.trunc(resto / salones.length);
    for (const i of salones) precios[i] += parte;
    precios[salones[0]] += resto - parte * salones.length;
    return salones.every((i) => precios[i] > 0) ? precios : null;
  }
  // Sin salón: una línea que lo absorba exacto por persona, de la más
  // grande a la más chica, o dos.
  const orden = [...conPrecio].sort(
    (a, b) =>
      lineas[b].unidades * lineas[b].unitario -
      lineas[a].unidades * lineas[a].unitario,
  );
  for (const i of orden) {
    const q = lineas[i].unidades;
    if (resto % q === 0 && precios[i] + resto / q > 0) {
      precios[i] += resto / q;
      return precios;
    }
  }
  for (const a of orden) {
    for (const b of orden) {
      if (a === b) continue;
      const qa = lineas[a].unidades;
      const qb = lineas[b].unidades;
      for (let k = 1; k < qb; k++) {
        for (const s of [k, -k]) {
          const otro = resto - qa * s;
          if (
            otro % qb === 0 &&
            precios[a] + s > 0 &&
            precios[b] + otro / qb > 0
          ) {
            precios[a] += s;
            precios[b] += otro / qb;
            return precios;
          }
        }
      }
    }
  }
  return null;
};

/** Los días de la cotización con cada precio repartido hasta `total` (con
 *  IVA) y su neto. Las líneas suman justo `total` y sus netos, el neto de
 *  `desgloseDeOferta` (si no hay forma exacta en neto, van sin él). null si
 *  no hay precios que repartir. */
export function repartirElPrecio(
  dias: DiaDeLaCotizacion[],
  total: number,
): DiaDeLaCotizacion[] | null {
  if (!Number.isInteger(total) || total <= 0) return null;
  const copia = dias.map((d) => ({
    ...d,
    lineas: d.lineas.map((l) => ({ ...l })),
  }));
  const lineas = copia.flatMap((d) => d.lineas);
  // Lo que no tiene precio (o lo tiene negativo) queda en $0.
  const base = lineas.reduce(
    (s, l) => s + l.unidades * Math.max(0, l.unitario),
    0,
  );
  if (base <= 0) return null;
  let conIva = repartir(lineas, base, total);
  if (!conIva) {
    // Sin salón y sin un precio por persona exacto (37 personas y un total
    // que no se divide): la línea más grande va como un servicio por su
    // total, y ella absorbe el redondeo.
    const mayor = lineas
      .filter((l) => l.unitario > 0)
      .reduce((a, b) =>
        b.unidades * b.unitario > a.unidades * a.unitario ? b : a,
      );
    const cuantos = /\D/.test(mayor.cantidad)
      ? `para ${mayor.cantidad}`
      : `${mayor.cantidad} unidades`;
    mayor.detalle = mayor.detalle
      ? `${mayor.detalle}, ${cuantos}`
      : cuantos.replace(/^./, (c) => c.toUpperCase());
    mayor.unitario *= mayor.unidades;
    mayor.unidades = 1;
    mayor.cantidad = '1 servicio';
    conIva = repartir(lineas, base, total);
    if (!conIva) return null;
  }
  // El neto, con las mismas líneas. Manda el precio con IVA (así cotiza la
  // casa): si sin salón el neto no da exacto por persona, no va, y el
  // formulario que lo pida lo deja pendiente.
  const enNeto = repartir(lineas, base, desgloseDeOferta(total).neto);
  for (let i = 0; i < lineas.length; i++) {
    const l = lineas[i];
    l.unitario = conIva[i];
    l.total = l.unidades * conIva[i];
    delete l.unitarioNeto;
    delete l.totalNeto;
    if (enNeto) {
      l.unitarioNeto = enNeto[i];
      l.totalNeto = l.unidades * enNeto[i];
    }
  }
  for (const d of copia) {
    d.subtotal = d.lineas.reduce((s, l) => s + l.total, 0);
  }
  return copia;
}

/** ¿Lleva el neto por ítem? */
export const conNeto = (dias: DiaDeLaCotizacion[]): boolean =>
  dias.every((d) => d.lineas.every((l) => l.totalNeto !== undefined));

/** ¿Este reparto es el de `total`? Sus líneas suman justo el total y, si
 *  llevan neto, sus netos suman el neto. */
export const calzaCon = (
  dias: DiaDeLaCotizacion[] | null | undefined,
  total: number,
): dias is DiaDeLaCotizacion[] => {
  if (!dias || dias.length === 0) return false;
  const lineas = dias.flatMap((d) => d.lineas);
  return (
    lineas.reduce((s, l) => s + l.total, 0) === total &&
    (!conNeto(dias) ||
      lineas.reduce((s, l) => s + (l.totalNeto ?? 0), 0) ===
        desgloseDeOferta(total).neto)
  );
};

const esNumero = (v: unknown): boolean =>
  typeof v === 'number' && Number.isFinite(v);

const vacioONumero = (v: unknown): boolean => v === undefined || esNumero(v);

/** EL PRECIO POR ÍTEM, para la IA que llena los formularios: con IVA y en
 *  neto, para el que pide el precio por ítem, por persona o unitario. Antes
 *  quedaba en blanco y pendiente. */
export const elPrecioPorItem = (dias: DiaDeLaCotizacion[]): string[] => {
  const lineas = dias.flatMap((d) => d.lineas);
  const enNeto = conNeto(dias);
  return [
    `EL PRECIO POR ÍTEM: el precio de la oferta repartido sobre los servicios de la cotización, cada uno en la misma proporción. Las líneas suman justo el total con IVA${enNeto ? ' y sus netos, justo el neto' : ''}.`,
    ...dias.flatMap((d) => [
      `${d.titulo}:`,
      ...d.lineas.map(
        (l) =>
          `- ${l.servicio}${l.detalle ? ` (${l.detalle})` : ''}: ${l.cantidad} × ${pesos(l.unitario)} = ${pesos(l.total)} con IVA${enNeto ? `; en neto, ${l.cantidad} × ${pesos(l.unitarioNeto ?? 0)} = ${pesos(l.totalNeto ?? 0)}` : ''}.`,
      ),
    ]),
    `Suman ${pesos(lineas.reduce((s, l) => s + l.total, 0))} con IVA${enNeto ? ` y ${pesos(lineas.reduce((s, l) => s + (l.totalNeto ?? 0), 0))} en neto` : ''}.`,
    ...(enNeto
      ? []
      : [
          'El neto por ítem no da exacto en pesos enteros: si el formulario lo pide, déjalo en blanco y anótalo en pendientes.',
        ]),
  ];
};

/** El reparto guardado con los anexos (para reintentarlos), si tiene la
 *  forma de uno. */
export const repartoGuardado = (v: unknown): DiaDeLaCotizacion[] | null => {
  if (!Array.isArray(v) || v.length === 0) return null;
  const bien = v.every(
    (d: Partial<DiaDeLaCotizacion> | null) =>
      typeof d?.titulo === 'string' &&
      esNumero(d.subtotal) &&
      Array.isArray(d.lineas) &&
      d.lineas.every(
        (l: Partial<LineaDeLaCotizacion> | null) =>
          typeof l?.servicio === 'string' &&
          typeof l.detalle === 'string' &&
          typeof l.cantidad === 'string' &&
          [l.unidades, l.unitario, l.total].every(esNumero) &&
          [l.unitarioNeto, l.totalNeto].every(vacioONumero),
      ),
  );
  return bien ? (v as DiaDeLaCotizacion[]) : null;
};
