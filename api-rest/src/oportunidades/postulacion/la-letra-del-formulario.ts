import { archivoDelZip, textoDeDocx } from '../analisis/docx';
import { textoDeLaCorrida } from './el-word-editable';
import {
  encima,
  type Estilos,
  estilosDelWord,
  formatoDe,
  formatoDeLaTabla,
  formatoDelEstilo,
} from './estilos-del-word';
import { conElDocumento, conPropiedad } from './guardar-el-word';
import { arbolDelXml, atributo, enXml, hijo, type Nodo } from './xml-del-word';

// LA LETRA DEL FORMULARIO MANDA (decisión 82 del doc 17, 26-10). Felipe,
// con el Formulario N°5 de la 5040-14-LE26 abierto: "¿por qué pareciera
// que los tipos de letra son diferentes?". El formulario del municipio
// estaba entero en Calibri y lo que escribió la IA en las celdas vacías (los
// montos y los «No aplica»), en Times New Roman: la habilidad de Word
// escribe una corrida sin letra, que toma la base del documento y no la de
// la celda. Felipe: "dejemos por defecto siempre Calibri"; quedamos en que
// manda la letra del mismo formulario y Calibri solo cuando no haya de dónde
// copiarla (hay municipios que usan Arial u otra).
//
// Se corrige solo lo que cayó a la base por no decir su letra: una corrida
// sin letra propia ni estilo de carácter, que se ve con la letra base del
// documento. Toma la letra y el tamaño del texto con letra propia más
// cercano: su párrafo, su celda, su fila, su tabla y, si no, la letra de la
// mayor parte del documento. Lo que el formulario pone con un estilo (un
// título, una tabla con su letra) no se toca. Se aplica a lo que entrega la
// IA antes de guardarlo y al guardar desde el editor, así un Word de antes
// queda bien con solo guardarlo.

/** La letra de cuando el Word no dice ninguna (Felipe, 26-10). */
export const LETRA_POR_DEFECTO = 'Calibri';

/** Las letras que dice una corrida misma: las del texto o las del tema. */
const LETRA_PROPIA = /\sw:(?:ascii|hAnsi|asciiTheme|hAnsiTheme)\s*=/;

/** Dónde puede haber párrafos con texto del documento (sin los cuadros de
 *  texto: van dentro de una imagen). */
const CON_PARRAFOS = new Set([
  'w:body',
  'w:tbl',
  'w:tr',
  'w:tc',
  'w:sdt',
  'w:sdtContent',
  'w:customXml',
]);

/** Lo que no se ve como texto del párrafo: lo borrado con control de
 *  cambios, las imágenes, el diseño. */
const SIN_TEXTO = ['w:del', 'w:moveFrom', 'w:drawing', 'w:pict', 'w:pPr'];

type Corrida = {
  nodo: Nodo;
  /** Cuántas letras tiene, sin espacios. */
  letras: number;
  /** La letra con que se ve, como la escribe el Word; '' si nada la dice. */
  letra: string;
  pt?: number;
  /** Dice su letra ella misma. */
  propia: boolean;
  /** Tiene estilo de carácter: lo decide el estilo. */
  conEstilo: boolean;
  /** Su tamaño escrito en ella (`w:sz`). */
  conTamano: boolean;
  /** Dónde está, de lo más cerca a lo más lejos: su párrafo, su celda, su
   *  fila y su tabla. */
  grupos: Nodo[];
};

/** De dónde se copia: la letra (`w:rFonts`) y el tamaño, como XML. */
type Fuente = {
  letra: string;
  rFonts: string;
  pt?: number;
  sz?: string;
  szCs?: string;
};

/** Para comparar letras: «Calibri» y «calibri» son la misma. */
const igual = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

const corridasDe = (n: Nodo): Nodo[] =>
  n.hijos.flatMap((h) => {
    if (h.nombre === 'w:r') return [h];
    return SIN_TEXTO.includes(h.nombre) ? [] : corridasDe(h);
  });

/** El nombre de una letra, con la del tema resuelta. */
const nombreDe = (estilos: Estilos, letra: string | undefined): string =>
  (letra === '@menor'
    ? estilos.temas.menor
    : letra === '@mayor'
      ? estilos.temas.mayor
      : letra
  )?.trim() ?? '';

/** Las corridas con texto del cuerpo del documento, con lo que se ve de
 *  cada una y dónde está. */
