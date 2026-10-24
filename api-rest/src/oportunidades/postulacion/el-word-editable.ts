import { createHash } from 'node:crypto';
import { archivoDelZip } from '../analisis/docx';

// EL WORD SE EDITA EN EVENTIA (decisión 78 del doc 17, 24-10). Felipe: "¿y
// si necesito editar algo que ya haya escrito la IA, para precisar la
// postulación?... un documento editable que pueda escribir y/o modificar en
// línea (lo básico: escribir, borrar, negrita, cursiva)". Se edita el MISMO
// Word del comprador, no una copia en otro formato: las bases piden sus
// formularios con su diseño, y un viaje de ida y vuelta por otro formato
// pierde logos, tablas y márgenes. Aquí se lee el texto, párrafo por
// párrafo y tabla por tabla, para la pantalla; `guardar-el-word.ts` escribe
// de vuelta solo los párrafos que cambiaron. Sin librerías, como el lector
// de `analisis/docx.ts`.

/** Un pedazo de un párrafo con su formato a la vista. `r`: de qué corrida
 *  del Word salió (su lugar en el párrafo), para conservar su letra, su
 *  tamaño y su color al guardar. */
export type Tramo = {
  r?: number;
  t: string;
  b: boolean;
  i: boolean;
  u: boolean;
  /** Tamaño de la letra, en puntos. */
  pt?: number;
};

export type Alineacion = 'centro' | 'derecha' | 'justificado';

export type Parrafo = {
  tipo: 'parrafo';
  /** Su lugar entre todos los párrafos del Word, en orden. */
  id: number;
  editable: boolean;
  /** Cómo se ve lo que se escribe fuera de sus pedazos (en un párrafo
   *  vacío, con el formato de su marca, como en Word). */
  formato: Omit<Tramo, 'r' | 't'>;
  /** Por qué no se edita aquí («tiene una imagen»). */
  motivo?: string;
  tramos: Tramo[];
  alineacion?: Alineacion;
  /** Sangría izquierda, en puntos. */
  sangria?: number;
  vineta?: boolean;
};

export type Celda = {
  bloques: Bloque[];
  columnas?: number;
  filas?: number;
  /** Ancho, en % de la tabla. */
  ancho?: number;
  /** Color de fondo, RRGGBB. */
  fondo?: string;
};

export type Tabla = { tipo: 'tabla'; filas: Celda[][] };

export type Bloque = Parrafo | Tabla;

export type WordParaEditar = {
  /** La huella del texto del Word: si cambió mientras se editaba, no se
   *  guarda encima. */
  version: string;
  bloques: Bloque[];
};

/** Un elemento del XML con su lugar en el texto, para leerlo y reemplazarlo
 *  sin tocar lo demás. */
export type Nodo = {
  nombre: string;
  inicio: number;
  finApertura: number;
  inicioCierre: number;
  fin: number;
  hijos: Nodo[];
};

// Una etiqueta: comentario, CDATA, declaración, o apertura y cierre (con
// los atributos entre comillas, que pueden traer «>»).
const ETIQUETA =
  /<(?:!--[\s\S]*?--|!\[CDATA\[[\s\S]*?\]\]|[?!][^>]*|(\/?)([A-Za-z_][\w.:-]*)((?:"[^"]*"|'[^']*'|[^'">])*?)(\/?))>/g;

/** El árbol del XML; null si está mal formado. */
export const arbolDelXml = (xml: string): Nodo | null => {
  const raiz: Nodo = {
    nombre: '',
    inicio: 0,
    finApertura: 0,
    inicioCierre: xml.length,
    fin: xml.length,
    hijos: [],
  };
  const pila: Nodo[] = [raiz];
  const etiqueta = new RegExp(ETIQUETA.source, 'g');
  for (let m = etiqueta.exec(xml); m; m = etiqueta.exec(xml)) {
    const [todo, cierra, nombre, , sola] = m;
    if (!nombre) continue;
    const arriba = pila[pila.length - 1];
    if (cierra) {
      if (arriba === raiz || arriba.nombre !== nombre) return null;
      arriba.inicioCierre = m.index;
      arriba.fin = m.index + todo.length;
      pila.pop();
      continue;
    }
    const fin = m.index + todo.length;
    const nodo: Nodo = {
      nombre,
      inicio: m.index,
      finApertura: fin,
      inicioCierre: fin,
      fin,
      hijos: [],
    };
    arriba.hijos.push(nodo);
    if (!sola) pila.push(nodo);
  }
  return pila.length === 1 ? raiz : null;
};

