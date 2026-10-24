import { archivoDelZip } from '../analisis/docx';
import {
  arbolDelXml,
  atributo,
  buscar,
  hijo,
  hijos,
  type Nodo,
  numero,
} from './xml-del-word';

// LOS ESTILOS DE UN WORD (decisión 78 del doc 17): qué se ve en negrita,
// cursiva o subrayado, con qué letra, tamaño y color, aunque la corrida no
// lo diga. Lo dicen los estilos (word/styles.xml), el tema
// (word/theme/theme1.xml) y, en una tabla con estilo, la parte de la tabla
// donde está la celda (la primera fila o la primera columna en negrita).

/** Lo que se ve de una corrida. undefined = ese nivel no lo dice. La letra
 *  del tema va como «@menor» o «@mayor» hasta saber cuál es. */
export type Formato = {
  b?: boolean;
  i?: boolean;
  u?: boolean;
  pt?: number;
  letra?: string;
  /** RRGGBB. */
  color?: string;
};

export type Alineacion = 'centro' | 'derecha' | 'justificado';

const NO = ['0', 'false', 'off'];
const SI = ['1', 'true', 'on'];

/** Una propiedad de sí o no: `<w:b/>` es sí, `<w:b w:val="0"/>` es no. */
const siONo = (xml: string, rPr: Nodo | undefined, nombre: string) => {
  const p = hijo(rPr, nombre);
  if (!p) return undefined;
  const v = atributo(xml, p, 'w:val');
  return v === null || !NO.includes(v.toLowerCase());
};

/** La letra: la del tema manda sobre la que viene escrita (así lo hace
 *  Word). */
const letraDe = (xml: string, rPr: Nodo | undefined): string | undefined => {
  const f = hijo(rPr, 'w:rFonts');
  const tema =
    atributo(xml, f, 'w:asciiTheme') ?? atributo(xml, f, 'w:hAnsiTheme');
  if (tema) return tema.startsWith('major') ? '@mayor' : '@menor';
  return (
    atributo(xml, f, 'w:ascii') ?? atributo(xml, f, 'w:hAnsi') ?? undefined
  );
};

export const formatoDe = (xml: string, rPr: Nodo | undefined): Formato => {
  const u = hijo(rPr, 'w:u');
  const sz = numero(xml, hijo(rPr, 'w:sz'));
  const color = atributo(xml, hijo(rPr, 'w:color'), 'w:val');
  return {
    b: siONo(xml, rPr, 'w:b'),
    i: siONo(xml, rPr, 'w:i'),
    u: u ? atributo(xml, u, 'w:val') !== 'none' : undefined,
    pt: sz > 0 ? sz / 2 : undefined,
    letra: letraDe(xml, rPr),
    color:
      color && /^[0-9A-Fa-f]{6}$/.test(color) ? color.toUpperCase() : undefined,
  };
};

/** `arriba` manda sobre `abajo` en lo que dice. */
export const encima = (abajo: Formato, arriba: Formato): Formato => ({
  b: arriba.b ?? abajo.b,
  i: arriba.i ?? abajo.i,
  u: arriba.u ?? abajo.u,
  pt: arriba.pt ?? abajo.pt,
  letra: arriba.letra ?? abajo.letra,
  color: arriba.color ?? abajo.color,
});

export const alineacionDe = (
  xml: string,
  pPr: Nodo | undefined,
): Alineacion | undefined => {
  const jc = atributo(xml, hijo(pPr, 'w:jc'), 'w:val');
  if (jc === 'center') return 'centro';
  if (jc === 'right' || jc === 'end') return 'derecha';
  if (jc === 'both' || jc === 'distribute') return 'justificado';
  return undefined;
};

/** Las partes de una tabla que su estilo puede pintar distinto. */
type Condicion = 'firstCol' | 'lastCol' | 'firstRow' | 'lastRow';
const CONDICIONES: readonly Condicion[] = [
  'firstCol',
  'lastCol',
  'firstRow',
  'lastRow',
];

export type Estilo = {
  basadoEn?: string;
  formato: Formato;
  alineacion?: Alineacion;
  condicional: Partial<Record<Condicion, Formato>>;
  fondoCondicional: Partial<Record<Condicion, string>>;
};

export type Estilos = {
  base: Formato;
  porId: Map<string, Estilo>;
  parrafoPorDefecto?: string;
  tablaPorDefecto?: string;
  /** Las letras del tema: la del texto y la de los títulos. */
  temas: { menor?: string; mayor?: string };
};

