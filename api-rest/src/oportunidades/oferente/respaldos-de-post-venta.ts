import type { DocumentosDeUnEvento } from '../eventia/eventia.repository';
import type { RespaldoLeido } from './leer-respaldo';
import type { DatosDeRespaldo } from './respaldo';

// LOS RESPALDOS DE POST-VENTA (decisión 45 del doc 17, 19-10). Felipe:
// "debería el motor, a la hora de generar la licitación, evaluar si tiene
// experiencia suficiente o debe ir a post venta a buscar respaldos... traer
// desde Eventia es raro, si estamos en Eventia". Al armar la postulación, el
// motor lee las facturas y órdenes de compra que se subieron a los eventos
// ya hechos (Post-venta) y se las ofrece a la IA del anexo de experiencia
// DESPUÉS de los respaldos de «Mi empresa»: las usa solo si esos no
// alcanzan. No se copian: el set pega el PDF directo desde el evento. Lo
// leído queda anotado en el trabajo de los anexos (`post_venta`), para el
// set y para reintentar sin volver a leer. Aquí, las reglas sin IA.

/** Eventos por vez: una carpeta grande no se lleva la tarde. */
export const MAX_EVENTOS_POR_VEZ = 30;

/** Documentos que se prueban por evento, como mucho. */
export const MAX_DOCUMENTOS_POR_EVENTO = 3;

/** La experiencia que cuenta: la de los últimos 24 meses (decisión 52;
 *  Felipe, 19-10: "dejemos las mejores de los últimos 24 meses y eliminemos
 *  el resto para que no sea ninguna rechazada"). */
export const MESES_DE_EXPERIENCIA = 24;

/** AAAA-MM-DD de hace `meses` meses. */
export const haceMeses = (hoy: string, meses: number): string => {
  const [a, m, d] = hoy.split('-').map(Number);
  const total = a * 12 + (m - 1) - meses;
  const anio = Math.floor(total / 12);
  const mes = (total % 12) + 1;
  return `${anio}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
};

const SE_LEE = /\.(pdf|jpe?g|png|webp)$/i;

/** Un respaldo sacado de Post-venta: sus datos leídos, de qué evento es y
 *  dónde está su archivo (el del evento, sin copiar). */
export type RespaldoDePostVenta = DatosDeRespaldo & {
  evento: number;
  /** Cómo se llama para la IA y en el ZIP («Factura 345.pdf»). */
  archivo: string;
  ruta: string;
  bytes: number;
};

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

/** ¿Ese evento ya tiene su respaldo en «Mi empresa»? Si un documento suyo
 *  se llama con el número de un respaldo (la orden 1213301-49-AG26 del
 *  evento 415 ya estaba subida a mano). Sin leer nada: lo que no se sabe así
 *  se sabe después de leerlo (`mismoNumero`). */
export function yaEsta(
  e: DocumentosDeUnEvento,
  respaldos: ReadonlyArray<Pick<DatosDeRespaldo, 'numero'>>,
): boolean {
  return respaldos.some((r) =>
    e.documentos.some(
      (d) =>
        nombra(d.nombre, r.numero) || nombra(archivoDeLaRuta(d.ruta), r.numero),
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

/** «Orden de compra 5040-126-TD26.pdf», «Factura 347.pdf»: como lo ve la
 *  IA y, si el anexo va en Word, como va en el ZIP. */
export const nombreDelRespaldo = (
  tipo: RespaldoLeido['tipo'],
  numero: string,
  extension: string,
): string =>
  `${tipo === 'orden_de_compra' ? 'Orden de compra' : 'Factura'} ${numero
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '-')}.${extension}`;

const texto = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() ? v.trim() : null;

const entero = (v: unknown): number | null =>
  typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : null;

/** Los respaldos de Post-venta que quedaron anotados en un trabajo de los
 *  anexos (`parametros.post_venta`), revisados: solo los de esta empresa
 *  (`c<empresa>/event-documents/`), con número, evento y archivo. */
export function respaldosDePostVenta(
  parametros: unknown,
  companyId: number,
): RespaldoDePostVenta[] {
  const lista = (parametros as { post_venta?: unknown } | null)?.post_venta;
  if (!Array.isArray(lista)) return [];
  const propia = `c${companyId}/event-documents/`;
  return lista.flatMap((x: Record<string, unknown>): RespaldoDePostVenta[] => {
    const numero = texto(x?.numero);
    const ruta = texto(x?.ruta);
    const archivo = texto(x?.archivo);
    const evento = entero(x?.evento);
    if (!numero || !ruta?.startsWith(propia) || !archivo || !evento) return [];
    return [
      {
        numero,
        mandante: texto(x.mandante),
        contrato: texto(x.contrato),
        anio: entero(x.anio),
        monto: entero(x.monto),
        fuente: x.fuente === 'mercado_publico' ? 'mercado_publico' : 'manual',
        evento,
        archivo,
        ruta,
        bytes: entero(x.bytes) ?? 0,
      },
    ];
  });
}
