import type { MarcaDeExigencia } from '../ficha/ficha.repository';
import { LO_QUE_SE_SUBCONTRATA } from '../generacion/instrucciones';
import {
  claveDeExigencia,
  type RespuestaDeLaEmpresa,
} from '../oferente/lo-que-sabemos';
import { esUnPapel } from './los-papeles';

// LAS PREGUNTAS ANTES DE ARMAR (decisión 119, parte 3, 07-11-2026). Felipe:
// "pincho una licitación y le faltan 5 preguntas... si tengo rampla, si no
// tengo rampla... vaso amarillo, lo que sea que pidan las bases. Vuelvo a la
// licitación, me aparece el modal de lo que me falta, yo respondo las
// preguntas y lo genera".
//
// Se pregunta SOLO lo que «¿Puedo cumplir?» dejó en «hay que conseguirlo» y
// que la empresa produce ella misma. No se pregunta:
//  - un documento: va en «Lo que tienes que presentar». Desde la decisión
//    120 (08-11) también la cotización, la propuesta y las fotos aunque no
//    digan «formulario» (`esUnPapel`): los arma Eventia o los subes tú;
//  - lo que la empresa subcontrata: va comprometido (regla de la casa,
//    `LO_SUBCONTRATADO`);
//  - lo ya marcado en «Bases y criterios» para esta licitación;
//  - lo que ya respondió en otra, aunque sea con otras palabras: eso lo ve
//    Haiku 5.5 y se marca solo.

export type PreguntaDeLaPostulacion = {
  /** La exigencia en minúsculas y sin tildes (la de «Bases y criterios»). */
  clave: string;
  /** Lo que dicen las bases, tal cual. */
  exigencia: string;
  /** La pregunta, corta y en palabras simples. */
  pregunta: string;
};

/** Lo que pasó de una exigencia a la memoria de esta licitación. */
export type MarcaSola = { clave: string; respuesta: MarcaDeExigencia };

export type Candidata = { clave: string; exigencia: string; por_que: string };

type ItemDeLaRevision = { que: string; estado: string; por_que: string };

/** Un documento: la misma regla que la pantalla (frontend `exigencias.ts`). */
const ES_DOCUMENTO =
  /\b(formulario|anexo n|certificado|declaracion jurada|declaraciones juradas|copia de|patente|programa de integridad|boleta|garantia|f-?30|estatutos|escritura|curriculum)/;

const texto = (v: unknown): string => (typeof v === 'string' ? v : '');

/** Los ítems de «¿Puedo cumplir?» de un análisis listo. */
export const itemsDeLaRevision = (
  resultado: Record<string, unknown> | null | undefined,
): ItemDeLaRevision[] => {
  const items = (resultado?.cumplimiento as { items?: unknown } | undefined)
    ?.items;
  return Array.isArray(items)
    ? items
        .filter((i): i is Record<string, unknown> => Boolean(i))
        .map((i) => ({
          que: texto(i.que).trim(),
          estado: texto(i.estado),
          por_que: texto(i.por_que).trim(),
        }))
        .filter((i) => i.que)
    : [];
};

/** Lo que podría preguntarse y lo que ya se respondió con las mismas
 *  palabras (eso se marca solo, sin IA). */
export function lasCandidatas(
  items: ItemDeLaRevision[],
  marcas: Record<string, MarcaDeExigencia>,
  respuestas: RespuestaDeLaEmpresa[],
): { candidatas: Candidata[]; yaRespondidas: MarcaSola[] } {
  const guardadas = new Map(respuestas.map((r) => [r.clave, r.respuesta]));
  const vistas = new Set<string>();
  const candidatas: Candidata[] = [];
  const yaRespondidas: MarcaSola[] = [];
  for (const i of items) {
    if (i.estado !== 'conseguir') continue;
    const clave = claveDeExigencia(i.que);
    if (!clave || vistas.has(clave)) continue;
    vistas.add(clave);
    if (ES_DOCUMENTO.test(clave) || esUnPapel(i.que) || marcas[clave]) {
      continue;
    }
    const ya = guardadas.get(clave);
    if (ya) yaRespondidas.push({ clave, respuesta: ya });
    else candidatas.push({ clave, exigencia: i.que, por_que: i.por_que });
  }
  return { candidatas, yaRespondidas };
}

/** Las respuestas que lee la IA: las más nuevas, hasta 300. */
export const MAXIMO_DE_RESPUESTAS = 300;

export const ESQUEMA_DE_LAS_PREGUNTAS = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          exigencia: { type: 'integer' },
          que_hacer: {
            type: 'string',
            enum: ['preguntar', 'subcontrata', 'ya_respondida'],
          },
          respuesta: { type: 'integer' },
          pregunta: { type: 'string' },
        },
        required: ['exigencia', 'que_hacer', 'respuesta', 'pregunta'],
        additionalProperties: false,
      },
    },
  },
  required: ['items'],
  additionalProperties: false,
} as const;

