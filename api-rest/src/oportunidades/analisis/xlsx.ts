import { archivoDelZip, nombresDelZip } from './docx';

// EL TEXTO DE UN EXCEL (.xlsx), para la IA (decisión 126 del doc 17,
// 11-11-2026). La 2416-342-COT26 (Día de las Personas con Discapacidad,
// Concepción) traía como única base un Excel y el análisis respondió
// «Ninguno de los archivos se puede leer»: la IA quedó sin ver que pedían
// un recinto en la comuna de Concepción. Un .xlsx es un ZIP, como el Word:
// el libro en xl/workbook.xml, cada hoja en xl/worksheets/ y los textos en
// xl/sharedStrings.xml. Se abre con el mismo lector de `docx.ts`, sin
// librerías. Cada fila va en una línea, con la celda delante de su valor
// («A21: ID | B21: DETALLE»): así la IA sabe qué columna es cada dato. Las
// fechas salen como fecha (dd-mm-aaaa) y los porcentajes con su %. El .xls
// antiguo (binario) no se lee.

/** Tope del texto de un Excel: una lista de precios de miles de filas no
 *  puede llenar el pedido. Son unos 55.000 tokens. */
export const MAX_CARACTERES_DEL_EXCEL = 200_000;

export const AVISO_DE_CORTE = `[…el Excel sigue: se cortó aquí para no pasar de ${MAX_CARACTERES_DEL_EXCEL.toLocaleString('es-CL')} caracteres]`;

const ENTIDADES: Record<string, string> = {
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  amp: '&',
};

const caracter = (codigo: number, siNo: string): string =>
  Number.isInteger(codigo) && codigo >= 0 && codigo <= 0x10ffff
    ? String.fromCodePoint(codigo)
    : siNo;

/** El texto de un nodo del XML: sus entidades y los `_xHHHH_` con que
 *  Excel guarda lo que no se puede escribir (el salto de línea de
 *  Windows, `_x000D_`). */
const textoDelXml = (xml: string): string =>
  xml
    .replace(/&(#x[0-9a-f]+|#\d+|lt|gt|quot|apos|amp);/gi, (e, c: string) => {
      if (c[0] !== '#') return ENTIDADES[c.toLowerCase()] ?? e;
      const hexadecimal = c[1] === 'x' || c[1] === 'X';
      return caracter(
        parseInt(c.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10),
        e,
      );
    })
    .replace(/_x([0-9a-f]{4})_/gi, (e, h: string) =>
      caracter(parseInt(h, 16), e),
    )
    .replace(/\r\n?/g, '\n');

/** Hay programas que escriben `<x:row>` en vez de `<row>`: se quita el
 *  prefijo de cada etiqueta (los atributos, como `r:id`, quedan igual). */
const sinPrefijos = (xml: string): string =>
  xml.replace(/<(\/?)[\w.-]+:(?=[\w.-]+[\s/>])/g, '<$1');

const leerXml = (zip: Buffer, ruta: string): string | null => {
  const datos = archivoDelZip(zip, ruta);
  return datos ? sinPrefijos(datos.toString('utf8')) : null;
};

const atributo = (atributos: string, nombre: string): string | null => {
  const m = new RegExp(`(?:^|\\s)${nombre}="([^"]*)"`).exec(atributos);
  return m ? textoDelXml(m[1]) : null;
};

/** Lo que dicen las corridas de un texto (`<t>`), sin la fonética
 *  (`<rPh>`, la lectura de los caracteres japoneses). */
const textoDeCorridas = (xml: string): string =>
  [
    ...xml
      .replace(/<rPh\b[\s\S]*?<\/rPh>/g, '')
      .matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g),
  ]
    .map((m) => textoDelXml(m[1]))
    .join('');

type Relacion = { id: string; tipo: string; destino: string };