const leerCorridas = (xml: string, estilos: Estilos, cuerpo: Nodo) => {
  const corridas: Corrida[] = [];
  const parrafo = (p: Nodo, ancestros: Nodo[]) => {
    const pPr = hijo(p, 'w:pPr');
    const estilo =
      atributo(xml, hijo(pPr, 'w:pStyle'), 'w:val') ??
      estilos.parrafoPorDefecto;
    const base = [
      formatoDeLaTabla(xml, estilos, ancestros),
      formatoDelEstilo(estilos, estilo),
    ].reduce(encima, estilos.base);
    const ultimo = (nombre: string) =>
      [...ancestros].reverse().find((n) => n.nombre === nombre);
    const grupos = [p, ultimo('w:tc'), ultimo('w:tr'), ultimo('w:tbl')].filter(
      (n): n is Nodo => n !== undefined,
    );
    for (const r of corridasDe(p)) {
      const letras = textoDeLaCorrida(xml, r).replace(/\s+/g, '').length;
      if (letras === 0) continue;
      const rPr = hijo(r, 'w:rPr');
      const rStyle = atributo(xml, hijo(rPr, 'w:rStyle'), 'w:val');
      const f = [
        formatoDelEstilo(estilos, rStyle ?? undefined),
        formatoDe(xml, rPr),
      ].reduce(encima, base);
      const rFonts = hijo(rPr, 'w:rFonts');
      corridas.push({
        nodo: r,
        letras,
        letra: nombreDe(estilos, f.letra),
        ...(f.pt ? { pt: f.pt } : {}),
        propia:
          rFonts !== undefined &&
          LETRA_PROPIA.test(xml.slice(rFonts.inicio, rFonts.finApertura)),
        conEstilo: rStyle !== null,
        conTamano: hijo(rPr, 'w:sz') !== undefined,
        grupos,
      });
    }
  };
  const visitar = (n: Nodo, ancestros: Nodo[]) => {
    for (const h of n.hijos) {
      if (h.nombre === 'w:p') parrafo(h, [...ancestros, n]);
      else if (CON_PARRAFOS.has(h.nombre)) visitar(h, [...ancestros, n]);
    }
  };
  visitar(cuerpo, []);
  return corridas;
};

/** La letra y el tamaño de una corrida que los dice ella misma. */
const fuenteDe = (xml: string, c: Corrida): Fuente => {
  const rPr = hijo(c.nodo, 'w:rPr');
  const rFonts = hijo(rPr, 'w:rFonts');
  const sz = hijo(rPr, 'w:sz');
  const szCs = hijo(rPr, 'w:szCs');
  return {
    letra: c.letra,
    rFonts: rFonts ? enXml(xml, rFonts) : '',
    ...(c.pt ? { pt: c.pt } : {}),
    ...(sz ? { sz: enXml(xml, sz) } : {}),
    ...(szCs ? { szCs: enXml(xml, szCs) } : {}),
  };
};

/** La que tiene más texto. */
const laQueMas = (corridas: readonly Corrida[]): Corrida | undefined =>
  corridas.reduce<Corrida | undefined>(
    (mejor, c) => (!mejor || c.letras > mejor.letras ? c : mejor),
    undefined,
  );

/** Una letra escrita por su nombre, cuando nadie la trae puesta. */
const escrita = (letra: string): Fuente => ({
  letra,
  rFonts: `<w:rFonts w:ascii="${letra}" w:hAnsi="${letra}" w:cs="${letra}"/>`,
});

/** La letra de la mayor parte del documento, si pasa de la mitad del
 *  texto: copiada de la corrida que más la usa diciéndola ella misma o, si
 *  ninguna la dice, escrita por su nombre. */
const deLaMayoria = (
  xml: string,
  corridas: readonly Corrida[],
): Fuente | undefined => {
  const porLetra = new Map<string, { letra: string; letras: number }>();
  for (const c of corridas) {
    const clave = c.letra.toLowerCase();
    const antes = porLetra.get(clave);
    porLetra.set(clave, {
      letra: antes?.letra ?? c.letra,
      letras: (antes?.letras ?? 0) + c.letras,
    });
  }
  const total = corridas.reduce((s, c) => s + c.letras, 0);
  const mayor = [...porLetra.values()].reduce<
    { letra: string; letras: number } | undefined
  >((m, x) => (!m || x.letras > m.letras ? x : m), undefined);
  if (!mayor || mayor.letra === '' || mayor.letras * 2 <= total) return;
  const c = laQueMas(
    corridas.filter((x) => x.propia && igual(x.letra, mayor.letra)),
  );
  return c ? fuenteDe(xml, c) : escrita(mayor.letra);
};

