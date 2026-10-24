import { createHash } from 'node:crypto';
import { archivoDelZip } from '../analisis/docx';
import {
  type Alineacion,
  alineacionDe,
  cadena,
  celdasDe,
  encima,
  type Estilos,
  estilosDelWord,
  filasDe,
  fondoDe,
  fondoDeLaTabla,
  type Formato,
  formatoDe,
  formatoDeLaTabla,
  formatoDelEstilo,
} from './estilos-del-word';
import {
  arbolDelXml,
  atributo,
  buscar,
  decodificar,
  hijo,
  hijos,
  type Nodo,
  numero,
} from './xml-del-word';

// EL WORD SE EDITA EN EVENTIA (decisión 78 del doc 17, 24-10). Felipe: "¿y
// si necesito editar algo que ya haya escrito la IA, para precisar la
// postulación?... un documento editable que pueda escribir y/o modificar en
// línea (lo básico: escribir, borrar, negrita, cursiva)", y después: "el
// ver y editar debería ser el mismo". Se edita el MISMO Word del comprador
// (o el que la IA reescribió de su PDF, decisión 24), no una copia en otro
// formato: las bases piden sus formularios con su diseño, y un viaje de ida
// y vuelta por otro formato pierde logos, tablas y márgenes. Aquí se lee
// para la pantalla, que es a la vez la de ver y la de editar: el texto
// párrafo por párrafo y tabla por tabla, con su letra, tamaño y color, las
// imágenes, y el encabezado y el pie (que se ven pero no se editan).
// `guardar-el-word.ts` escribe de vuelta solo los párrafos que cambiaron.

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
  /** La letra («Calibri»). */
  f?: string;
  /** El color, RRGGBB. */
  c?: string;
};

export type { Alineacion };

/** Una imagen del documento, para verla: el logo, una insignia. */
export type Imagen = {
  src: string;
  /** En puntos. */
  ancho?: number;
  alto?: number;
};

export type Parrafo = {
  tipo: 'parrafo';
  /** Su lugar entre todos los párrafos de su parte del Word, en orden. */
  id: number;
  editable: boolean;
  /** Cómo se ve lo que se escribe fuera de sus pedazos (en un párrafo
   *  vacío, con el formato de su marca, como en Word). */
  formato: Omit<Tramo, 'r' | 't'>;
  /** Por qué no se edita aquí («tiene un vínculo»). */
  motivo?: string;
  tramos: Tramo[];
  imagenes?: Imagen[];
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
  /** Se ven, no se editan aquí. */
  encabezado?: Bloque[];
  pie?: Bloque[];
};

// ——— Las imágenes ———

const TIPOS_DE_IMAGEN: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  bmp: 'image/bmp',
  webp: 'image/webp',
};

/** Lo más que pesa una imagen que se muestra, y todas juntas: un logo pesa
 *  decenas de KB; lo demás (una foto enorme) no se muestra. */
const MAX_BYTES_POR_IMAGEN = 1_500_000;
const MAX_BYTES_DE_IMAGENES = 4_000_000;

const EMU_POR_PUNTO = 12700;

/** «media/image1.jpg» desde «word/» es «word/media/image1.jpg». */
const normalizar = (ruta: string): string => {
  const partes: string[] = [];
  for (const p of ruta.split('/')) {
    if (p === '..') partes.pop();
    else if (p && p !== '.') partes.push(p);
  }
  return partes.join('/');
};

/** A qué archivo del Word apunta cada `r:id` de una parte
 *  (`word/_rels/document.xml.rels`). */
const relacionesDe = (docx: Buffer, parte: string): Map<string, string> => {
  const corte = parte.lastIndexOf('/') + 1;
  const carpeta = parte.slice(0, corte);
  const rels = new Map<string, string>();
  const datos = archivoDelZip(
    docx,
    `${carpeta}_rels/${parte.slice(corte)}.rels`,
  );
  if (!datos) return rels;
  const xml = datos.toString('utf8');
  for (const r of buscar(arbolDelXml(xml) ?? undefined, 'Relationship')) {
    if (atributo(xml, r, 'TargetMode') === 'External') continue;
    const id = atributo(xml, r, 'Id');
    const destino = atributo(xml, r, 'Target');
    if (!id || !destino) continue;
    rels.set(
      id,
      normalizar(destino.startsWith('/') ? destino : carpeta + destino),
    );
  }
  return rels;
};

