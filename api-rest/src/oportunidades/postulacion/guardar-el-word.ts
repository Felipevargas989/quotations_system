import { archivoDelZip, nombresDelZip, textoDeDocx } from '../analisis/docx';
import { leerElWord, type ParrafoEditable } from './el-word-editable';
import type { Alineacion, Formato } from './estilos-del-word';
import { arbolDelXml, enXml, hijo, type Nodo } from './xml-del-word';
import { armarZip } from './zip';

// GUARDAR LO EDITADO EN EL MISMO WORD (decisión 78 del doc 17, 24-10): se
// reescriben solo los párrafos que cambiaron, y de cada uno solo sus
// corridas de texto. Lo demás queda como estaba, letra por letra: el
// diseño del párrafo (alineación, sangría, viñeta), las tablas, el
// encabezado con el logo, los márgenes. Cada pedazo conserva la letra, el
// tamaño y el color de la corrida de la que salió; la negrita, la cursiva y
// el subrayado se escriben solo si se cambiaron.

/** Un pedazo de un párrafo editado. `r`: la corrida de la que salió (sin
 *  él, toma el formato del pedazo anterior). b, i, u: como se ven ahora. */
export type TramoEditado = {
  r?: number;
  t: string;
  b?: boolean;
  i?: boolean;
  u?: boolean;
};

/** Cómo queda alineado el párrafo (decisión 78, 25-10: Felipe, con los
 *  precios del Formulario N°5 centrados en una fila y a la derecha en otra:
 *  "¿será necesario incluir una herramienta para manejar los centrados?").
 *  Sin decirlo, como estaba. */
export type AlineacionEditada = 'izquierda' | Alineacion;

export type ParrafoEditado = {
  id: number;
  tramos: TramoEditado[];
  alineacion?: AlineacionEditada;
};

/** No se guarda, por lo que dice el mensaje. */
export class NoSeGuarda extends Error {}

/** El Word cambió mientras se editaba: se guardaría encima de otra cosa. */
export class OtraVersion extends Error {}

// El orden de las propiedades de una corrida en el Word: si una va fuera
// de su lugar, Word dice que el archivo está dañado.
const ORDEN_DEL_RPR = [
  'w:rStyle',
  'w:rFonts',
  'w:b',
  'w:bCs',
  'w:i',
  'w:iCs',
  'w:caps',
  'w:smallCaps',
  'w:strike',
  'w:dstrike',
  'w:outline',
  'w:shadow',
  'w:emboss',
  'w:imprint',
  'w:noProof',
  'w:snapToGrid',
  'w:vanish',
  'w:webHidden',
  'w:color',
  'w:spacing',
  'w:w',
  'w:kern',
  'w:position',
  'w:sz',
  'w:szCs',
  'w:highlight',
  'w:u',
  'w:effect',
  'w:bdr',
  'w:shd',
  'w:fitText',
  'w:vertAlign',
  'w:rtl',
  'w:cs',
  'w:em',
  'w:lang',
  'w:eastAsianLayout',
  'w:specVanish',
  'w:oMath',
];

// Y el de las propiedades de un párrafo: la alineación (`w:jc`) va después
// del espaciado y la sangría, y antes de la marca del párrafo (`w:rPr`).
const ORDEN_DEL_PPR = [
  'w:pStyle',
  'w:keepNext',
  'w:keepLines',
  'w:pageBreakBefore',
  'w:framePr',
  'w:widowControl',
  'w:numPr',
  'w:suppressLineNumbers',
  'w:pBdr',
  'w:shd',
  'w:tabs',
  'w:suppressAutoHyphens',
  'w:kinsoku',
  'w:wordWrap',
  'w:overflowPunct',
  'w:topLinePunct',
  'w:autoSpaceDE',
  'w:autoSpaceDN',
  'w:bidi',
  'w:adjustRightInd',
  'w:snapToGrid',
  'w:spacing',
  'w:ind',
  'w:contextualSpacing',
  'w:mirrorIndents',
  'w:suppressOverlap',
  'w:jc',
  'w:textDirection',
  'w:textAlignment',
  'w:textboxTightWrap',
  'w:outlineLvl',
  'w:divId',
  'w:cnfStyle',
  'w:rPr',
  'w:sectPr',
  'w:pPrChange',
];

/** Las propiedades (`raiz`: `w:rPr` o `w:pPr`) con `nombre` cambiado por
 *  `nuevo` (o sin él, si `nuevo` es null), en su lugar. Lo desconocido (las
 *  extensiones de Word nuevo, `w14:...`) va al final. */