export const instruccionesDeLasPreguntas = (): string =>
  [
    'Preparas las preguntas que una empresa de eventos responde antes de postular a una licitación pública de Chile. Otra IA ya cruzó lo que piden las bases con lo que la empresa tiene en su sistema (Eventia), y estas exigencias quedaron en «hay que conseguirlo»: no se sabe si la empresa las cumple.',
    '',
    'Para CADA exigencia, con su número en "exigencia", decide "que_hacer":',
    `- "subcontrata": es de lo que la empresa subcontrata (${LO_QUE_SE_SUBCONTRATA}). No se pregunta: la empresa lo consigue.`,
    '- "ya_respondida": una de LAS RESPUESTAS QUE YA DIO LA EMPRESA responde exactamente lo mismo, aunque con otras palabras. Pon su número en "respuesta". Solo si de verdad es lo mismo: una rampa de acceso responde «accesibilidad universal para sillas de ruedas»; un salón para 300 personas NO responde «un salón para 500».',
    '- "preguntar": todo lo demás. En "pregunta", la pregunta corta, en palabras simples y de tú, que se responda con sí o no (por ejemplo: «¿Tienes rampa de acceso para sillas de ruedas?»). Con las cantidades que piden las bases, sin tecnicismos y en no más de 120 caracteres.',
    '"respuesta" es 0 si no es "ya_respondida"; "pregunta" queda vacía si no es "preguntar". Responde en español de Chile.',
  ].join('\n');

const EN_PALABRAS: Record<MarcaDeExigencia, string> = {
  lo_tengo: 'lo tiene',
  no_puedo: 'no puede',
};

/** Lo que lee la IA: las exigencias y las respuestas, numeradas. */
export const textoParaLaIA = (
  candidatas: Candidata[],
  respuestas: RespuestaDeLaEmpresa[],
): string =>
  [
    'LAS EXIGENCIAS QUE QUEDARON EN «HAY QUE CONSEGUIRLO»:',
    ...candidatas.map(
      (c, i) =>
        `${i + 1}. ${c.exigencia}${c.por_que ? ` (lo que falta: ${c.por_que})` : ''}`,
    ),
    '',
    'LAS RESPUESTAS QUE YA DIO LA EMPRESA:',
    ...(respuestas.length > 0
      ? respuestas.map(
          (r, i) =>
            `${i + 1}. ${r.pregunta} → ${EN_PALABRAS[r.respuesta]}${r.detalle ? ` (${r.detalle})` : ''}`,
        )
      : ['(ninguna)']),
  ].join('\n');

type Decision = {
  que_hacer: 'preguntar' | 'subcontrata' | 'ya_respondida';
  respuesta: number;
  pregunta: string;
};

/** Lo que devolvió la IA, cruzado: lo que hay que preguntar y lo que se
 *  marca solo. Lo que la IA no nombró (o nombró mal) se pregunta con las
 *  palabras de las bases: mejor preguntar de más que prometer. */
export function lasDecisiones(
  crudo: unknown,
  candidatas: Candidata[],
  respuestas: RespuestaDeLaEmpresa[],
): { preguntas: PreguntaDeLaPostulacion[]; yaRespondidas: MarcaSola[] } {
  const lista = (crudo as { items?: unknown } | null)?.items;
  const decisiones = new Map<number, Decision>();
  for (const d of Array.isArray(lista) ? lista : []) {
    const n = Number((d as { exigencia?: unknown })?.exigencia);
    if (!Number.isInteger(n) || decisiones.has(n)) continue;
    decisiones.set(n, d as Decision);
  }
  const preguntas: PreguntaDeLaPostulacion[] = [];
  const yaRespondidas: MarcaSola[] = [];
  candidatas.forEach((c, i) => {
    const d = decisiones.get(i + 1);
    if (d?.que_hacer === 'subcontrata') return;
    const guardada =
      d?.que_hacer === 'ya_respondida'
        ? respuestas[Number(d.respuesta) - 1]
        : undefined;
    if (guardada) {
      yaRespondidas.push({ clave: c.clave, respuesta: guardada.respuesta });
      return;
    }
    const corta = d?.que_hacer === 'preguntar' ? texto(d.pregunta).trim() : '';
    preguntas.push({
      clave: c.clave,
      exigencia: c.exigencia.slice(0, 1000),
      pregunta: (corta || c.exigencia).slice(0, 400),
    });
  });
  return { preguntas, yaRespondidas };
}
