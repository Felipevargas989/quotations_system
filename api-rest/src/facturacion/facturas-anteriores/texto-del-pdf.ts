import { inflateSync } from 'node:zlib';
import { normalizarRut, rutEsValido } from '../../people/utils/rut';
import { LARGO_MAXIMO } from '../datos-del-receptor';

/**
 * EL CUADRO DEL CLIENTE DE UNA FACTURA DE FACTURACION.CL, LEÍDO DEL PDF
 * (doc 19 §9.29; la segunda fuente del RUT de §9.25).
 *
 * Sin IA y sin librerías: los PDF de facturacion.cl los arma JasperReports
 * con iText 2.0.1 (medido el 08-11 en la factura N° 379 de producción y en
 * la 9999839219 de prueba), con Helvetica en WinAnsiEncoding y cada texto
 * en su propio bloque `BT … ET`, con su posición absoluta (`1 0 0 1 x y Tm`)
 * y su `(texto) Tj`. Se leen los textos con su posición, y el cuadro del
 * cliente por sus etiquetas: «Señor(es)», «R.U.T.», «Giro», «Dirección»,
 * «Comuna» y «Ciudad», cada una con su «:» y su valor a la derecha, en la
 * misma fila.
 *
 * Lo que no calza con eso (otro formato, un PDF escaneado) devuelve nulo y
 * no se guarda nada: es mejor no llenar que llenar mal.
 */

/** Un texto del PDF y dónde está (en puntos, con y hacia arriba). */
export interface TextoDelPdf {
  x: number;
  y: number;
  texto: string;
}

/** Lo que se lee del cuadro del cliente. */
export interface ReceptorDeLaFactura {
  rut: string;
  razon_social: string;
  giro: string | null;
  direccion: string | null;
  comuna: string | null;
  ciudad: string | null;
  /** «Quillon, 01 de noviembre de 2026» → «2026-11-01». */
  fecha_emision: string | null;
}

/**
 * La razón social que trae el PDF de producción llega cortada a 50
 * caracteres (medido el 08-11 en la factura N° 379: «AGRUPACION DE
 * PROFESORES JUBILADOS DE LA COMUNA DE»). Con 50 o más, puede venir
 * incompleta.
 */
export const CORTE_DE_LA_RAZON_SOCIAL = 50;

// Lo que WinAnsiEncoding pone distinto de latin-1 (0x80 a 0x9F).
const WIN_ANSI: Record<number, string> = {
  0x80: '€',
  0x82: '‚',
  0x83: 'ƒ',
  0x84: '„',
  0x85: '…',
  0x86: '†',
  0x87: '‡',
  0x88: 'ˆ',
  0x89: '‰',
  0x8a: 'Š',
  0x8b: '‹',
  0x8c: 'Œ',
  0x8e: 'Ž',
  0x91: '‘',
  0x92: '’',
  0x93: '“',
  0x94: '”',
  0x95: '•',
  0x96: '–',
  0x97: '—',
  0x98: '˜',
  0x99: '™',
  0x9a: 'š',
  0x9b: '›',
  0x9c: 'œ',
  0x9e: 'ž',
  0x9f: 'Ÿ',
};

const deWinAnsi = (bytes: number[]) =>
  bytes.map((b) => WIN_ANSI[b] ?? String.fromCharCode(b)).join('');