/** Un color de fondo RRGGBB; null si es «auto» o no es un color. */
export const fondoDe = (xml: string, shd: Nodo | undefined): string | null => {
  const fill = atributo(xml, shd, 'w:fill');
  return fill && /^[0-9A-Fa-f]{6}$/.test(fill) ? fill.toUpperCase() : null;
};

/** Las letras del tema: «Calibri» para el texto y «Calibri Light» para los
 *  títulos, en el Word de siempre. */
const letrasDelTema = (docx: Buffer): Estilos['temas'] => {
  const datos = archivoDelZip(docx, 'word/theme/theme1.xml');
  if (!datos) return {};
  const xml = datos.toString('utf8');
  const arbol = arbolDelXml(xml) ?? undefined;
  const letra = (cual: string) =>
    atributo(xml, hijo(buscar(arbol, cual)[0], 'a:latin'), 'typeface') ||
    undefined;
  return { menor: letra('a:minorFont'), mayor: letra('a:majorFont') };
};

/** Los estilos del Word (word/styles.xml) y las letras de su tema. */
export const estilosDelWord = (docx: Buffer): Estilos => {
  const estilos: Estilos = {
    base: {},
    porId: new Map(),
    temas: letrasDelTema(docx),
  };
  const datos = archivoDelZip(docx, 'word/styles.xml');
  if (!datos) return estilos;
  const xml = datos.toString('utf8');
  const raiz = hijo(arbolDelXml(xml) ?? undefined, 'w:styles');
  if (!raiz) return estilos;
  estilos.base = formatoDe(
    xml,
    hijo(hijo(hijo(raiz, 'w:docDefaults'), 'w:rPrDefault'), 'w:rPr'),
  );
  for (const s of hijos(raiz, 'w:style')) {
    const id = atributo(xml, s, 'w:styleId');
    if (!id) continue;
    const tipo = atributo(xml, s, 'w:type');
    const porDefecto = SI.includes(atributo(xml, s, 'w:default') ?? '');
    if (porDefecto && tipo === 'paragraph') estilos.parrafoPorDefecto = id;
    if (porDefecto && tipo === 'table') estilos.tablaPorDefecto = id;
    const estilo: Estilo = {
      basadoEn: atributo(xml, hijo(s, 'w:basedOn'), 'w:val') ?? undefined,
      formato: formatoDe(xml, hijo(s, 'w:rPr')),
      alineacion: alineacionDe(xml, hijo(s, 'w:pPr')),
      condicional: {},
      fondoCondicional: {},
    };
    for (const c of hijos(s, 'w:tblStylePr')) {
      const cual = atributo(xml, c, 'w:type') as Condicion | null;
      if (!cual || !CONDICIONES.includes(cual)) continue;
      estilo.condicional[cual] = formatoDe(xml, hijo(c, 'w:rPr'));
      const fondo = fondoDe(xml, hijo(hijo(c, 'w:tcPr'), 'w:shd'));
      if (fondo) estilo.fondoCondicional[cual] = fondo;
    }
    estilos.porId.set(id, estilo);
  }
  return estilos;
};

/** Un estilo y los que hereda, la base primero. */
export const cadena = (estilos: Estilos, id: string | undefined): Estilo[] => {
  const lista: Estilo[] = [];
  const vistos = new Set<string>();
  for (let actual = id; actual && !vistos.has(actual); ) {
    vistos.add(actual);
    const e = estilos.porId.get(actual);
    if (!e) break;
    lista.unshift(e);
    actual = e.basadoEn;
  }
  return lista;
};

export const formatoDelEstilo = (estilos: Estilos, id: string | undefined) =>
  cadena(estilos, id).reduce<Formato>((f, e) => encima(f, e.formato), {});

// ——— Las tablas ———

/** Las filas de una tabla y las celdas de una fila, también las que vienen
 *  dentro de un control de contenido. */
const dentroDe = (n: Nodo, nombre: string): Nodo[] =>
  n.hijos.flatMap((h) => {
    if (h.nombre === nombre) return [h];
    if (h.nombre === 'w:sdt') {
      const c = hijo(h, 'w:sdtContent');
      return c ? dentroDe(c, nombre) : [];
    }
    return h.nombre === 'w:customXml' ? dentroDe(h, nombre) : [];
  });

export const filasDe = (tbl: Nodo) => dentroDe(tbl, 'w:tr');
export const celdasDe = (tr: Nodo) => dentroDe(tr, 'w:tc');

