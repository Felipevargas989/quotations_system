import { createReadStream } from 'node:fs';
import { open } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { createInflateRaw } from 'node:zlib';

// LEER UN ZIP POR PARTES (decisión 101 del doc 17). Los archivos de
// ChileCompra traen CSV de hasta 1,4 GB por mes: se leen de a pedazos desde
// el disco, sin descomprimirlos enteros ni cargarlos en memoria. Solo lo
// que usan esos archivos: guardado (0) o deflate (8), y ZIP64 por si algún
// mes pasa los 4 GB.

export type EntradaDelZip = {
  nombre: string;
  /** 0 = guardado tal cual; 8 = deflate. */
  metodo: number;
  comprimido: number;
  tamano: number;
  inicioLocal: number;
};

const FIN = 0x06054b50;
const FIN_ZIP64 = 0x06064b50;
const LOCALIZADOR_ZIP64 = 0x07064b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;
const SIN_LUGAR = 0xffffffff;
/** El final del ZIP mide 22 bytes más un comentario de hasta 65.535. */
const COLA = 22 + 65_535 + 20;

const leer = async (ruta: string, desde: number, largo: number) => {
  const archivo = await open(ruta, 'r');
  try {
    const buf = Buffer.alloc(largo);
    const { bytesRead } = await archivo.read(buf, 0, largo, desde);
    return buf.subarray(0, bytesRead);
  } finally {
    await archivo.close();
  }
};

/** El largo de un archivo, sin abrirlo para leer. */
const largoDe = async (ruta: string) => {
  const archivo = await open(ruta, 'r');
  try {
    return (await archivo.stat()).size;
  } finally {
    await archivo.close();
  }
};

/** Lo que hay dentro del ZIP, según su directorio central. */
export async function entradasDelZip(ruta: string): Promise<EntradaDelZip[]> {
  const largo = await largoDe(ruta);
  const desde = Math.max(0, largo - COLA);
  const cola = await leer(ruta, desde, largo - desde);
  let fin = -1;
  for (let i = cola.length - 22; i >= 0; i--) {
    if (cola.readUInt32LE(i) === FIN) {
      fin = i;
      break;
    }
  }
  if (fin < 0) throw new Error('el archivo no es un ZIP');
  let total = cola.readUInt16LE(fin + 10);
  let tamanoCentral = cola.readUInt32LE(fin + 12);
  let inicioCentral = cola.readUInt32LE(fin + 16);
  if (
    total === 0xffff ||
    tamanoCentral === SIN_LUGAR ||
    inicioCentral === SIN_LUGAR
  ) {
    const localizador = fin - 20;
    if (
      localizador < 0 ||
      cola.readUInt32LE(localizador) !== LOCALIZADOR_ZIP64
    ) {
      throw new Error('ZIP64 sin su localizador');
    }
    const finZip64 = await leer(
      ruta,
      Number(cola.readBigUInt64LE(localizador + 8)),
      56,
    );
    if (finZip64.length < 56 || finZip64.readUInt32LE(0) !== FIN_ZIP64) {
      throw new Error('ZIP64 dañado');
    }
    total = Number(finZip64.readBigUInt64LE(32));
    tamanoCentral = Number(finZip64.readBigUInt64LE(40));
    inicioCentral = Number(finZip64.readBigUInt64LE(48));
  }
  const central = await leer(ruta, inicioCentral, tamanoCentral);
  const entradas: EntradaDelZip[] = [];
  let p = 0;
  for (let n = 0; n < total; n++) {
    if (p + 46 > central.length || central.readUInt32LE(p) !== CENTRAL) {
      throw new Error('el directorio del ZIP está dañado');
    }
    const largoNombre = central.readUInt16LE(p + 28);
    const largoExtra = central.readUInt16LE(p + 30);
    const largoComentario = central.readUInt16LE(p + 32);
    const entrada: EntradaDelZip = {
      nombre: central.toString('utf8', p + 46, p + 46 + largoNombre),
      metodo: central.readUInt16LE(p + 10),
      comprimido: central.readUInt32LE(p + 20),
      tamano: central.readUInt32LE(p + 24),
      inicioLocal: central.readUInt32LE(p + 42),
    };
    // ZIP64: los tamaños que no cupieron vienen en el extra 0x0001, en este
    // orden y solo los que hagan falta.
    let e = p + 46 + largoNombre;
    const finExtra = e + largoExtra;
    while (e + 4 <= finExtra) {
      const id = central.readUInt16LE(e);
      const largoDelExtra = central.readUInt16LE(e + 2);
      if (id === 0x0001) {
        let q = e + 4;
        for (const campo of ['tamano', 'comprimido', 'inicioLocal'] as const) {
          if (entrada[campo] === SIN_LUGAR) {
            entrada[campo] = Number(central.readBigUInt64LE(q));
            q += 8;
          }
        }
      }
      e += 4 + largoDelExtra;
    }
    entradas.push(entrada);
    p = finExtra + largoComentario;
  }
  return entradas;
}

/** El contenido de una entrada, descomprimido de a pedazos. */
export async function leerEntrada(
  ruta: string,
  entrada: EntradaDelZip,
): Promise<Readable> {
  const local = await leer(ruta, entrada.inicioLocal, 30);
  if (local.length < 30 || local.readUInt32LE(0) !== LOCAL) {
    throw new Error(`la entrada ${entrada.nombre} del ZIP está dañada`);
  }
  const inicio =
    entrada.inicioLocal + 30 + local.readUInt16LE(26) + local.readUInt16LE(28);
  if (entrada.comprimido === 0) return Readable.from([]);
  const crudo = createReadStream(ruta, {
    start: inicio,
    end: inicio + entrada.comprimido - 1,
  });
  if (entrada.metodo === 0) return crudo;
  if (entrada.metodo !== 8) {
    crudo.destroy();
    throw new Error(
      `la entrada ${entrada.nombre} usa un método que no se lee (${entrada.metodo})`,
    );
  }
  const inflar = createInflateRaw();
  crudo.on('error', (error) => inflar.destroy(error));
  return crudo.pipe(inflar);
}