/** Los contenidos de página del PDF (los flujos con texto), ya inflados. */
const flujosDeTexto = (pdf: Buffer): string[] => {
  const todo = pdf.toString('latin1');
  const flujos: string[] = [];
  const re = /<<((?:(?!>>\s*stream)[\s\S]){0,2000})>>\s*stream\r?\n/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(todo))) {
    const dic = m[1];
    const inicio = m.index + m[0].length;
    const fin = todo.indexOf('endstream', inicio);
    if (fin < 0) break;
    re.lastIndex = fin;
    // Las imágenes (el logo) no traen texto.
    if (/\/Subtype\s*\/Image|\/DCTDecode/.test(dic)) continue;
    let bytes: Buffer = Buffer.from(todo.slice(inicio, fin), 'latin1');
    if (/\/FlateDecode/.test(dic)) {
      try {
        bytes = inflateSync(bytes);
      } catch {
        continue;
      }
    } else if (/\/Filter/.test(dic)) continue;
    const texto = bytes.toString('latin1');
    if (/\bBT\b/.test(texto) && /T[jJ]|['"]/.test(texto)) flujos.push(texto);
  }
  return flujos;
};

type Ficha =
  | { tipo: 'numero'; valor: number }
  | { tipo: 'texto'; valor: string }
  | { tipo: 'nombre' }
  | { tipo: 'abre' }
  | { tipo: 'cierra' }
  | { tipo: 'op'; valor: string };

const ESCAPES: Record<string, number> = {
  n: 10,
  r: 13,
  t: 9,
  b: 8,
  f: 12,
  '(': 40,
  ')': 41,
  '\\': 92,
};

/** Las piezas de un contenido de página, en orden. */
function* fichas(c: string): Generator<Ficha> {
  let i = 0;
  const n = c.length;
  while (i < n) {
    const ch = c[i];
    if (/\s/.test(ch)) {
      i++;
    } else if (ch === '%') {
      while (i < n && c[i] !== '\n' && c[i] !== '\r') i++;
    } else if (ch === '(') {
      // Texto literal, con paréntesis anidados y escapes.
      const bytes: number[] = [];
      let nivel = 1;
      i++;
      while (i < n && nivel > 0) {
        const d = c[i];
        if (d === '\\') {
          const e = c[i + 1] ?? '';
          if (e in ESCAPES) {
            bytes.push(ESCAPES[e]);
            i += 2;
          } else if (/[0-7]/.test(e)) {
            let oct = '';
            let j = i + 1;
            while (j < n && oct.length < 3 && /[0-7]/.test(c[j])) oct += c[j++];
            bytes.push(parseInt(oct, 8) & 0xff);
            i = j;
          } else if (e === '\r' || e === '\n') {
            i += e === '\r' && c[i + 2] === '\n' ? 3 : 2;
          } else {
            i += 1;
          }
        } else {
          if (d === '(') nivel++;
          else if (d === ')') nivel--;
          if (nivel > 0) bytes.push(d.charCodeAt(0) & 0xff);
          i++;
        }
      }
      yield { tipo: 'texto', valor: deWinAnsi(bytes) };
    } else if (ch === '<' && c[i + 1] === '<') {
      i += 2;
      yield { tipo: 'op', valor: '<<' };
    } else if (ch === '>' && c[i + 1] === '>') {
      i += 2;
      yield { tipo: 'op', valor: '>>' };
    } else if (ch === '<') {
      // Texto en hexadecimal.
      const fin = c.indexOf('>', i);
      const hex = c
        .slice(i + 1, fin < 0 ? n : fin)
        .replace(/[^0-9a-fA-F]/g, '');
      const bytes: number[] = [];
      for (let k = 0; k < hex.length; k += 2)
        bytes.push(parseInt(hex[k] + (hex[k + 1] ?? '0'), 16));
      i = fin < 0 ? n : fin + 1;
      yield { tipo: 'texto', valor: deWinAnsi(bytes) };
    } else if (ch === '[') {
      i++;
      yield { tipo: 'abre' };
    } else if (ch === ']') {
      i++;
      yield { tipo: 'cierra' };
    } else if (ch === '/') {
      i++;
      while (i < n && !/[\s/[\]()<>{}%]/.test(c[i])) i++;
      yield { tipo: 'nombre' };
    } else if (/[0-9+\-.]/.test(ch)) {
      let j = i + 1;
      while (j < n && /[0-9.]/.test(c[j])) j++;
      const valor = Number(c.slice(i, j));
      i = j;
      yield Number.isFinite(valor)
        ? { tipo: 'numero', valor }
        : { tipo: 'op', valor: c.slice(i, j) };
    } else {
      let j = i;
      while (j < n && !/[\s/[\]()<>{}%]/.test(c[j])) j++;
      if (j === i) j = i + 1;
      yield { tipo: 'op', valor: c.slice(i, j) };
      i = j;
    }
  }
}

/**
 * Los textos del PDF con su posición. Sigue la matriz del texto (`Tm`,
 * `Td`, `TD`, `T*`, `TL`, `'` y `"`); no sigue la de la página (`cm`), que
 * en estos PDF es siempre la identidad alrededor de los textos.
 */
export const textosDelPdf = (pdf: Buffer): TextoDelPdf[] => {
  const textos: TextoDelPdf[] = [];
  for (const contenido of flujosDeTexto(pdf)) {
    const pila: (number | string)[] = [];
    let arreglo: string[] | null = null;
    let linea = { x: 0, y: 0 };
    let donde = { x: 0, y: 0 };
    let interlineado = 0;
    const poner = (texto: string) => {
      const limpio = texto.replace(/\s+/g, ' ').trim();
      if (limpio) textos.push({ x: donde.x, y: donde.y, texto: limpio });
    };
    const bajar = () => {
      linea = { x: linea.x, y: linea.y - interlineado };
      donde = { ...linea };
    };
    for (const f of fichas(contenido)) {
      if (f.tipo === 'numero') pila.push(f.valor);
      else if (f.tipo === 'texto') {
        if (arreglo) arreglo.push(f.valor);
        else pila.push(f.valor);
      } else if (f.tipo === 'abre') arreglo = [];
      else if (f.tipo === 'cierra') {
        pila.push(arreglo ? arreglo.join('') : '');
        arreglo = null;
      } else if (f.tipo === 'op') {
        const numeros = pila.filter((v): v is number => typeof v === 'number');
        const ultimoTexto = [...pila]
          .reverse()
          .find((v): v is string => typeof v === 'string');
        switch (f.valor) {
          case 'BT':
            linea = { x: 0, y: 0 };
            donde = { x: 0, y: 0 };
            break;
          case 'Tm':
            if (numeros.length >= 6) {
              linea = { x: numeros.at(-2)!, y: numeros.at(-1)! };
              donde = { ...linea };
            }
            break;
          case 'Td':
          case 'TD':
            if (numeros.length >= 2) {
              if (f.valor === 'TD') interlineado = -numeros.at(-1)!;
              linea = {
                x: linea.x + numeros.at(-2)!,
                y: linea.y + numeros.at(-1)!,
              };
              donde = { ...linea };
            }
            break;
          case 'TL':
            if (numeros.length) interlineado = numeros.at(-1)!;
            break;
          case 'T*':
            bajar();
            break;
          case 'Tj':
          case 'TJ':
            if (ultimoTexto !== undefined) poner(ultimoTexto);
            break;
          case "'":
          case '"':
            bajar();
            if (ultimoTexto !== undefined) poner(ultimoTexto);
            break;
        }
        pila.length = 0;
      }
    }
  }
  return textos;
};

/** Para comparar razones sociales: sin tildes, en mayúscula, sin puntos ni
 *  comas y con un solo espacio. */
export const paraComparar = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[.,]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/** Para comparar etiquetas: sin tildes, en minúscula y sin el «:» final. */
const normal = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\s*:$/, '');