const conHijo = (
  propiedades: string,
  raiz: string,
  orden: readonly string[],
  nombre: string,
  nuevo: string | null,
): string => {
  const fuente = propiedades || `<${raiz}/>`;
  const nodo = hijo(arbolDelXml(fuente) ?? undefined, raiz);
  if (!nodo) return propiedades;
  const lugar = (n: string) => {
    const i = orden.indexOf(n);
    return i < 0 ? orden.length : i;
  };
  const partes = nodo.hijos
    .filter((h) => h.nombre !== nombre)
    .map((h) => ({ nombre: h.nombre, xml: enXml(fuente, h) }));
  if (nuevo) {
    const i = partes.findIndex((p) => lugar(p.nombre) > lugar(nombre));
    partes.splice(i < 0 ? partes.length : i, 0, { nombre, xml: nuevo });
  }
  return partes.length > 0
    ? `<${raiz}>${partes.map((p) => p.xml).join('')}</${raiz}>`
    : '';
};

/** Las propiedades de una corrida con `nombre` cambiado por `nuevo` (o sin
 *  él, si `nuevo` es null), en su lugar. */
export const conPropiedad = (
  rPr: string,
  nombre: string,
  nuevo: string | null,
): string => conHijo(rPr, 'w:rPr', ORDEN_DEL_RPR, nombre, nuevo);

const EN_WORD: Record<AlineacionEditada, string> = {
  izquierda: 'left',
  centro: 'center',
  derecha: 'right',
  justificado: 'both',
};

/** El diseño del párrafo con otra alineación, solo si cambió: escrita
 *  explícita, para que mande sobre la del estilo. */
export const conAlineacion = (
  pPr: string,
  antes: AlineacionEditada,
  ahora: AlineacionEditada | undefined,
): string =>
  !ahora || ahora === antes
    ? pPr
    : conHijo(
        pPr,
        'w:pPr',
        ORDEN_DEL_PPR,
        'w:jc',
        `<w:jc w:val="${EN_WORD[ahora]}"/>`,
      );

const sinPropiedades = (rPr: string, nombres: readonly string[]): string =>
  nombres.reduce((x, n) => conPropiedad(x, n, null), rPr);