// El orden de las condiciones en `w:cnfStyle w:val` («100000000000»).
const EN_EL_VALOR: Partial<Record<Condicion, number>> = {
  firstRow: 0,
  lastRow: 1,
  firstCol: 2,
  lastCol: 3,
};
const COMO_ATRIBUTO: Record<Condicion, string> = {
  firstRow: 'w:firstRow',
  lastRow: 'w:lastRow',
  firstCol: 'w:firstColumn',
  lastCol: 'w:lastColumn',
};
// Los bits de `w:tblLook w:val` (Word antiguo).
const EN_EL_LOOK: Record<Condicion, number> = {
  firstRow: 0x20,
  lastRow: 0x40,
  firstCol: 0x80,
  lastCol: 0x100,
};

const marcada = (xml: string, n: Nodo | undefined, c: Condicion): boolean => {
  const a = atributo(xml, n, COMO_ATRIBUTO[c]);
  if (a !== null) return SI.includes(a);
  const val = atributo(xml, n, 'w:val') ?? '';
  const i = EN_EL_VALOR[c];
  return i !== undefined && val[i] === '1';
};

/** En qué partes de su tabla está una celda: lo dice Word en `cnfStyle`
 *  al guardar; si no, se calcula con su lugar y lo que la tabla muestra
 *  (`tblLook`). */
export const condicionesDe = (
  xml: string,
  tbl: Nodo,
  tr: Nodo,
  tc: Nodo,
): Condicion[] => {
  const cnfs = [
    hijo(hijo(tr, 'w:trPr'), 'w:cnfStyle'),
    hijo(hijo(tc, 'w:tcPr'), 'w:cnfStyle'),
  ].filter((n): n is Nodo => n !== undefined);
  if (cnfs.length > 0) {
    return CONDICIONES.filter((c) => cnfs.some((n) => marcada(xml, n, c)));
  }
  const look = hijo(hijo(tbl, 'w:tblPr'), 'w:tblLook');
  const bits = parseInt(atributo(xml, look, 'w:val') ?? '0', 16) || 0;
  const muestra = (c: Condicion) => {
    const a = atributo(xml, look, COMO_ATRIBUTO[c]);
    return a !== null ? SI.includes(a) : (bits & EN_EL_LOOK[c]) > 0;
  };
  const filas = filasDe(tbl);
  const celdas = celdasDe(tr);
  const lugar: Record<Condicion, boolean> = {
    firstRow: filas[0] === tr,
    lastRow: filas[filas.length - 1] === tr,
    firstCol: celdas[0] === tc,
    lastCol: celdas[celdas.length - 1] === tc,
  };
  return CONDICIONES.filter((c) => lugar[c] && muestra(c));
};

/** La tabla, la fila y la celda más cercanas de un párrafo. */
export const enLaTabla = (ancestros: readonly Nodo[]) => {
  const ultimo = (nombre: string) =>
    [...ancestros].reverse().find((n) => n.nombre === nombre);
  const tc = ultimo('w:tc');
  const tr = ultimo('w:tr');
  const tbl = ultimo('w:tbl');
  return tc && tr && tbl ? { tbl, tr, tc } : null;
};

const estiloDeLaTabla = (xml: string, estilos: Estilos, tbl: Nodo) =>
  cadena(
    estilos,
    atributo(xml, hijo(hijo(tbl, 'w:tblPr'), 'w:tblStyle'), 'w:val') ??
      estilos.tablaPorDefecto,
  );

/** El formato que pone el estilo de la tabla donde está un párrafo. */
export const formatoDeLaTabla = (
  xml: string,
  estilos: Estilos,
  ancestros: readonly Nodo[],
): Formato => {
  const t = enLaTabla(ancestros);
  if (!t) return {};
  const condiciones = condicionesDe(xml, t.tbl, t.tr, t.tc);
  return estiloDeLaTabla(xml, estilos, t.tbl).reduce<Formato>(
    (f, e) =>
      condiciones.reduce(
        (g, c) => encima(g, e.condicional[c] ?? {}),
        encima(f, e.formato),
      ),
    {},
  );
};

/** El fondo que pone el estilo de la tabla a una celda; null si no pone. */
export const fondoDeLaTabla = (
  xml: string,
  estilos: Estilos,
  tbl: Nodo,
  tr: Nodo,
  tc: Nodo,
): string | null => {
  const condiciones = condicionesDe(xml, tbl, tr, tc);
  return estiloDeLaTabla(xml, estilos, tbl).reduce<string | null>(
    (f, e) =>
      condiciones.reduce<string | null>(
        (g, c) => e.fondoCondicional[c] ?? g,
        f,
      ),
    null,
  );
};
