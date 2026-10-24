// EL XML DE UN WORD, LEÍDO A MANO (decisión 78 del doc 17): un árbol con
// el lugar de cada elemento en el texto, para leerlo y reemplazar un pedazo
// sin tocar lo demás. Sin librerías, como el lector de `analisis/docx.ts`.
// Lo usan el editor de Word (`el-word-editable.ts`) y sus estilos
// (`estilos-del-word.ts`).

/** Un elemento del XML con su lugar en el texto. */
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

export const hijos = (n: Nodo | undefined, nombre: string): Nodo[] =>
  n?.hijos.filter((h) => h.nombre === nombre) ?? [];

/** Todos los de ese nombre, a cualquier profundidad, en orden. */
export const buscar = (n: Nodo | undefined, nombre: string): Nodo[] => {
  const encontrados: Nodo[] = [];
  const visitar = (x: Nodo) => {
    if (x.nombre === nombre) encontrados.push(x);
    x.hijos.forEach(visitar);
  };
  if (n) n.hijos.forEach(visitar);
  return encontrados;
};

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

export const numero = (
  xml: string,
  n: Nodo | undefined,
  nombre = 'w:val',
): number => {
  const v = Number(atributo(xml, n, nombre));
  return Number.isFinite(v) ? v : 0;
};