const relacionesDe = (xml: string | null): Relacion[] =>
  [...(xml ?? '').matchAll(/<Relationship\b([^>]*?)\/?>/g)].map((m) => ({
    id: atributo(m[1], 'Id') ?? '',
    tipo: atributo(m[1], 'Type') ?? '',
    destino: atributo(m[1], 'Target') ?? '',
  }));

/** La ruta dentro del ZIP de lo que nombra el libro: absoluta («/xl/…») o
 *  relativa a xl/. */
const dentroDeXl = (destino: string): string =>
  destino.startsWith('/')
    ? destino.slice(1)
    : `xl/${destino.replace(/^\.\//, '')}`;

type Hoja = { nombre: string; ruta: string; oculta: boolean };

const porNumero = (a: string, b: string): number =>
  Number(/(\d+)\.xml$/.exec(a)?.[1] ?? 0) -
  Number(/(\d+)\.xml$/.exec(b)?.[1] ?? 0);

/** Las hojas, en el orden del libro. Las de gráficos no tienen celdas y no
 *  van. Si el libro no dice cuáles son, las que haya en xl/worksheets/. */
const hojasDelLibro = (
  libro: string,
  relaciones: Relacion[],
  zip: Buffer,
): Hoja[] => {
  const hojas: Hoja[] = [];
  for (const m of libro.matchAll(/<sheet\b([^>]*?)\/?>/g)) {
    const id = /(?:^|\s)[\w.-]+:id="([^"]*)"/.exec(m[1])?.[1];
    const relacion = relaciones.find((r) => r.id === id);
    if (!relacion || !relacion.tipo.endsWith('/worksheet')) continue;
    hojas.push({
      nombre: atributo(m[1], 'name') ?? `Hoja ${hojas.length + 1}`,
      ruta: dentroDeXl(relacion.destino),
      oculta: /(?:^|\s)state="(hidden|veryHidden)"/.test(m[1]),
    });
  }
  if (hojas.length > 0) return hojas;
  return (nombresDelZip(zip) ?? [])
    .filter((n) => /^xl\/worksheets\/[^/]+\.xml$/.test(n))
    .sort(porNumero)
    .map((ruta, i) => ({ nombre: `Hoja ${i + 1}`, ruta, oculta: false }));
};

/** Cómo se muestra un número según su formato de celda. */
type Formato = 'fecha' | 'fechaHora' | 'porcentaje' | null;

/** Los formatos que trae Excel de fábrica: 14 a 17, fechas; 18 a 22 y 45 a
 *  47, con hora; 9 y 10, porcentajes. */
const FORMATOS_DE_FABRICA: Readonly<Record<number, Formato>> = {
  9: 'porcentaje',
  10: 'porcentaje',
  14: 'fecha',
  15: 'fecha',
  16: 'fecha',
  17: 'fecha',
  18: 'fechaHora',
  19: 'fechaHora',
  20: 'fechaHora',
  21: 'fechaHora',
  22: 'fechaHora',
  45: 'fechaHora',
  46: 'fechaHora',
  47: 'fechaHora',
};

/** Un formato propio («dd/mm/yyyy», «0,0%»): manda su primera sección
 *  (la de los positivos), sin lo que va entre comillas, lo escapado, el
 *  relleno ni los corchetes de color o de idioma (`[h]`, horas
 *  acumuladas, sí cuenta). */
export const claseDeFormato = (codigo: string): Formato => {
  const limpio = codigo
    .replace(/"[^"]*"/g, '')
    .replace(/[\\_*]./g, '')
    .replace(/\[[^\]]*\]/g, (b) => (/^\[(h+|m+|s+)\]$/i.test(b) ? 'h' : ''))
    .split(';')[0];
  if (limpio.includes('%')) return 'porcentaje';
  const hora = /[hs]/i.test(limpio);
  const fecha = /[dy]/i.test(limpio) || (!hora && /m/i.test(limpio));
  if (hora) return 'fechaHora';
  return fecha ? 'fecha' : null;
};

/** El formato de cada estilo de celda (`s` de la celda = posición en
 *  `cellXfs`). */