/** El document.xml con la letra del formulario en lo que cayó a la base;
 *  `cambiadas`: cuántas corridas cambió. */
export const laLetraEnElXml = (
  docx: Buffer,
  xml: string,
): { xml: string; cambiadas: number } => {
  const arbol = arbolDelXml(xml);
  const cuerpo = hijo(hijo(arbol ?? undefined, 'w:document'), 'w:body');
  if (!cuerpo) return { xml, cambiadas: 0 };
  const estilos = estilosDelWord(docx);
  const corridas = leerCorridas(xml, estilos, cuerpo);
  const letraBase = nombreDe(
    estilos,
    encima(estilos.base, formatoDelEstilo(estilos, estilos.parrafoPorDefecto))
      .letra,
  );

  // Las que dicen su letra, por cada lugar donde están.
  const porGrupo = new Map<Nodo, Corrida[]>();
  for (const c of corridas.filter((x) => x.propia)) {
    for (const g of c.grupos) porGrupo.set(g, [...(porGrupo.get(g) ?? []), c]);
  }
  const mayoria = deLaMayoria(xml, corridas);

  const cambios: Array<{ inicio: number; fin: number; nuevo: string }> = [];
  for (const c of corridas) {
    if (c.propia || c.conEstilo || !igual(c.letra, letraBase)) continue;
    const cercana = c.grupos
      .map((g) => laQueMas(porGrupo.get(g) ?? []))
      .find((x): x is Corrida => x !== undefined);
    const fuente = cercana
      ? fuenteDe(xml, cercana)
      : (mayoria ?? (c.letra === '' ? escrita(LETRA_POR_DEFECTO) : undefined));
    if (!fuente) continue;
    const cambiaLetra = fuente.rFonts !== '' && !igual(fuente.letra, c.letra);
    const cambiaTamano =
      !c.conTamano && fuente.sz !== undefined && fuente.pt !== c.pt;
    if (!cambiaLetra && !cambiaTamano) continue;
    const rPr = hijo(c.nodo, 'w:rPr');
    let nuevo = rPr ? enXml(xml, rPr) : '';
    if (cambiaLetra) nuevo = conPropiedad(nuevo, 'w:rFonts', fuente.rFonts);
    if (cambiaTamano && fuente.sz) {
      nuevo = conPropiedad(nuevo, 'w:sz', fuente.sz);
      if (fuente.szCs) nuevo = conPropiedad(nuevo, 'w:szCs', fuente.szCs);
    }
    cambios.push(
      rPr
        ? { inicio: rPr.inicio, fin: rPr.fin, nuevo }
        : { inicio: c.nodo.finApertura, fin: c.nodo.finApertura, nuevo },
    );
  }
  // De atrás hacia adelante: así no se corren los lugares de los demás.
  const nuevoXml = cambios
    .sort((a, b) => b.inicio - a.inicio)
    .reduce((x, k) => x.slice(0, k.inicio) + k.nuevo + x.slice(k.fin), xml);
  return { xml: nuevoXml, cambiadas: cambios.length };
};

/** Sin espacios: lo que importa es que no cambie ni una letra. */
const elTexto = (docx: Buffer): string | null =>
  textoDeDocx(docx)?.replace(/\s+/g, '') ?? null;

/** El mismo Word con la letra del formulario en lo que cayó a la base.
 *  Nunca lanza: si algo no calza (no se lee, quedaría dañado o cambiaría el
 *  texto), devuelve el Word como llegó. */
export const conLaLetraDelFormulario = (
  docx: Buffer,
): { docx: Buffer; cambiadas: number } => {
  const igualQueAntes = { docx, cambiadas: 0 };
  try {
    const xml = archivoDelZip(docx, 'word/document.xml')?.toString('utf8');
    if (!xml) return igualQueAntes;
    const r = laLetraEnElXml(docx, xml);
    if (r.cambiadas === 0 || !arbolDelXml(r.xml)) return igualQueAntes;
    const nuevo = conElDocumento(docx, r.xml);
    const antes = elTexto(docx);
    if (antes === null || elTexto(nuevo) !== antes) return igualQueAntes;
    return { docx: nuevo, cambiadas: r.cambiadas };
  } catch {
    return igualQueAntes;
  }
};
