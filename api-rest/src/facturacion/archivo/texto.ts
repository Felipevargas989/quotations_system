/**
 * EL TEXTO Y LOS NÚMEROS DEL ARCHIVO DE FACTURACION.CL (doc 19, L7)
 *
 * El archivo plano separa los campos con «;» y cada dato va en su línea,
 * así que ni el «;» ni un salto de línea pueden ir dentro de un texto. Cada
 * campo tiene su largo máximo (archivoplano.php y
 * archivoboletaelectronica.php). Lo que se corta queda anotado en los
 * avisos, para que la vista previa lo muestre: nada se corta a escondidas
 * (doc 19 §9.10).
 */

/** Un dato de texto que entra al archivo. */
export type Dato = string | number | null | undefined;

/** Los signos de la escritura de todos los días que tienen su equivalente
 *  en ISO-8859-1. */
const normalizado = (valor: Dato): string =>
  String(valor ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/;/g, ',')
    .replace(/[“”„]/g, '"')
    .replace(/[‘’‚]/g, "'")
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/•/g, '-')
    .replace(/€/g, 'EUR');

/** Lo que queda fuera de ISO-8859-1 (un emoji, otro alfabeto): el archivo
 *  va en latin-1 (L23) y facturacion.cl no lo leería. */
export const fueraDelArchivo = (valor: Dato): string[] => [
  ...new Set(
    Array.from(normalizado(valor)).filter(
      (c) => (c.codePointAt(0) ?? 0) > 0xff,
    ),
  ),
];

/** Limpia un texto para el archivo, sin cortarlo. */
export const textoLimpio = (valor: Dato): string =>
  normalizado(valor)
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[^\x20-\xff]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Junta los avisos de lo que se cortó mientras se arma un documento. Cada
 * campo se limpia y, si no cabe, se corta y se avisa con su nombre.
 */
export class Avisos {
  readonly lista: string[] = [];

  campo(nombre: string, valor: Dato, largo: number): string {
    const raros = fueraDelArchivo(valor);
    if (raros.length)
      this.lista.push(
        `${nombre} trae ${raros.map((c) => `«${c}»`).join(' ')}, que facturacion.cl no lee: se quita`,
      );
    const limpio = textoLimpio(valor);
    const letras = Array.from(limpio);
    if (letras.length <= largo) return limpio;
    const cortado = letras.slice(0, largo).join('').trim();
    this.lista.push(
      `${nombre} no cabe entero (máximo ${largo} caracteres): queda «${cortado}»`,
    );
    return cortado;
  }

  agregar(aviso: string): void {
    this.lista.push(aviso);
  }
}

/**
 * Un número para el archivo: punto decimal, sin separador de miles y con
 * hasta `decimales` decimales (la cantidad y el precio admiten 6).
 */
export const numeroDelArchivo = (n: number, decimales = 6): string => {
  if (!Number.isFinite(n)) throw new Error(`Número inválido: ${n}`);
  const fijo = n.toFixed(decimales);
  return fijo.includes('.') ? fijo.replace(/\.?0+$/, '') : fijo;
};

/** Un monto en pesos: entero, sin separador de miles. */
export const pesosDelArchivo = (n: number): string => String(Math.round(n));

/** Una fecha AAAA-MM-DD que existe en el calendario. */
export const esFechaDelArchivo = (fecha: unknown): fecha is string => {
  if (typeof fecha !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(fecha))
    return false;
  const [a, m, d] = fecha.split('-').map(Number);
  const real = new Date(Date.UTC(a, m - 1, d));
  return (
    real.getUTCFullYear() === a &&
    real.getUTCMonth() === m - 1 &&
    real.getUTCDate() === d
  );
};

/** El folio que llevaba un archivo de factura o nota (Encabezado, campo 2). */
export const folioDelArchivo = (archivo: string | null) => {
  const lineas = (archivo ?? '').split(/\r?\n/);
  const i = lineas.indexOf('->Encabezado<-');
  const folio = Number((lineas[i + 1] ?? '').split(';')[1]);
  return i >= 0 && Number.isInteger(folio) && folio > 0 ? folio : null;
};

/** La fecha que llevaba el archivo (campo 3 del encabezado o de la
 *  boleta): la del documento, aunque se compruebe otro día (§9.32). */
export const fechaDelArchivo = (archivo: string | null) => {
  const lineas = (archivo ?? '').split(/\r?\n/);
  const i = lineas.findIndex(
    (l) => l === '->Encabezado<-' || l === '->Boleta<-',
  );
  const fecha = i >= 0 ? (lineas[i + 1] ?? '').split(';')[2] : null;
  return esFechaDelArchivo(fecha) ? fecha : null;
};

/** Una línea del archivo: cada campo seguido de «;», como pide el manual. */
export const lineaDelArchivo = (campos: (string | number)[]): string =>
  campos.map((c) => `${c};`).join('');

/** Las líneas van separadas por salto de línea de Windows (\r\n). */
export const SALTO = '\r\n';
