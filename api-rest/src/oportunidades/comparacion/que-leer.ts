import { PDFDocument } from 'pdf-lib';
import { extensionDe } from '../adjuntos/adjuntos.service';
import { MOTIVO_DEL_XLS } from '../analisis/xlsx';
import type { PiezaDelSet } from '../postulacion/el-set';

// QUÉ SE LEE DE CADA OFERTA, Y EN QUÉ ORDEN.
//
// Hasta la decisión 125, la comparación leía hasta 22 MB de PDF (lo que cabe
// dentro del pedido) y de lo demás le pasaba a la IA solo el nombre. El 11-11,
// con la 5040-14-LE26 (cuatro ofertas, 34 MB), quedaron 25 archivos sin leer:
// la patente de un oferente, que era solo una solicitud, y el programa de
// integridad de la empresa. La IA dio por buenos documentos que no vio y dio
// por faltantes respaldos que sí estaban.
//
// DESDE LA DECISIÓN 125 (11-11): los PDF se suben antes a la Files API (como
// las bases, decisión 103) y el pedido lleva solo su `file_id`, así que el
// peso deja de ser el tope. Lo que limita es lo que la IA alcanza a leer: se
// cuenta en páginas. Se lee todo lo que quepa, en este orden: las bases, los
// formularios y la oferta de cada uno, lo que da puntaje (patente,
// integridad, respaldos) y al final los certificados. De cada nivel, de a una
// oferta por vuelta, para que ninguna quede sin lo suyo.
//
// «Por qué perdimos» (decisión 97) sigue con `elegirQueLeer`, por peso.
//
// DESDE LA DECISIÓN 127 (11-11): también los Excel (.xlsx), como texto, con
// el mismo lector de las bases (`analisis/xlsx.ts`, decisión 126). Felipe:
// «que la comparación de las ofertas lea excel también».

export type ArchivoDeUnaOferta = {
  nombre: string;
  ruta: string;
  bytes: number;
};

export type OfertaParaComparar<T extends ArchivoDeUnaOferta> = {
  nombre: string;
  es_tuya: boolean;
  archivos: T[];
};

/** Lo que más pesa en la evaluación: los formularios y la oferta. */
const LO_PRINCIPAL =
  /anexo|formulario|propuesta|oferta|econom|tecnic|calidad|experiencia|cotizacion/;

/** Lo que da puntaje o deja fuera, después de los formularios. */
const LO_QUE_PUNTUA =
  /patente|integridad|etica|compliance|pacto|inicio|actividad|sii|tributari|giro|declaracion|jurada|orden|compra|factura|contrato|comodato|arriendo|certificacion|garantia|boleta|plazo|respaldo|\boc\b/;

const sinTildes = (t: string) =>
  t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const LEIBLES = new Set(['pdf', 'docx', 'xlsx', 'txt']);

/** Qué se lee de cada oferta sin pasarse del tope de PDF: primero lo
 *  principal de todas (de a una oferta por vuelta, para que ninguna quede
 *  sin lo suyo), después lo demás. Lo que no se lee va por su nombre. */
export function elegirQueLeer<T extends ArchivoDeUnaOferta>(
  ofertas: Array<OfertaParaComparar<T>>,
  maxBytesDePdf: number,
): Array<OfertaParaComparar<T> & { leer: T[]; soloNombre: T[] }> {
  let peso = 0;
  const elegidas = ofertas.map(() => new Set<T>());
  const cabe = (a: T) => {
    if (extensionDe(a.nombre) !== 'pdf') return true;
    if (peso + a.bytes > maxBytesDePdf) return false;
    peso += a.bytes;
    return true;
  };
  const leibles = ofertas.map((o) =>
    o.archivos.filter((a) => LEIBLES.has(extensionDe(a.nombre))),
  );
  for (const principal of [true, false]) {
    const colas = leibles.map((xs) =>
      xs.filter((a) => LO_PRINCIPAL.test(sinTildes(a.nombre)) === principal),
    );
    for (let vuelta = 0; colas.some((c) => c.length > vuelta); vuelta++) {
      colas.forEach((cola, i) => {
        const a = cola[vuelta];
        if (a && cabe(a)) elegidas[i].add(a);
      });
    }
  }
  return ofertas.map((o, i) => ({
    ...o,
    leer: o.archivos.filter((a) => elegidas[i].has(a)),
    soloNombre: o.archivos.filter((a) => !elegidas[i].has(a)),
  }));
}

// ---------------------------------------------------------------------------
// Decisión 125: todo lo que quepa, contado en páginas.

/** Lo más que lee una comparación. Medido el 11-11 con la 5040-14-LE26:
 *  120 páginas fueron 290.000 tokens, unas 2.400 por página; la IA lee hasta
 *  un millón. 300 páginas dejan margen para las instrucciones y la respuesta. */
export const MAX_PAGINAS_DE_LA_COMPARACION = 300;

/** De esas, lo más que se llevan las bases: el resto es de las ofertas. */
export const MAX_PAGINAS_DE_LAS_BASES = 100;