const ENTIDADES: Record<string, string> = {
  lt: '<',
  gt: '>',
  amp: '&',
  quot: '"',
  apos: "'",
};

export const decodificar = (s: string): string =>
  s.replace(/&(#x[0-9a-fA-F]+|#\d+|lt|gt|amp|quot|apos);/g, (e, c: string) => {
    if (c[0] !== '#') return ENTIDADES[c] ?? e;
    const n = c[1] === 'x' ? parseInt(c.slice(2), 16) : parseInt(c.slice(1));
    return Number.isFinite(n) && n <= 0x10ffff ? String.fromCodePoint(n) : e;
  });

export const hijo = (n: Nodo | undefined, nombre: string): Nodo | undefined =>
  n?.hijos.find((h) => h.nombre === nombre);

const hijos = (n: Nodo | undefined, nombre: string): Nodo[] =>
  n?.hijos.filter((h) => h.nombre === nombre) ?? [];

export const enXml = (xml: string, n: Nodo): string =>
  xml.slice(n.inicio, n.fin);

export const atributo = (
  xml: string,
  n: Nodo | undefined,
  nombre: string,
): string | null => {
  if (!n) return null;
  const m = new RegExp(`\\s${nombre}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`).exec(
    xml.slice(n.inicio, n.finApertura),
  );
  return m ? decodificar(m[1] ?? m[2] ?? '') : null;
};

const numero = (xml: string, n: Nodo | undefined, nombre = 'w:val') => {
  const v = Number(atributo(xml, n, nombre));
  return Number.isFinite(v) ? v : 0;
};

/** Lo que se ve de una corrida: negrita, cursiva, subrayado y tamaño.
 *  undefined = ese nivel no lo dice. */
export type Formato = { b?: boolean; i?: boolean; u?: boolean; pt?: number };

const NO = ['0', 'false', 'off'];

/** Una propiedad de sí o no: `<w:b/>` es sí, `<w:b w:val="0"/>` es no. */
const siONo = (xml: string, rPr: Nodo | undefined, nombre: string) => {
  const p = hijo(rPr, nombre);
  if (!p) return undefined;
  const v = atributo(xml, p, 'w:val');
  return v === null || !NO.includes(v.toLowerCase());
};

export const formatoDe = (xml: string, rPr: Nodo | undefined): Formato => {
  const u = hijo(rPr, 'w:u');
  const sz = numero(xml, hijo(rPr, 'w:sz'));
  return {
    b: siONo(xml, rPr, 'w:b'),
    i: siONo(xml, rPr, 'w:i'),
    u: u ? atributo(xml, u, 'w:val') !== 'none' : undefined,
    pt: sz > 0 ? sz / 2 : undefined,
  };
};

/** `arriba` manda sobre `abajo` en lo que dice. */
export const encima = (abajo: Formato, arriba: Formato): Formato => ({
  b: arriba.b ?? abajo.b,
  i: arriba.i ?? abajo.i,
  u: arriba.u ?? abajo.u,
  pt: arriba.pt ?? abajo.pt,
});