type Contexto = {
  xml: string;
  docx: Buffer;
  estilos: Estilos;
  rels: Map<string, string>;
  /** Lo que queda para mostrar imágenes, en bytes. */
  presupuesto: { bytes: number };
  ids: Map<Nodo, number>;
  editables: Map<number, ParrafoEditable>;
  /** En el encabezado y el pie: nada se edita, por esta razón. */
  soloVer?: string;
};

const laImagen = (ctx: Contexto, id: string | null): Imagen | null => {
  const ruta = id ? ctx.rels.get(id) : undefined;
  const tipo = ruta
    ? TIPOS_DE_IMAGEN[ruta.split('.').pop()?.toLowerCase() ?? '']
    : undefined;
  if (!ruta || !tipo) return null;
  const datos = archivoDelZip(ctx.docx, ruta);
  if (
    !datos ||
    datos.length > MAX_BYTES_POR_IMAGEN ||
    datos.length > ctx.presupuesto.bytes
  ) {
    return null;
  }
  ctx.presupuesto.bytes -= datos.length;
  return { src: `data:${tipo};base64,${datos.toString('base64')}` };
};

/** Las imágenes de un párrafo, con su tamaño. Las de Word nuevo
 *  (`w:drawing`) y, si no hay, las antiguas (`v:imagedata`): un Word trae
 *  las dos versiones de la misma imagen para los programas viejos. */