/** Una foto va dentro del pedido: la API no recibe más de 5 MB por imagen. */
export const MAX_BYTES_DE_IMAGEN = 4 * 1024 * 1024;

/** Las fotos de una comparación tienen su propio cupo, entre todas las
 *  ofertas. Con más de 20 imágenes en un pedido, la API rechaza el pedido
 *  entero si alguna pasa de 3.000 px por lado (una foto de celular los pasa);
 *  y cada foto queda en la memoria del motor hasta que la IA responde. */
export const MAX_IMAGENES_DE_LA_COMPARACION = 20;
export const MAX_BYTES_DE_LAS_IMAGENES = 15 * 1024 * 1024;

const IMAGENES: Readonly<Record<string, string>> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
};

/** Cómo lee la IA un archivo, por su extensión; null si no lo lee. */
export const comoSeLee = (
  nombre: string,
): { tipo: 'pdf' | 'texto' } | { tipo: 'imagen'; mime: string } | null => {
  const ext = extensionDe(nombre);
  if (ext === 'pdf') return { tipo: 'pdf' };
  if (ext === 'docx' || ext === 'xlsx' || ext === 'txt') {
    return { tipo: 'texto' };
  }
  return IMAGENES[ext] ? { tipo: 'imagen', mime: IMAGENES[ext] } : null;
};

/** Por qué la IA no lee un archivo (cuando `comoSeLee` dice null). */
export const porQueNoSeLee = (nombre: string): string =>
  extensionDe(nombre) === 'xls'
    ? MOTIVO_DEL_XLS
    : 'la IA lee PDF, Word, Excel e imágenes';

/** 1: formularios y oferta. 2: lo que da puntaje o deja fuera. 3: lo demás. */
export type NivelDeLectura = 1 | 2 | 3;

export const nivelDe = (nombre: string): NivelDeLectura => {
  const n = sinTildes(nombre);
  if (LO_PRINCIPAL.test(n)) return 1;
  return LO_QUE_PUNTUA.test(n) ? 2 : 3;
};

export type ParaLeer = ArchivoDeUnaOferta & {
  id?: number;
  /** Cómo se le presenta a la IA; si no, su nombre. */
  titulo?: string;
  nivel: NivelDeLectura;
};

/** Lo que la empresa escribe para postular: va primero. */
const LO_QUE_SE_LLENA = new Set<PiezaDelSet['que_es']>([
  'formulario',
  'propuesta',
  'cotizacion',
  'declaracion',
]);

/** La oferta de la empresa como se sube a Mercado Público (decisión 125):
 *  todas las piezas del set y, detrás de cada una, los respaldos que van
 *  dentro de su PDF (decisión 44: «un solo PDF»). Antes iban solo los
 *  formularios, y la IA dio por no presentados los respaldos de experiencia. */
export function laOfertaPropia(piezas: readonly PiezaDelSet[]): ParaLeer[] {
  const vistas = new Set<string>();
  const salida: ParaLeer[] = [];
  const sumar = (a: ParaLeer) => {
    if (vistas.has(a.ruta)) return;
    vistas.add(a.ruta);
    salida.push(a);
  };
  for (const p of piezas) {
    sumar({
      nombre: p.nombre,
      ruta: p.ruta,
      bytes: p.bytes,
      nivel: LO_QUE_SE_LLENA.has(p.que_es) ? 1 : 2,
    });
    for (const a of p.adjuntos ?? []) {
      sumar({
        nombre: a.nombre,
        ruta: a.ruta,
        bytes: a.bytes,
        titulo: `${a.nombre} (va dentro de «${p.nombre}»)`,
        nivel: 1,
      });
    }
  }
  return salida;
}

/** El orden en que se leen los archivos de las ofertas: por nivel y, dentro
 *  de cada nivel, de a una oferta por vuelta. */
export function ordenDeLectura<T extends { nivel: NivelDeLectura }>(
  ofertas: ReadonlyArray<readonly T[]>,
): Array<{ oferta: number; archivo: T }> {
  const orden: Array<{ oferta: number; archivo: T }> = [];
  for (const nivel of [1, 2, 3] as const) {
    const colas = ofertas.map((xs) => xs.filter((a) => a.nivel === nivel));
    for (let vuelta = 0; colas.some((c) => c.length > vuelta); vuelta++) {
      colas.forEach((cola, oferta) => {
        const archivo = cola[vuelta];
        if (archivo) orden.push({ oferta, archivo });
      });
    }
  }
  return orden;
}

/** Cuántas páginas tiene un PDF. Si no se puede abrir (cifrado o roto), se
 *  estima por su peso: una página escaneada pesa unos 150 KB. */
export async function paginasDelPdf(datos: Buffer): Promise<number> {
  try {
    const pdf = await PDFDocument.load(datos, {
      ignoreEncryption: true,
      updateMetadata: false,
    });
    return Math.max(1, pdf.getPageCount());
  } catch {
    return Math.max(1, Math.ceil(datos.length / 150_000));
  }
}

/** Un texto, en páginas: unas 3.000 letras cada una. */
export const paginasDeTexto = (texto: string): number =>
  Math.max(1, Math.ceil(texto.length / 3000));