const alineacionDe = (
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

type Estilo = {
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
};

/** Un color de fondo RRGGBB; null si es «auto» o no es un color. */
const fondoDe = (xml: string, shd: Nodo | undefined): string | null => {
  const fill = atributo(xml, shd, 'w:fill');
  return fill && /^[0-9A-Fa-f]{6}$/.test(fill) ? fill.toUpperCase() : null;
};

/** Los estilos del Word (word/styles.xml): con ellos se sabe qué se ve en
 *  negrita aunque la corrida no lo diga (un título, la primera columna de
 *  una tabla con estilo). */
export const estilosDelWord = (docx: Buffer): Estilos => {
  const estilos: Estilos = { base: {}, porId: new Map() };
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
    const porDefecto = ['1', 'true', 'on'].includes(
      atributo(xml, s, 'w:default') ?? '',
    );
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
const cadena = (estilos: Estilos, id: string | undefined): Estilo[] => {
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

const formatoDelEstilo = (estilos: Estilos, id: string | undefined) =>
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

const filasDe = (tbl: Nodo) => dentroDe(tbl, 'w:tr');
const celdasDe = (tr: Nodo) => dentroDe(tr, 'w:tc');

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
  if (a !== null) return ['1', 'true', 'on'].includes(a);
  const val = atributo(xml, n, 'w:val') ?? '';
  const i = EN_EL_VALOR[c];
  return i !== undefined && val[i] === '1';
};

/** En qué partes de su tabla está una celda: lo dice Word en `cnfStyle`
 *  al guardar; si no, se calcula con su lugar y lo que la tabla muestra
 *  (`tblLook`). */
const condicionesDe = (
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
    return a !== null
      ? ['1', 'true', 'on'].includes(a)
      : (bits & EN_EL_LOOK[c]) > 0;
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
const enLaTabla = (ancestros: readonly Nodo[]) => {
  const ultimo = (nombre: string) =>
    [...ancestros].reverse().find((n) => n.nombre === nombre);
  const tc = ultimo('w:tc');
  const tr = ultimo('w:tr');
  const tbl = ultimo('w:tbl');
  return tc && tr && tbl ? { tbl, tr, tc } : null;
};

type Contexto = {
  xml: string;
  estilos: Estilos;
  ids: Map<Nodo, number>;
  editables: Map<number, ParrafoEditable>;
};

const estiloDeLaTabla = (ctx: Contexto, tbl: Nodo) =>
  cadena(
    ctx.estilos,
    atributo(ctx.xml, hijo(hijo(tbl, 'w:tblPr'), 'w:tblStyle'), 'w:val') ??
      ctx.estilos.tablaPorDefecto,
  );

const formatoDeLaTabla = (
  ctx: Contexto,
  ancestros: readonly Nodo[],
): Formato => {
  const t = enLaTabla(ancestros);
  if (!t) return {};
  const condiciones = condicionesDe(ctx.xml, t.tbl, t.tr, t.tc);
  return estiloDeLaTabla(ctx, t.tbl).reduce<Formato>(
    (f, e) =>
      condiciones.reduce(
        (g, c) => encima(g, e.condicional[c] ?? {}),
        encima(f, e.formato),
      ),
    {},
  );
};

// ——— Los párrafos ———

const EN_EL_PARRAFO = new Set([
  'w:pPr',
  'w:r',
  'w:proofErr',
  'w:bookmarkStart',
  'w:bookmarkEnd',
  'w:permStart',
  'w:permEnd',
]);

const EN_LA_CORRIDA = new Set([
  'w:rPr',
  'w:t',
  'w:tab',
  'w:br',
  'w:cr',
  'w:noBreakHyphen',
  'w:softHyphen',
  'w:lastRenderedPageBreak',
]);

const MOTIVOS: Record<string, string> = {
  'w:drawing': 'tiene una imagen',
  'w:pict': 'tiene una imagen',
  'w:object': 'tiene una imagen',
  'mc:AlternateContent': 'tiene una imagen',
  'w:fldChar': 'tiene un campo automático',
  'w:instrText': 'tiene un campo automático',
  'w:fldSimple': 'tiene un campo automático',
  'w:hyperlink': 'tiene un vínculo',
  'w:sdt': 'tiene un control de contenido',
  'w:ins': 'tiene cambios sin aceptar',
  'w:del': 'tiene cambios sin aceptar',
  'w:delText': 'tiene cambios sin aceptar',
  'w:moveFrom': 'tiene cambios sin aceptar',
  'w:moveTo': 'tiene cambios sin aceptar',
  'w:commentRangeStart': 'tiene comentarios',
  'w:commentRangeEnd': 'tiene comentarios',
  'w:commentReference': 'tiene comentarios',
  'w:footnoteReference': 'tiene una nota al pie',
  'w:endnoteReference': 'tiene una nota al pie',
  'm:oMath': 'tiene una fórmula',
  'm:oMathPara': 'tiene una fórmula',
};

const motivoDe = (n: Nodo) => MOTIVOS[n.nombre] ?? 'tiene un elemento especial';

/** Por qué un párrafo no se edita aquí; null = se edita. Se edita lo que es
 *  solo texto: si trae una imagen, un campo automático o un vínculo, se
 *  deja como está (reescribirlo los perdería). */
export const porQueNoSeEdita = (xml: string, p: Nodo): string | null => {
  for (const h of p.hijos) {
    if (!EN_EL_PARRAFO.has(h.nombre)) return motivoDe(h);
    if (h.nombre !== 'w:r') continue;
    for (const c of h.hijos) {
      if (!EN_LA_CORRIDA.has(c.nombre)) return motivoDe(c);
      const tipo = c.nombre === 'w:br' ? atributo(xml, c, 'w:type') : null;
      if (tipo === 'page' || tipo === 'column')
        return 'tiene un salto de página';
    }
  }
  return null;
};

/** El texto de una corrida: el salto de línea es «\n», el tabulador «\t» y
 *  el guion que no se corta, U+2011. */
export const textoDeLaCorrida = (xml: string, r: Nodo): string =>
  r.hijos
    .map((h) => {
      if (h.nombre === 'w:t') {
        return decodificar(xml.slice(h.finApertura, h.inicioCierre));
      }
      if (h.nombre === 'w:tab') return '\t';
      if (h.nombre === 'w:br' || h.nombre === 'w:cr') return '\n';
      return h.nombre === 'w:noBreakHyphen' ? '\u2011' : '';
    })
    .join('');

/** El texto de lo que no se edita, solo para mostrarlo: sin lo borrado con
 *  control de cambios ni el código de los campos. */
const textoParaVer = (xml: string, n: Nodo): string => {
  if (n.nombre === 'w:del' || n.nombre === 'w:instrText') return '';
  if (n.nombre === 'w:r') return textoDeLaCorrida(xml, n);
  return n.hijos.map((h) => textoParaVer(xml, h)).join('');
};

/** Un párrafo que se puede editar, con lo necesario para guardarlo. */
export type ParrafoEditable = {
  nodo: Nodo;
  /** El formato que trae el párrafo antes de sus corridas. */
  base: Formato;
  /** El de lo que se escribe en el párrafo vacío: el de su marca. */
  deLaMarca: Formato;
  corridas: Array<{ nodo: Nodo; formato: Formato; texto: string }>;
};

const aLaVista = (f: Formato): Omit<Tramo, 'r' | 't'> => ({
  b: Boolean(f.b),
  i: Boolean(f.i),
  u: Boolean(f.u),
  ...(f.pt ? { pt: f.pt } : {}),
});

const tramo = (t: string, f: Formato, r?: number): Tramo => ({
  ...(r === undefined ? {} : { r }),
  t,
  ...aLaVista(f),
});

const parrafo = (ctx: Contexto, p: Nodo, ancestros: Nodo[]): Parrafo => {
  const { xml, estilos } = ctx;
  const id = ctx.ids.get(p) ?? -1;
  const pPr = hijo(p, 'w:pPr');
  const estilo =
    atributo(xml, hijo(pPr, 'w:pStyle'), 'w:val') ?? estilos.parrafoPorDefecto;
  const base = [
    formatoDeLaTabla(ctx, ancestros),
    formatoDelEstilo(estilos, estilo),
  ].reduce(encima, estilos.base);
  const alineacion =
    alineacionDe(xml, pPr) ??
    cadena(estilos, estilo).reduceRight<Alineacion | undefined>(
      (a, e) => a ?? e.alineacion,
      undefined,
    );
  const ind = hijo(pPr, 'w:ind');
  const sangria =
    Math.max(numero(xml, ind, 'w:left'), numero(xml, ind, 'w:start')) / 20;
  const numId = atributo(xml, hijo(hijo(pPr, 'w:numPr'), 'w:numId'), 'w:val');
  const forma = {
    ...(alineacion ? { alineacion } : {}),
    ...(sangria > 0 ? { sangria } : {}),
    ...(numId && numId !== '0' ? { vineta: true } : {}),
  };
  const deLaMarca = encima(base, formatoDe(xml, hijo(pPr, 'w:rPr')));
  const motivo = porQueNoSeEdita(xml, p);
  if (motivo) {
    const t = textoParaVer(xml, p);
    return {
      tipo: 'parrafo',
      id,
      editable: false,
      formato: aLaVista(base),
      motivo,
      tramos: t ? [tramo(t, base)] : [],
      ...forma,
    };
  }
  const corridas = hijos(p, 'w:r').map((r) => {
    const rPr = hijo(r, 'w:rPr');
    const rStyle = atributo(xml, hijo(rPr, 'w:rStyle'), 'w:val') ?? undefined;
    return {
      nodo: r,
      formato: [formatoDelEstilo(estilos, rStyle), formatoDe(xml, rPr)].reduce(
        encima,
        base,
      ),
      texto: textoDeLaCorrida(xml, r),
    };
  });
  ctx.editables.set(id, { nodo: p, base, deLaMarca, corridas });
  const tramos = corridas.flatMap((c, r) =>
    c.texto ? [tramo(c.texto, c.formato, r)] : [],
  );
  return {
    tipo: 'parrafo',
    id,
    editable: true,
    formato: aLaVista(tramos.length > 0 ? base : deLaMarca),
    tramos,
    ...forma,
  };
};

const tabla = (ctx: Contexto, tbl: Nodo, ancestros: Nodo[]): Tabla => {
  const { xml } = ctx;
  const dentro = [...ancestros, tbl];
  const grilla = hijos(hijo(tbl, 'w:tblGrid'), 'w:gridCol').map((g) =>
    numero(xml, g, 'w:w'),
  );
  const total = grilla.reduce((a, b) => a + b, 0);
  const abiertas = new Map<number, Celda>();
  const filas = filasDe(tbl).map((tr) => {
    const fila: Celda[] = [];
    let columna = numero(xml, hijo(hijo(tr, 'w:trPr'), 'w:gridBefore'));
    for (const tc of celdasDe(tr)) {
      const tcPr = hijo(tc, 'w:tcPr');
      const columnas = Math.max(1, numero(xml, hijo(tcPr, 'w:gridSpan')));
      const vMerge = hijo(tcPr, 'w:vMerge');
      const sigue = vMerge && atributo(xml, vMerge, 'w:val') !== 'restart';
      const arriba = abiertas.get(columna);
      if (sigue && arriba) {
        arriba.filas = (arriba.filas ?? 1) + 1;
        columna += columnas;
        continue;
      }
      const ancho =
        total > 0
          ? grilla
              .slice(columna, columna + columnas)
              .reduce((a, b) => a + b, 0) / total
          : 0;
      const condiciones = condicionesDe(xml, tbl, tr, tc);
      const fondo =
        fondoDe(xml, hijo(tcPr, 'w:shd')) ??
        estiloDeLaTabla(ctx, tbl).reduce<string | null>(
          (f, e) =>
            condiciones.reduce<string | null>(
              (g, c) => e.fondoCondicional[c] ?? g,
              f,
            ),
          null,
        );
      const celda: Celda = {
        bloques: bloquesDe(ctx, tc, [...dentro, tr]),
        ...(columnas > 1 ? { columnas } : {}),
        ...(ancho > 0 ? { ancho: Math.round(ancho * 1000) / 10 } : {}),
        ...(fondo ? { fondo } : {}),
      };
      if (vMerge) abiertas.set(columna, celda);
      else abiertas.delete(columna);
      fila.push(celda);
      columna += columnas;
    }
    return fila;
  });
  return { tipo: 'tabla', filas };
};

const bloquesDe = (
  ctx: Contexto,
  contenedor: Nodo,
  ancestros: Nodo[],
): Bloque[] => {
  const dentro = [...ancestros, contenedor];
  return contenedor.hijos.flatMap((h): Bloque[] => {
    if (h.nombre === 'w:p') return [parrafo(ctx, h, dentro)];
    if (h.nombre === 'w:tbl') return [tabla(ctx, h, dentro)];
    if (h.nombre === 'w:sdt') {
      const c = hijo(h, 'w:sdtContent');
      return c ? bloquesDe(ctx, c, [...dentro, h]) : [];
    }
    return h.nombre === 'w:customXml' ? bloquesDe(ctx, h, dentro) : [];
  });
};

/** Todos los párrafos del Word en orden (también los de los cuadros de
 *  texto): el lugar de cada uno es su número. */
const numerar = (raiz: Nodo): Map<Nodo, number> => {
  const ids = new Map<Nodo, number>();
  const visitar = (n: Nodo) => {
    if (n.nombre === 'w:p') ids.set(n, ids.size);
    n.hijos.forEach(visitar);
  };
  visitar(raiz);
  return ids;
};

export const versionDe = (xml: string): string =>
  createHash('sha1').update(xml, 'utf8').digest('hex');

/** Lo leído, con lo que hace falta para guardar. */
export type LecturaDelWord = WordParaEditar & {
  xml: string;
  editables: Map<number, ParrafoEditable>;
};

/** El Word para editarlo; null si no es un Word que se pueda leer. */
export const leerElWord = (docx: Buffer): LecturaDelWord | null => {
  const datos = archivoDelZip(docx, 'word/document.xml');
  if (!datos) return null;
  const xml = datos.toString('utf8');
  const arbol = arbolDelXml(xml);
  const documento = hijo(arbol ?? undefined, 'w:document');
  const cuerpo = hijo(documento, 'w:body');
  if (!arbol || !documento || !cuerpo) return null;
  const ctx: Contexto = {
    xml,
    estilos: estilosDelWord(docx),
    ids: numerar(arbol),
    editables: new Map(),
  };
  return {
    version: versionDe(xml),
    bloques: bloquesDe(ctx, cuerpo, [arbol, documento]),
    xml,
    editables: ctx.editables,
  };
};

/** Lo que va a la pantalla: sin el XML. */
export const paraLaPantalla = ({
  version,
  bloques,
}: LecturaDelWord): WordParaEditar => ({ version, bloques });