const formatosDeCelda = (styles: string | null): Formato[] => {
  if (!styles) return [];
  const propios = new Map<number, string>();
  for (const m of styles.matchAll(/<numFmt\b([^>]*?)\/?>/g)) {
    const codigo = atributo(m[1], 'formatCode');
    if (codigo !== null)
      propios.set(Number(atributo(m[1], 'numFmtId')), codigo);
  }
  const celdas =
    /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(styles)?.[1] ?? '';
  return [...celdas.matchAll(/<xf\b([^>]*?)\/?>/g)].map((m) => {
    const id = Number(atributo(m[1], 'numFmtId') ?? 0);
    const propio = propios.get(id);
    return propio !== undefined
      ? claseDeFormato(propio)
      : (FORMATOS_DE_FABRICA[id] ?? null);
  });
};

const dos = (n: number) => String(n).padStart(2, '0');

/** La fecha de un número de Excel, en dd-mm-aaaa (y hh:mm si el formato
 *  tiene hora). Excel cuenta días desde 1900, con el 29-02-1900 que no
 *  existió; un libro de Mac antiguo, desde 1904. */
export const fechaDeExcel = (
  serial: number,
  de1904: boolean,
  conHora: boolean,
): string | null => {
  if (!Number.isFinite(serial) || serial < 0 || serial > 2_958_465) return null;
  const base = de1904
    ? Date.UTC(1904, 0, 1)
    : serial < 60
      ? Date.UTC(1899, 11, 31)
      : Date.UTC(1899, 11, 30);
  const f = new Date(base + Math.round(serial * 1440) * 60_000);
  const hora = `${dos(f.getUTCHours())}:${dos(f.getUTCMinutes())}`;
  if (conHora && serial < 1) return hora;
  const dia = `${dos(f.getUTCDate())}-${dos(f.getUTCMonth() + 1)}-${f.getUTCFullYear()}`;
  return conHora && !Number.isInteger(serial) ? `${dia} ${hora}` : dia;
};

/** Un número como lo escribe una persona: sin la cola de decimales de la
 *  coma flotante (0,30000000000000004). */
const numero = (n: number): string => String(parseFloat(n.toPrecision(15)));

type Libro = {
  compartidos: string[];
  formatos: Formato[];
  de1904: boolean;
};

/** Lo que muestra una celda, o null si no muestra nada. */
const valorDeCelda = (
  atributos: string,
  dentro: string,
  libro: Libro,
): string | null => {
  const tipo = atributo(atributos, 't') ?? 'n';
  if (tipo === 'inlineStr') {
    return textoDeCorridas(
      /<is\b[^>]*>([\s\S]*?)<\/is>/.exec(dentro)?.[1] ?? '',
    );
  }
  const v = /<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/.exec(dentro)?.[1];
  if (v === undefined) {
    // Una fórmula que nadie calculó: va la fórmula, que algo dice.
    const formula = /<f(?:\s[^>]*)?>([\s\S]*?)<\/f>/.exec(dentro)?.[1];
    return formula ? `=${textoDelXml(formula)}` : null;
  }
  if (tipo === 's') return libro.compartidos[Number(v)] ?? null;
  if (tipo === 'b') return v.trim() === '1' ? 'VERDADERO' : 'FALSO';
  if (tipo === 'd') {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
    return m ? `${m[3]}-${m[2]}-${m[1]}` : textoDelXml(v);
  }
  if (tipo !== 'n') return textoDelXml(v); // 'str' (fórmula de texto) y 'e' (#N/A)
  const n = Number(v);
  if (!Number.isFinite(n)) return textoDelXml(v);
  const formato = libro.formatos[Number(atributo(atributos, 's') ?? 0)] ?? null;
  if (formato === 'porcentaje') return `${numero(n * 100)}%`;
  if (formato === 'fecha' || formato === 'fechaHora') {
    return fechaDeExcel(n, libro.de1904, formato === 'fechaHora') ?? numero(n);
  }
  return numero(n);
};

