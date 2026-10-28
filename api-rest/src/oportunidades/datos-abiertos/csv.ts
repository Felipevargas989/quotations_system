// LEER LOS CSV DE CHILECOMPRA (decisión 101 del doc 17): separados por punto
// y coma, con comillas, comillas dobladas ("") dentro de un texto y saltos
// de línea dentro de las descripciones. Vienen en Windows-1252 (las tildes
// y las comillas tipográficas). Se leen de a pedazos: una fila a la vez.

const COMILLA = 34;
const SALTO = 10;
const RETORNO = 13;

export type FilaDelCsv = Record<string, string>;

const sinRetorno = (texto: string) =>
  texto.charCodeAt(texto.length - 1) === RETORNO ? texto.slice(0, -1) : texto;

/** Las filas del CSV, cada una como la lista de sus campos. */
export async function* filasDelCsv(
  fuente: AsyncIterable<Buffer | string>,
  separador = ';',
): AsyncGenerator<string[]> {
  const sep = separador.charCodeAt(0);
  const decodificador = new TextDecoder('windows-1252');
  let campo = '';
  let fila: string[] = [];
  let enComillas = false;
  /** Dentro de comillas apareció una: la que sigue dice si era el cierre. */
  let comillaPendiente = false;
  let hayAlgo = false;
  for await (const trozo of fuente) {
    const t =
      typeof trozo === 'string'
        ? trozo
        : decodificador.decode(trozo, { stream: true });
    let inicio = 0;
    for (let i = 0; i < t.length; i++) {
      const c = t.charCodeAt(i);
      hayAlgo = true;
      if (enComillas) {
        if (comillaPendiente) {
          comillaPendiente = false;
          if (c === COMILLA) {
            campo += '"';
            inicio = i + 1;
            continue;
          }
          enComillas = false;
          inicio = i;
        } else {
          if (c === COMILLA) {
            campo += t.slice(inicio, i);
            comillaPendiente = true;
          }
          continue;
        }
      }
      if (c === COMILLA && campo === '' && i === inicio) {
        enComillas = true;
        inicio = i + 1;
      } else if (c === sep) {
        fila.push(campo + t.slice(inicio, i));
        campo = '';
        inicio = i + 1;
      } else if (c === SALTO) {
        fila.push(sinRetorno(campo + t.slice(inicio, i)));
        yield fila;
        fila = [];
        campo = '';
        hayAlgo = false;
        inicio = i + 1;
      }
    }
    if (!comillaPendiente) campo += t.slice(inicio);
  }
  if (hayAlgo || campo !== '' || fila.length > 0) {
    fila.push(sinRetorno(campo));
    yield fila;
  }
}

/** Las filas con el nombre de cada columna, según la primera línea. Una fila
 *  con menos campos (cortada) trae vacíos los que faltan. */
export async function* registrosDelCsv(
  fuente: AsyncIterable<Buffer | string>,
  separador = ';',
): AsyncGenerator<FilaDelCsv> {
  let columnas: string[] | null = null;
  for await (const campos of filasDelCsv(fuente, separador)) {
    if (!columnas) {
      columnas = campos.map((c) => c.trim());
      continue;
    }
    if (campos.length === 1 && campos[0] === '') continue;
    const registro: FilaDelCsv = {};
    for (let i = 0; i < columnas.length; i++) {
      registro[columnas[i]] = campos[i] ?? '';
    }
    yield registro;
  }
}