const imagenesDe = (ctx: Contexto, p: Nodo): Imagen[] => {
  const nuevas = buscar(p, 'w:drawing').flatMap((d) => {
    const img = laImagen(
      ctx,
      atributo(ctx.xml, buscar(d, 'a:blip')[0], 'r:embed'),
    );
    if (!img) return [];
    const extent = buscar(d, 'wp:extent')[0];
    const cx = numero(ctx.xml, extent, 'cx');
    const cy = numero(ctx.xml, extent, 'cy');
    return [
      {
        ...img,
        ...(cx > 0 ? { ancho: Math.round(cx / EMU_POR_PUNTO) } : {}),
        ...(cy > 0 ? { alto: Math.round(cy / EMU_POR_PUNTO) } : {}),
      },
    ];
  });
  if (nuevas.length > 0) return nuevas;
  return buscar(p, 'v:imagedata').flatMap((v) => {
    const img = laImagen(ctx, atributo(ctx.xml, v, 'r:id'));
    return img ? [img] : [];
  });
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
 *  texto (con sus saltos de línea y de página): si trae una imagen, un
 *  campo automático o un vínculo, se deja como está (reescribirlo los
 *  perdería). */
export const porQueNoSeEdita = (xml: string, p: Nodo): string | null => {
  for (const h of p.hijos) {
    if (!EN_EL_PARRAFO.has(h.nombre)) return motivoDe(h);
    if (h.nombre !== 'w:r') continue;
    for (const c of h.hijos) {
      if (!EN_LA_CORRIDA.has(c.nombre)) return motivoDe(c);
      if (c.nombre === 'w:br' && atributo(xml, c, 'w:type') === 'column') {
        return 'tiene un salto de columna';
      }
    }
  }
  return null;
};

/** El texto de una corrida: el salto de línea es «\n», el de página «\f»,
 *  el tabulador «\t» y el guion que no se corta, U+2011. */
export const textoDeLaCorrida = (xml: string, r: Nodo): string =>
  r.hijos
    .map((h) => {
      if (h.nombre === 'w:t') {
        return decodificar(xml.slice(h.finApertura, h.inicioCierre));
      }
      if (h.nombre === 'w:tab') return '\t';
      if (h.nombre === 'w:br') {
        return atributo(xml, h, 'w:type') === 'page' ? '\f' : '\n';
      }
      if (h.nombre === 'w:cr') return '\n';
      return h.nombre === 'w:noBreakHyphen' ? '‑' : '';
    })
    .join('');

/** Las corridas de lo que no se edita, solo para mostrarlas: también las
 *  de un vínculo o un control de contenido; sin lo borrado con control de
 *  cambios ni lo de adentro de una imagen. */
const corridasParaVer = (n: Nodo): Nodo[] =>
  n.hijos.flatMap((h) => {
    if (h.nombre === 'w:r') return [h];
    if (
      ['w:del', 'w:moveFrom', 'w:drawing', 'w:pict', 'w:pPr'].includes(h.nombre)
    ) {
      return [];
    }
    return corridasParaVer(h);
  });

/** Un párrafo que se puede editar, con lo necesario para guardarlo. */
export type ParrafoEditable = {
  nodo: Nodo;
  /** El formato que trae el párrafo antes de sus corridas. */
  base: Formato;
  /** El de lo que se escribe en el párrafo vacío: el de su marca. */
  deLaMarca: Formato;
  corridas: Array<{ nodo: Nodo; formato: Formato; texto: string }>;
};

/** El formato como se ve: la letra del tema, con su nombre. */
const aLaVista = (ctx: Contexto, f: Formato): Omit<Tramo, 'r' | 't'> => {
  const letra =
    f.letra === '@menor'
      ? ctx.estilos.temas.menor
      : f.letra === '@mayor'
        ? ctx.estilos.temas.mayor
        : f.letra;
  return {
    b: Boolean(f.b),
    i: Boolean(f.i),
    u: Boolean(f.u),
    ...(f.pt ? { pt: f.pt } : {}),
    ...(letra ? { f: letra } : {}),
    ...(f.color ? { c: f.color } : {}),
  };
};

const tramo = (ctx: Contexto, t: string, f: Formato, r?: number): Tramo => ({
  ...(r === undefined ? {} : { r }),
  t,
  ...aLaVista(ctx, f),
});

/** El formato de una corrida: el del párrafo, el de su estilo y el suyo. */
const formatoDeLaCorrida = (ctx: Contexto, base: Formato, r: Nodo) => {
  const rPr = hijo(r, 'w:rPr');
  const rStyle = atributo(ctx.xml, hijo(rPr, 'w:rStyle'), 'w:val');
  return [
    formatoDelEstilo(ctx.estilos, rStyle ?? undefined),
    formatoDe(ctx.xml, rPr),
  ].reduce(encima, base);
};

const parrafo = (ctx: Contexto, p: Nodo, ancestros: Nodo[]): Parrafo => {
  const { xml, estilos } = ctx;
  const id = ctx.ids.get(p) ?? -1;
  const pPr = hijo(p, 'w:pPr');
  const estilo =
    atributo(xml, hijo(pPr, 'w:pStyle'), 'w:val') ?? estilos.parrafoPorDefecto;
  const base = [
    formatoDeLaTabla(xml, estilos, ancestros),
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
  const motivo = ctx.soloVer ?? porQueNoSeEdita(xml, p);
  if (motivo) {
    const imagenes = imagenesDe(ctx, p);
    const tramos = corridasParaVer(p).flatMap((r) => {
      const t = textoDeLaCorrida(xml, r);
      return t ? [tramo(ctx, t, formatoDeLaCorrida(ctx, base, r))] : [];
    });
    return {
      tipo: 'parrafo',
      id,
      editable: false,
      formato: aLaVista(ctx, tramos.length > 0 ? base : deLaMarca),
      motivo,
      tramos,
      ...(imagenes.length > 0 ? { imagenes } : {}),
      ...forma,
    };
  }
  const corridas = hijos(p, 'w:r').map((r) => ({
    nodo: r,
    formato: formatoDeLaCorrida(ctx, base, r),
    texto: textoDeLaCorrida(xml, r),
  }));
  ctx.editables.set(id, { nodo: p, base, deLaMarca, corridas });
  const tramos = corridas.flatMap((c, r) =>
    c.texto ? [tramo(ctx, c.texto, c.formato, r)] : [],
  );
  return {
    tipo: 'parrafo',
    id,
    editable: true,
    formato: aLaVista(ctx, tramos.length > 0 ? base : deLaMarca),
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
      const fondo =
        fondoDe(xml, hijo(tcPr, 'w:shd')) ??
        fondoDeLaTabla(xml, ctx.estilos, tbl, tr, tc);
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

/** Todos los párrafos de una parte del Word en orden (también los de los
 *  cuadros de texto): el lugar de cada uno es su número. */
const numerar = (raiz: Nodo): Map<Nodo, number> => {
  const ids = new Map<Nodo, number>();
  const visitar = (n: Nodo) => {
    if (n.nombre === 'w:p') ids.set(n, ids.size);
    n.hijos.forEach(visitar);
  };
  visitar(raiz);
  return ids;
};

/** El encabezado o el pie, solo para verlo: el de todas las páginas o, si
 *  no hay, el de la primera (el de la última sección del documento). */
const encabezadoOPie = (
  documento: Contexto,
  cuerpo: Nodo,
  cual: 'header' | 'footer',
): Bloque[] => {
  const sectPr = [...cuerpo.hijos]
    .reverse()
    .find((h) => h.nombre === 'w:sectPr');
  const refs = hijos(sectPr, `w:${cual}Reference`);
  const tipo = (r: Nodo) => atributo(documento.xml, r, 'w:type');
  const ref =
    refs.find((r) => tipo(r) === 'default') ??
    refs.find((r) => tipo(r) === 'first');
  const parte = documento.rels.get(atributo(documento.xml, ref, 'r:id') ?? '');
  const datos = parte ? archivoDelZip(documento.docx, parte) : null;
  if (!parte || !datos) return [];
  const xml = datos.toString('utf8');
  const arbol = arbolDelXml(xml);
  const raiz = hijo(arbol ?? undefined, cual === 'header' ? 'w:hdr' : 'w:ftr');
  if (!arbol || !raiz) return [];
  return bloquesDe(
    {
      ...documento,
      xml,
      rels: relacionesDe(documento.docx, parte),
      ids: numerar(arbol),
      editables: new Map(),
      soloVer:
        cual === 'header'
          ? 'está en el encabezado'
          : 'está en el pie de página',
    },
    raiz,
    [arbol],
  );
};

export const versionDe = (xml: string): string =>
  createHash('sha1').update(xml, 'utf8').digest('hex');

/** Lo leído, con lo que hace falta para guardar. */
export type LecturaDelWord = WordParaEditar & {
  xml: string;
  editables: Map<number, ParrafoEditable>;
};

/** El Word para verlo y editarlo; null si no es un Word que se pueda
 *  leer. */
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
    docx,
    estilos: estilosDelWord(docx),
    rels: relacionesDe(docx, 'word/document.xml'),
    presupuesto: { bytes: MAX_BYTES_DE_IMAGENES },
    ids: numerar(arbol),
    editables: new Map(),
  };
  const encabezado = encabezadoOPie(ctx, cuerpo, 'header');
  const bloques = bloquesDe(ctx, cuerpo, [arbol, documento]);
  const pie = encabezadoOPie(ctx, cuerpo, 'footer');
  return {
    version: versionDe(xml),
    bloques,
    ...(encabezado.length > 0 ? { encabezado } : {}),
    ...(pie.length > 0 ? { pie } : {}),
    xml,
    editables: ctx.editables,
  };
};

/** Lo que va a la pantalla: sin el XML. */
export const paraLaPantalla = ({
  version,
  bloques,
  encabezado,
  pie,
}: LecturaDelWord): WordParaEditar => ({
  version,
  bloques,
  ...(encabezado ? { encabezado } : {}),
  ...(pie ? { pie } : {}),
});
