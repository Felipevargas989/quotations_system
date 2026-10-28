import Anthropic from '@anthropic-ai/sdk';
import { mensajeDe } from 'src/logging/mensaje-de-error';
import type { Adjunto } from '../adjuntos/adjuntos.repository';
import { extensionDe } from '../adjuntos/adjuntos.service';
import { textoDeDocx } from './docx';

// LO COMÚN DE LOS TRABAJOS DE LA IA SOBRE ARCHIVOS: leer las bases (paso 1)
// y validar documentos (paso 3). Qué archivos se pueden leer, cómo se le
// pasan a Claude, lo que cuesta y las fallas en palabras de la casa.

/** EL MODELO POR TAREA (Felipe, 17-10: "los más caros donde se necesiten
 *  y los más baratos donde sea necesario"): Opus 5.5 analiza las bases,
 *  valida y escribe la propuesta técnica; Sonnet 5.5 llena los anexos;
 *  Haiku 5.5 lee cada licitación del radar y pone la firma. */
export const MODELO_OPUS = 'claude-opus-5-5';
export const MODELO_SONNET = 'claude-sonnet-5-5';
export const MODELO_HAIKU = 'claude-haiku-5-5';

/** Precios de la página de Anthropic (17-10-2026), en US$ por millón de
 *  tokens: entrada, salida, escribir la caché (5 minutos: 1,25 veces la
 *  entrada; 1 hora: 2 veces) y leerla. En Opus 5.5 y Sonnet 5.5 leer la
 *  caché cuesta 0,05 veces la entrada; en Haiku 5.5, 0,1 veces. Haiku
 *  cobra más si un pedido pasa de 100.000 tokens: la firma no llega ni
 *  cerca. */
const PRECIOS: Readonly<
  Record<
    string,
    {
      entrada: number;
      salida: number;
      cacheEscrita: number;
      cacheEscrita1h: number;
      cacheLeida: number;
    }
  >
> = {
  [MODELO_OPUS]: {
    entrada: 4,
    salida: 20,
    cacheEscrita: 5,
    cacheEscrita1h: 8,
    cacheLeida: 0.2,
  },
  [MODELO_SONNET]: {
    entrada: 2,
    salida: 10,
    cacheEscrita: 2.5,
    cacheEscrita1h: 4,
    cacheLeida: 0.1,
  },
  [MODELO_HAIKU]: {
    entrada: 0.1,
    salida: 0.5,
    cacheEscrita: 0.125,
    cacheEscrita1h: 0.2,
    cacheLeida: 0.01,
  },
};

export type DuracionDeCache = '5m' | '1h';

const precioDe = (modelo: string) => PRECIOS[modelo] ?? PRECIOS[MODELO_OPUS];

/** Los PDF van dentro del pedido, en base64, que los agranda un tercio. El
 *  pedido no puede pasar de 32 MB. */
export const MAX_BYTES_DE_PDF = 22 * 1024 * 1024;

/** Las bases del análisis y de «Pregúntale a la IA» (decisión 103): lo que
 *  pasa de 22 MB se sube antes a la Files API (`pdf-subidos.ts`). El mismo
 *  tope de «Generar documentos». Lo que sigue limitando son las 600 páginas
 *  por pedido, con el aviso de `errorDeIA`. */
export const MAX_BYTES_DE_BASES = 40 * 1024 * 1024;

/** Lo que la IA puede leer: PDF directo; Word y texto, como texto. */
const LEIBLES = new Set(['pdf', 'docx', 'txt', 'csv']);

export const esLeible = (nombre: string): boolean =>
  LEIBLES.has(extensionDe(nombre));

/** Cuándo encendió este motor: un trabajo "procesando" de antes murió con
 *  el proceso anterior (un despliegue a la mitad). */
export const ENCENDIDO = new Date().toISOString();

export type NoLeido = { nombre: string; motivo: string };

/** AAAA-MM-DD, en Chile. */
export const hoyEnChile = (ahora = new Date()): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(
    ahora,
  );

export const costoEnDolares = (
  entrada: number,
  salida: number,
  modelo: string = MODELO_OPUS,
): number => {
  const p = precioDe(modelo);
  return (
    Math.round(
      ((entrada * p.entrada + salida * p.salida) / 1_000_000) * 10_000,
    ) / 10_000
  );
};

/** Los tokens de un trabajo largo (paso 4), con la caché aparte. */
export type UsoDeTokens = {
  entrada: number;
  salida: number;
  cacheEscrita: number;
  cacheLeida: number;
};

export const costoDelUso = (
  u: UsoDeTokens,
  modelo: string = MODELO_OPUS,
  cache: DuracionDeCache = '5m',
): number => {
  const p = precioDe(modelo);
  const escrita = cache === '1h' ? p.cacheEscrita1h : p.cacheEscrita;
  return (
    Math.round(
      ((u.entrada * p.entrada +
        u.cacheEscrita * escrita +
        u.cacheLeida * p.cacheLeida +
        u.salida * p.salida) /
        1_000_000) *
        10_000,
    ) / 10_000
  );
};