// Lo que la IA dejó por completar o no pudo leer de un PDF.
const PENDIENTE = /\[(COMPLETAR|ILEGIBLE)/i;

const COMO_SE_ESCRIBE: Record<'b' | 'i' | 'u', [string, string, string]> = {
  b: ['w:b', '<w:b/>', '<w:b w:val="0"/>'],
  i: ['w:i', '<w:i/>', '<w:i w:val="0"/>'],
  u: ['w:u', '<w:u w:val="single"/>', '<w:u w:val="none"/>'],
};

/** Las propiedades del pedazo: las de su corrida, con la negrita, la
 *  cursiva y el subrayado escritos solo si cambiaron (`<w:b w:val="0"/>`
 *  apaga también la negrita que viene del estilo). Si la corrida era un
 *  [COMPLETAR: ...] y ya no lo es, pierde el resaltado. */
const conElFormato = (
  rPr: string,
  antes: Formato,
  textoAntes: string,
  tramo: TramoEditado,
): string => {
  let nuevo = rPr;
  for (const p of ['b', 'i', 'u'] as const) {
    const ahora = tramo[p];
    if (ahora === undefined || ahora === Boolean(antes[p])) continue;
    const [nombre, si, no] = COMO_SE_ESCRIBE[p];
    nuevo = conPropiedad(nuevo, nombre, ahora ? si : no);
  }
  if (PENDIENTE.test(textoAntes) && !PENDIENTE.test(tramo.t)) {
    nuevo = sinPropiedades(nuevo, ['w:highlight', 'w:shd']);
  }
  return nuevo;
};

// Lo que no cabe en un XML (caracteres de control) se descarta.
const cabeEnUnXml = (c: string): boolean => {
  const n = c.codePointAt(0) ?? 0;
  return (
    n === 0x9 ||
    n === 0xa ||
    n === 0xd ||
    (n >= 0x20 && n <= 0xd7ff) ||
    (n >= 0xe000 && n <= 0xfffd) ||
    n >= 0x10000
  );
};

const escapar = (t: string): string =>
  Array.from(t)
    .filter(cabeEnUnXml)
    .join('')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

/** Una corrida con su texto: «\n» es un salto de línea, «\f» uno de
 *  página, «\t» un tabulador y U+2011 el guion que no se corta. */
const corrida = (rPr: string, texto: string): string => {
  const piezas = texto
    .replace(/\r\n?/g, '\n')
    .split(/(\n|\f|\t|\u2011)/)
    .filter((x) => x !== '')
    .map((x) => {
      if (x === '\n') return '<w:br/>';
      if (x === '\f') return '<w:br w:type="page"/>';
      if (x === '\t') return '<w:tab/>';
      if (x === '\u2011') return '<w:noBreakHyphen/>';
      return `<w:t xml:space="preserve">${escapar(x)}</w:t>`;
    });
  return piezas.length > 0 ? `<w:r>${rPr}${piezas.join('')}</w:r>` : '';
};

const rPrDe = (xml: string, n: Nodo) => {
  const rPr = hijo(n, 'w:rPr');
  return rPr ? enXml(xml, rPr) : '';
};

type Fuente = { rPr: string; formato: Formato; texto: string };

/** El párrafo nuevo: su apertura y su diseño (`w:pPr`) tal cual, los
 *  marcadores (`w:bookmarkStart`...) en sus extremos, y las corridas
 *  nuevas. */
const parrafoNuevo = (
  xml: string,
  e: ParrafoEditable,
  { tramos, alineacion }: ParrafoEditado,
): string => {
  const p = e.nodo;
  const apertura = xml.slice(p.inicio, p.finApertura).replace(/\s*\/>$/, '>');
  const de = (nombres: readonly string[]) =>
    p.hijos
      .filter((h) => nombres.includes(h.nombre))
      .map((h) => enXml(xml, h))
      .join('');
  const pPr = hijo(p, 'w:pPr');
  // La marca del párrafo (`w:pPr/w:rPr`) da el formato de lo que se escribe
  // en un párrafo vacío, como en Word, sin sus marcas de cambios.
  const marca: Fuente = {
    rPr: sinPropiedades(pPr ? rPrDe(xml, pPr) : '', [
      'w:ins',
      'w:del',
      'w:moveFrom',
      'w:moveTo',
      'w:rPrChange',
    ]),
    formato: e.deLaMarca,
    texto: '',
  };
  const deLaCorrida = (r: number | undefined): Fuente | undefined => {
    const c = r === undefined ? undefined : e.corridas[r];
    return c && { rPr: rPrDe(xml, c.nodo), formato: c.formato, texto: c.texto };
  };
  let anterior = deLaCorrida(0) ?? marca;
  const corridas = tramos
    .map((t) => {
      const fuente = deLaCorrida(t.r) ?? anterior;
      anterior = fuente;
      return corrida(
        conElFormato(fuente.rPr, fuente.formato, fuente.texto, t),
        t.t,
      );
    })
    .join('');
  const diseno = conAlineacion(
    de(['w:pPr']),
    e.alineacion ?? 'izquierda',
    alineacion,
  );
  return `${apertura}${diseno}${de(['w:bookmarkStart', 'w:permStart'])}${corridas}${de(['w:bookmarkEnd', 'w:permEnd'])}</w:p>`;
};

/** El mismo Word con otro word/document.xml. El texto (XML) va
 *  comprimido, como lo guarda Word; las imágenes ya vienen comprimidas y
 *  van tal cual. */
export const conElDocumento = (docx: Buffer, xml: string): Buffer => {
  const nombres = nombresDelZip(docx);
  if (!nombres) throw new NoSeGuarda('Este Word no se puede abrir.');
  return armarZip(
    nombres.map((nombre) => {
      const comprimir = /\.(xml|rels)$/i.test(nombre);
      if (nombre === 'word/document.xml') {
        return { nombre, datos: Buffer.from(xml, 'utf8'), comprimir };
      }
      const datos = archivoDelZip(docx, nombre);
      if (!datos) throw new NoSeGuarda('Este Word no se puede abrir entero.');
      return { nombre, datos, comprimir };
    }),
  );
};

/** El Word con los párrafos editados. `version`: la huella con que se
 *  abrió (si el Word cambió desde entonces, OtraVersion). */
export const guardarCambios = (
  docx: Buffer,
  version: string,
  parrafos: readonly ParrafoEditado[],
): Buffer => {
  const lectura = leerElWord(docx);
  if (!lectura) throw new NoSeGuarda('Este Word no se puede editar aquí.');
  if (lectura.version !== version) {
    throw new OtraVersion('El Word cambió mientras se editaba.');
  }
  const vistos = new Set<number>();
  const cambios = parrafos
    .map((p) => {
      const e = lectura.editables.get(p.id);
      if (!e || vistos.has(p.id)) {
        throw new NoSeGuarda(`El párrafo ${p.id + 1} no se puede editar aquí.`);
      }
      vistos.add(p.id);
      return { e, nuevo: parrafoNuevo(lectura.xml, e, p) };
    })
    .sort((a, b) => b.e.nodo.inicio - a.e.nodo.inicio);
  // De atrás hacia adelante: así no se corren los lugares de los demás.
  const xml = cambios.reduce(
    (x, c) => x.slice(0, c.e.nodo.inicio) + c.nuevo + x.slice(c.e.nodo.fin),
    lectura.xml,
  );
  if (!arbolDelXml(xml)) throw new NoSeGuarda('El Word quedaría dañado.');
  const nuevo = conElDocumento(docx, xml);
  if (textoDeDocx(nuevo) === null) {
    throw new NoSeGuarda('El Word quedaría dañado.');
  }
  return nuevo;
};
