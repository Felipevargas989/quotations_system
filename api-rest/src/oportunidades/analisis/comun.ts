import Anthropic from '@anthropic-ai/sdk';
import { mensajeDe } from 'src/logging/mensaje-de-error';
import type { Adjunto } from '../adjuntos/adjuntos.repository';
import { extensionDe } from '../adjuntos/adjuntos.service';
import { textoDeDocx } from './docx';

// LO COMÚN DE LOS TRABAJOS DE LA IA SOBRE ARCHIVOS: leer las bases (paso 1)
// y validar documentos (paso 3). Qué archivos se pueden leer, cómo se le
// pasan a Claude, lo que cuesta y las fallas en palabras de la casa.

/** Opus 5.5: lo decidido para documentos (doc 17, decisión 6). */
export const MODELO_OPUS = 'claude-opus-5-5';

/** Precio de Opus 5.5 en US$ por token: 4 por millón de entrada, 20 de
 *  salida. */
const US_POR_TOKEN_ENTRADA = 4 / 1_000_000;
const US_POR_TOKEN_SALIDA = 20 / 1_000_000;

/** Los PDF van dentro del pedido, en base64, que los agranda un tercio. El
 *  pedido no puede pasar de 32 MB. */
export const MAX_BYTES_DE_PDF = 22 * 1024 * 1024;

/** Lo que la IA puede leer: PDF directo; Word y texto, como texto. */
const LEIBLES = new Set(['pdf', 'docx', 'txt', 'csv']);

/** Cuándo encendió este motor: un trabajo "procesando" de antes murió con
 *  el proceso anterior (un despliegue a la mitad). */
export const ENCENDIDO = new Date().toISOString();

export type NoLeido = { nombre: string; motivo: string };

/** AAAA-MM-DD, en Chile. */
export const hoyEnChile = (ahora = new Date()): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(
    ahora,
  );

export const costoEnDolares = (entrada: number, salida: number): number =>
  Math.round(
    (entrada * US_POR_TOKEN_ENTRADA + salida * US_POR_TOKEN_SALIDA) * 10_000,
  ) / 10_000;

/** Los tokens de un trabajo largo (paso 4), con la caché aparte: escribirla
 *  cuesta 1,25 veces la entrada y leerla, una décima. */
export type UsoDeTokens = {
  entrada: number;
  salida: number;
  cacheEscrita: number;
  cacheLeida: number;
};

export const costoDelUso = (u: UsoDeTokens): number =>
  Math.round(
    ((u.entrada + u.cacheEscrita * 1.25 + u.cacheLeida * 0.1) *
      US_POR_TOKEN_ENTRADA +
      u.salida * US_POR_TOKEN_SALIDA) *
      10_000,
  ) / 10_000;

/** Lo que la IA puede leer y lo que no (ZIP, Excel, imágenes), en el orden
 *  en que se subió: así "el documento" es el que uno ve. */
export const separar = (archivos: Adjunto[]) => {
  const leibles: Adjunto[] = [];
  const noLeidos: NoLeido[] = [];
  for (const a of archivos) {
    if (LEIBLES.has(extensionDe(a.nombre))) leibles.push(a);
    else {
      noLeidos.push({
        nombre: a.nombre,
        motivo: 'la IA lee PDF y Word; si es un ZIP, sube lo que trae adentro',
      });
    }
  }
  leibles.sort((a, b) => a.creado_en.localeCompare(b.creado_en));
  return { leibles, noLeidos };
};

export const pesoDePdf = (archivos: Adjunto[]): number =>
  archivos
    .filter((a) => extensionDe(a.nombre) === 'pdf')
    .reduce((suma, a) => suma + a.bytes, 0);

/** Los archivos como los lee Claude: el PDF entero (texto e imagen de cada
 *  página), el Word y el texto como texto. Lo que no se pudo abrir queda en
 *  `sinAbrir`. */
export const armarContenido = async (
  leibles: Adjunto[],
  descargar: (ruta: string) => Promise<Buffer>,
) => {
  const bloques: Anthropic.DocumentBlockParam[] = [];
  const sinAbrir: NoLeido[] = [];
  for (const a of leibles) {
    const datos = await descargar(a.ruta);
    const ext = extensionDe(a.nombre);
    if (ext === 'pdf') {
      bloques.push({
        type: 'document',
        title: a.nombre,
        source: {
          type: 'base64',
          media_type: 'application/pdf',
          data: datos.toString('base64'),
        },
      });
      continue;
    }
    const texto = ext === 'docx' ? textoDeDocx(datos) : datos.toString('utf8');
    if (!texto?.trim()) {
      sinAbrir.push({ nombre: a.nombre, motivo: 'no se pudo abrir' });
      continue;
    }
    bloques.push({
      type: 'document',
      title: a.nombre,
      source: { type: 'text', media_type: 'text/plain', data: texto },
    });
  }
  return { bloques, sinAbrir };
};

/** La falla, en palabras de la casa: es lo que lee Felipe en la ficha.
 *  `queNoSePudo` encabeza lo que no tiene traducción. */
export const errorDeIA = (
  error: unknown,
  queNoSePudo = 'No se pudieron leer los archivos',
): string => {
  const mensaje = mensajeDe(error);
  if (
    error instanceof Anthropic.AuthenticationError ||
    error instanceof Anthropic.PermissionDeniedError
  ) {
    return 'La llave de Anthropic del motor no funciona.';
  }
  if (error instanceof Anthropic.RateLimitError) {
    return 'La cuenta de Anthropic está sin cupo en este momento: vuelve a intentar en unos minutos.';
  }
  if (/credit balance/i.test(mensaje)) {
    return 'Se acabó el saldo de la cuenta de Anthropic.';
  }
  if (/too long|too many pages|maximum.*pages|too large|413/i.test(mensaje)) {
    return 'Son demasiadas páginas para leerlas de una vez: deja solo lo principal y vuelve a intentar.';
  }
  if (error instanceof Anthropic.APIConnectionTimeoutError) {
    return 'La IA tardó demasiado en responder: vuelve a intentar.';
  }
  return `${queNoSePudo}: ${mensaje}`;
};