type Campo =
  | 'razon_social'
  | 'rut'
  | 'giro'
  | 'direccion'
  | 'comuna'
  | 'ciudad';

const ETIQUETAS: Record<string, Campo> = {
  'senor(es)': 'razon_social',
  senores: 'razon_social',
  'r.u.t.': 'rut',
  'r.u.t': 'rut',
  rut: 'rut',
  giro: 'giro',
  direccion: 'direccion',
  comuna: 'comuna',
  ciudad: 'ciudad',
};

/** Misma fila: los textos de una fila se escriben a la misma altura. */
const MISMA_FILA = 2.5;
/** El cuadro del cliente cabe en esto bajo «Señor(es)». */
const ALTO_DEL_CUADRO = 120;

const MESES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

/** «Quillon, 01 de noviembre de 2026» → «2026-11-01». */
export const fechaDelPdf = (textos: TextoDelPdf[]): string | null => {
  for (const { texto } of textos) {
    const m = /,\s*(\d{1,2}) de ([a-záéíóú]+) de (\d{4})\s*$/i.exec(texto);
    if (!m) continue;
    const mes = MESES.indexOf(normal(m[2]));
    const dia = Number(m[1]);
    if (mes < 0 || dia < 1 || dia > 31) continue;
    return `${m[3]}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
  }
  return null;
};

const cortar = (texto: string | null, largo: number) =>
  texto ? texto.slice(0, largo).trim() || null : null;

/** El cuadro del cliente de la factura, o nulo si no se puede leer. */
export const receptorDeLaFactura = (
  textos: TextoDelPdf[],
): ReceptorDeLaFactura | null => {
  const etiquetas = textos
    .map((t) => ({ ...t, campo: ETIQUETAS[normal(t.texto)] }))
    .filter((t): t is TextoDelPdf & { campo: Campo } => !!t.campo);
  // El ancla: «Señor(es)», la de más arriba.
  const ancla = etiquetas
    .filter((e) => e.campo === 'razon_social')
    .sort((a, b) => b.y - a.y)[0];
  if (!ancla) return null;
  const dentro = (e: TextoDelPdf) =>
    e.y <= ancla.y + MISMA_FILA && e.y >= ancla.y - ALTO_DEL_CUADRO;
  // Cada etiqueta, la más cercana bajo el ancla; las de la columna de
  // «Señor(es)» tienen que estar alineadas con ella (la «Ciudad» va a la
  // derecha, en la fila de la «Comuna»).
  const elegidas = new Map<Campo, TextoDelPdf>([['razon_social', ancla]]);
  for (const campo of [
    'rut',
    'giro',
    'direccion',
    'comuna',
    'ciudad',
  ] as const) {
    const candidata = etiquetas
      .filter(
        (e) =>
          e.campo === campo &&
          dentro(e) &&
          (campo === 'ciudad' || Math.abs(e.x - ancla.x) < 3),
      )
      .sort((a, b) => b.y - a.y)[0];
    if (candidata) elegidas.set(campo, candidata);
  }
  const usadas = new Set([...elegidas.values()]);
  const valor = (etiqueta: TextoDelPdf): string | null => {
    // La fila, de izquierda a derecha, desde la etiqueta. El valor va
    // después de su «:» y termina en la próxima etiqueta de la fila, que es
    // la que va seguida de otro «:» (en el formato de prueba, «Teléfono»,
    // «Vencimiento» o «Vendedor»; en el de producción, «Ciudad»).
    const fila = textos
      .filter(
        (t) =>
          t !== etiqueta &&
          Math.abs(t.y - etiqueta.y) <= MISMA_FILA &&
          t.x > etiqueta.x,
      )
      .sort((a, b) => a.x - b.x);
    let i = 0;
    if (fila[0]?.texto === ':') i = 1;
    const partes: string[] = [];
    for (; i < fila.length; i++) {
      const t = fila[i];
      const otraEtiqueta =
        usadas.has(t) || /:$/.test(t.texto) || fila[i + 1]?.texto === ':';
      if (otraEtiqueta) break;
      partes.push(t.texto);
    }
    const junto = partes
      .join(' ')
      .replace(/^[\s:]+/, '')
      .replace(/\s+/g, ' ')
      .trim();
    return junto || null;
  };
  const de = (campo: Campo) => {
    const e = elegidas.get(campo);
    return e ? valor(e) : null;
  };
  // El dígito verificador tiene que calzar, y no puede ser uno reservado
  // (el 66.666.666-6 de las boletas, por ejemplo).
  const crudo = de('rut') ?? '';
  const rut = rutEsValido(crudo) ? normalizarRut(crudo) : null;
  const razonSocial = cortar(de('razon_social'), LARGO_MAXIMO.razon_social);
  if (!rut || !razonSocial) return null;
  return {
    rut,
    razon_social: razonSocial,
    giro: cortar(de('giro'), LARGO_MAXIMO.giro),
    direccion: cortar(de('direccion'), LARGO_MAXIMO.direccion),
    comuna: cortar(de('comuna'), LARGO_MAXIMO.comuna),
    ciudad: cortar(de('ciudad'), LARGO_MAXIMO.ciudad),
    fecha_emision: fechaDelPdf(textos),
  };
};

/** El PDF entero: el cuadro del cliente, o nulo. Nunca falla. */
export const leerFacturaAnterior = (
  pdf: Buffer,
): ReceptorDeLaFactura | null => {
  try {
    return receptorDeLaFactura(textosDelPdf(pdf));
  } catch {
    return null;
  }
};