const letrasDe = (columna: number): string => {
  let letras = '';
  for (let n = columna; n > 0; n = Math.floor((n - 1) / 26)) {
    letras = String.fromCharCode(65 + ((n - 1) % 26)) + letras;
  }
  return letras;
};

const columnaDe = (letras: string): number =>
  [...letras].reduce((n, l) => n * 26 + l.charCodeAt(0) - 64, 0);

/** Las filas con algo escrito, una por línea, hasta el tope que queda. */
const filasDeLaHoja = (
  hoja: string,
  libro: Libro,
  tope: number,
): { lineas: string[]; cortada: boolean } => {
  const datos =
    /<sheetData\b[^>]*>([\s\S]*?)<\/sheetData>/.exec(hoja)?.[1] ?? '';
  const lineas: string[] = [];
  let usado = 0;
  let fila = 0;
  for (const f of datos.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    fila = Number(atributo(f[1], 'r')) || fila + 1;
    let columna = 0;
    const celdas: string[] = [];
    for (const c of (f[2] ?? '').matchAll(
      /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g,
    )) {
      const ref = /^([A-Z]+)\d+$/.exec(atributo(c[1], 'r') ?? '');
      columna = ref ? columnaDe(ref[1]) : columna + 1;
      const valor = valorDeCelda(c[1], c[2] ?? '', libro)?.trim();
      if (valor) celdas.push(`${letrasDe(columna)}${fila}: ${valor}`);
    }
    if (celdas.length === 0) continue;
    const linea = celdas.join(' | ');
    if (usado + linea.length + 1 > tope) return { lineas, cortada: true };
    usado += linea.length + 1;
    lineas.push(linea);
  }
  return { lineas, cortada: false };
};

/** El texto de un Excel: cada hoja con su nombre y, debajo, una línea por
 *  fila con lo que dice cada celda. null si no es un Excel que se pueda
 *  abrir. */
export const textoDeXlsx = (xlsx: Buffer): string | null => {
  const libro = leerXml(xlsx, 'xl/workbook.xml');
  if (!libro) return null;
  const relaciones = relacionesDe(leerXml(xlsx, 'xl/_rels/workbook.xml.rels'));
  const deTipo = (tipo: string, siNo: string): string => {
    const r = relaciones.find((x) => x.tipo.endsWith(`/${tipo}`));
    return r ? dentroDeXl(r.destino) : siNo;
  };
  const compartidos = leerXml(
    xlsx,
    deTipo('sharedStrings', 'xl/sharedStrings.xml'),
  );
  const datos: Libro = {
    compartidos: [
      ...(compartidos ?? '').matchAll(/<si\b[^>]*?(?:\/>|>([\s\S]*?)<\/si>)/g),
    ].map((m) => textoDeCorridas(m[1] ?? '')),
    formatos: formatosDeCelda(leerXml(xlsx, deTipo('styles', 'xl/styles.xml'))),
    de1904: /<workbookPr\b[^>]*\bdate1904="(1|true)"/.test(libro),
  };
  const hojas = hojasDelLibro(libro, relaciones, xlsx);
  if (hojas.length === 0) return null;
  const partes: string[] = [];
  let queda = MAX_CARACTERES_DEL_EXCEL;
  for (const hoja of hojas) {
    const titulo = `Hoja «${hoja.nombre}»${hoja.oculta ? ' (oculta)' : ''}`;
    const xml = leerXml(xlsx, hoja.ruta);
    if (!xml) {
      partes.push(`${titulo}: no se pudo abrir.`);
      continue;
    }
    const { lineas, cortada } = filasDeLaHoja(xml, datos, queda);
    if (lineas.length > 0) partes.push(`${titulo}\n${lineas.join('\n')}`);
    else if (!cortada) partes.push(`${titulo}: vacía.`);
    queda -= lineas.reduce((suma, l) => suma + l.length + 1, 0);
    if (cortada) {
      partes.push(AVISO_DE_CORTE);
      break;
    }
  }
  return partes.join('\n\n');
};
