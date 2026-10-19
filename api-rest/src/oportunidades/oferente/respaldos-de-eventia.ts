import type { DocumentosDeUnEvento } from '../eventia/eventia.repository';
import type { RespaldoLeido } from './leer-respaldo';
import type { DatosDeRespaldo } from './respaldo';

// LOS RESPALDOS QUE YA ESTÁN EN EVENTIA (decisión 45 del doc 17, 19-10).
// Felipe: "En caso de que sea muy pobre los respaldos, podemos buscar en el
// mismo Eventia y ahí tenemos las facturas y quién fue... Buscar en Eventia
// y terminar de armar ese archivo con experiencia relevante y los respaldos
// que o están en Eventia o están en mi empresa". Las facturas y órdenes de
// compra que se suben a cada evento hecho pasan a «Mi empresa» como
// respaldos de experiencia, uno por evento, leídos con la misma IA de «Leer
// solo». Desde ahí el anexo de experiencia los nombra por su número y el set
// los pone dentro del PDF, igual que los que sube la empresa. Aquí, las
// reglas sin IA.

/** Eventos por vez: una carpeta grande no se lleva la tarde. */
export const MAX_EVENTOS_POR_VEZ = 30;

const SE_LEE = /\.(pdf|jpe?g|png|webp)$/i;

/** Documentos que se prueban por evento, como mucho. */
export const MAX_DOCUMENTOS_POR_EVENTO = 3;

/** Un respaldo por evento (la orden y la factura de un mismo servicio son
 *  una sola experiencia). En qué orden se prueban: las órdenes de compra
 *  primero (la de Mercado Público se confirma con su ficha), después las
 *  facturas, cada una en el orden en que se subió. Se usa la primera que
 *  resulte ser una orden o una factura: a veces se sube otra cosa en esa
 *  categoría (en el laboratorio, un informe entre las órdenes). */
export function documentosParaLeer(
  e: DocumentosDeUnEvento,
): DocumentosDeUnEvento['documentos'] {
  const legibles = e.documentos.filter((d) => SE_LEE.test(d.ruta));
  return [
    ...legibles.filter((d) => d.categoria === 'ordenes_compra'),
    ...legibles.filter((d) => d.categoria === 'facturas'),
  ].slice(0, MAX_DOCUMENTOS_POR_EVENTO);
}

/** El nombre del archivo en el balde, sin la carpeta ni el sello de hora
 *  (`2026-07-29T19-40-06-104Z_1213301-49-AG26.pdf` → `1213301-49-AG26.pdf`). */
export const archivoDeLaRuta = (ruta: string): string =>
  (ruta.split('/').pop() ?? '').replace(/^[^_]*_/, '');

/** ¿El número aparece en el texto, sin ser parte de otro número o código? */
const nombra = (texto: string, numero: string): boolean => {
  const n = numero.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return (
    n !== '' &&
    new RegExp(`(?<![A-Za-z0-9-])${n}(?![A-Za-z0-9-])`, 'i').test(texto)
  );
};

/** ¿Ese evento ya tiene su respaldo en «Mi empresa»? Si alguno se trajo de
 *  él, o si un documento suyo se llama con el número de un respaldo (la
 *  orden 1213301-49-AG26 del evento 415 ya estaba subida a mano). Sin leer
 *  nada: lo que no se sabe así se sabe después de leerlo (`mismoNumero`). */
export function yaEsta(
  e: DocumentosDeUnEvento,
  respaldos: ReadonlyArray<Pick<DatosDeRespaldo, 'numero' | 'evento'>>,
): boolean {
  return respaldos.some(
    (r) =>
      r.evento === e.numero ||
      e.documentos.some(
        (d) =>
          nombra(d.nombre, r.numero) ||
          nombra(archivoDeLaRuta(d.ruta), r.numero),
      ),
  );
}

const comparable = (numero: string): string =>
  numero
    .replace(/\s+/g, '')
    .toUpperCase()
    .replace(/^0+(?=\d)/, '');

/** El mismo número de orden o de factura, sin espacios, mayúsculas ni
 *  ceros a la izquierda. */
export const mismoNumero = (a: string, b: string): boolean =>
  comparable(a) !== '' && comparable(a) === comparable(b);

/** «Orden de compra 5040-126-TD26.pdf», «Factura 347.pdf»: como se ve en
 *  «Mi empresa» y, si el anexo va en Word, en el ZIP. */
export const nombreDelRespaldo = (
  tipo: RespaldoLeido['tipo'],
  numero: string,
  extension: string,
): string =>
  `${tipo === 'orden_de_compra' ? 'Orden de compra' : 'Factura'} ${numero
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '-')}.${extension}`;

export type ResultadoDeTraer = {
  /** Los que pasaron a «Mi empresa». */
  traidos: number;
  /** Eventos cuyo respaldo ya estaba. */
  ya_estaban: number;
  /** Los que no se pudieron traer, cada uno con su porqué. */
  sin_traer: string[];
};