/** Los tokens que reporta la API, con la caché aparte. */
export const usoDeLaRespuesta = (usage: {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}): UsoDeTokens => ({
  entrada: usage.input_tokens ?? 0,
  salida: usage.output_tokens ?? 0,
  cacheEscrita: usage.cache_creation_input_tokens ?? 0,
  cacheLeida: usage.cache_read_input_tokens ?? 0,
});

/** De qué licitación son los documentos y para quién se leen. */
export type ContextoDeBases = {
  codigo: string;
  nombre: string;
  organismo: string | null;
  comuna: string | null;
  perfil: string | null;
  /** «licitacion» o «compra_agil» (decisión 95). No entra a las
   *  instrucciones: la caché compartida sigue igual. */
  tipo?: string;
};

// EL PREFIJO COMPARTIDO (decisión 67, 22-10). Felipe: "¿pero la primera
// lectura no es cuando aprieto analizar las bases?". La caché de la API
// solo sirve cuando el comienzo del pedido es idéntico, así que el análisis
// y «Pregúntale a la IA» empiezan igual: las mismas instrucciones comunes
// en el sistema y los mismos documentos primero, con la marca de caché de
// 1 hora al final de ese bloque. Lo que cambia (qué analizar, qué
// preguntar) va después de la marca. Así el análisis deja las bases
// guardadas y cada pregunta de esa hora las lee de la caché (el 5 % del
// precio de entrada), en vez de volver a leerlas.

/** Una hora: lo que dura leer el análisis, pensar y preguntar de a poco.
 *  Escribirla cuesta 2 veces la entrada (5 minutos costaría 1,25). */
export const CACHE_DE_BASES: Anthropic.CacheControlEphemeral = {
  type: 'ephemeral',
  ttl: '1h',
};
export const DURACION_DE_LA_CACHE: DuracionDeCache = '1h';

/** Lo que leen igual el análisis y las preguntas: quién lee, qué
 *  licitación y para qué empresa. IDÉNTICO en los dos pedidos. */
export const instruccionesComunes = (c: ContextoDeBases): string =>
  [
    'Lees las bases de una licitación pública de Chile (Mercado Público) para una empresa que evalúa postular o está preparando su oferta.',
    `La licitación es ${c.codigo}, "${c.nombre}"${c.organismo ? `, de ${c.organismo}` : ''}${c.comuna ? ` (${c.comuna})` : ''}.`,
    `La empresa: ${c.perfil?.trim() || '(sin descripción)'}`,
    '',
    'Lee COMPLETOS todos los documentos que te paso (bases, anexos, aclaratorias, decretos). Si una aclaratoria cambia algo, manda la aclaratoria.',
    'Responde en español de Chile, claro y sin jerga. No inventes: si algo no está en los documentos, no lo des por dicho.',
  ].join('\n');

/** El sistema del pedido, con la marca de caché. */
export const sistemaConCache = (
  c: ContextoDeBases,
): Anthropic.TextBlockParam[] => [
  {
    type: 'text',
    text: instruccionesComunes(c),
    cache_control: CACHE_DE_BASES,
  },
];

/** Los documentos y, al final, la marca de caché: todo lo anterior es lo
 *  que la API guarda una hora. */
export const prefijoDeDocumentos = (
  bloques: Anthropic.DocumentBlockParam[],
): Anthropic.ContentBlockParam[] => [
  ...bloques,
  {
    type: 'text',
    text: 'Estos son los documentos de la licitación.',
    cache_control: CACHE_DE_BASES,
  },
];

/** Lo que la IA puede leer y lo que no (ZIP, Excel, imágenes), en el orden
 *  en que se subió: así "el documento" es el que uno ve. */
export const separar = (archivos: Adjunto[]) => {
  const leibles: Adjunto[] = [];
  const noLeidos: NoLeido[] = [];
  for (const a of archivos) {
    if (esLeible(a.nombre)) leibles.push(a);
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
 *  `sinAbrir`. El título es el nombre, o el que se le dé (la validación
 *  pone la carpeta del ZIP, decisión 83). Con `subir`, si los PDF pasan de
 *  22 MB juntos van todos por la Files API, con su `file_id` (decisión 103);
 *  sin `subir`, siempre dentro del pedido. */
export const armarContenido = async (
  leibles: ReadonlyArray<{ nombre: string; ruta: string; titulo?: string }>,
  descargar: (ruta: string) => Promise<Buffer>,
  subir?: (datos: Buffer, nombre: string) => Promise<string>,
) => {
  const bloques: Anthropic.DocumentBlockParam[] = [];
  const sinAbrir: NoLeido[] = [];
  const bajados: Buffer[] = [];
  for (const a of leibles) {
    bajados.push(await descargar(a.ruta));
  }
  const pesoDeLosPdf = leibles.reduce(
    (suma, a, i) =>
      extensionDe(a.nombre) === 'pdf' ? suma + bajados[i].length : suma,
    0,
  );
  const aparte = subir && pesoDeLosPdf > MAX_BYTES_DE_PDF ? subir : null;
  for (const [i, a] of leibles.entries()) {
    const datos = bajados[i];
    const ext = extensionDe(a.nombre);
    if (ext === 'pdf') {
      bloques.push({
        type: 'document',
        title: a.titulo ?? a.nombre,
        source: aparte
          ? { type: 'file', file_id: await aparte(datos, a.nombre) }
          : {
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
      title: a.titulo ?? a.nombre,
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
