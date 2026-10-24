// EL ZIP PARA MERCADO PÚBLICO (decisión 34 del doc 17, 19-10): un ZIP
// armado a mano con lo que trae Node, sin librerías (como el lector de Word
// de `analisis/docx.ts`, pero al revés): encabezado local de cada archivo,
// directorio central y fin del directorio. Sin comprimir: los PDF y los
// Word ya vienen comprimidos, y comprimirlos de nuevo solo ocuparía el
// motor. Los nombres van en UTF-8 (bit 11) para que «Técnica» y
// «Económica» se lean bien en Windows y en Mac. Sin ZIP64: hasta 4 GB.
// Desde el 24-10 (decisión 78) un archivo puede ir comprimido
// (`comprimir`): el Word editado en Eventia rearma su ZIP, y su XML sin
// comprimir pesaba cinco veces más.

import { deflateRawSync } from 'node:zlib';

const TABLA_CRC = (() => {
  const tabla = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    tabla[n] = c >>> 0;
  }
  return tabla;
})();

/** El CRC-32 de un archivo: sin él, Windows y Mac dicen que el ZIP está
 *  dañado. */
export const crc32 = (datos: Buffer): number => {
  let c = 0xffffffff;
  // Con índice y no con for...of: un set de 50 MB pasa byte por byte.
  for (let i = 0; i < datos.length; i++) {
    c = TABLA_CRC[(c ^ datos[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
};

/** La fecha y la hora como las guarda un ZIP (formato de MS-DOS), en hora
 *  de Chile: el motor corre en UTC. */
const fechaDelZip = (cuando: Date): { hora: number; dia: number } => {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'America/Santiago',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hourCycle: 'h23',
    })
      .formatToParts(cuando)
      .map((p) => [p.type, Number(p.value)]),
  ) as Record<string, number>;
  return {
    hora: (partes.hour << 11) | (partes.minute << 5) | (partes.second >> 1),
    dia: ((partes.year - 1980) << 9) | (partes.month << 5) | partes.day,
  };
};

const NOMBRE_EN_UTF8 = 0x0800;

export type ArchivoParaElZip = {
  nombre: string;
  datos: Buffer;
  /** Comprimido (deflate). Sin decirlo, tal cual. */
  comprimir?: boolean;
};

export const armarZip = (
  archivos: ArchivoParaElZip[],
  cuando = new Date(),
): Buffer => {
  const { hora, dia } = fechaDelZip(cuando);
  const partes: Buffer[] = [];
  const centrales: Buffer[] = [];
  let desplazamiento = 0;
  for (const { nombre, datos, comprimir } of archivos) {
    const n = Buffer.from(nombre, 'utf8');
    const crc = crc32(datos);
    const cuerpo = comprimir ? deflateRawSync(datos) : datos;
    const metodo = comprimir ? 8 : 0;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(NOMBRE_EN_UTF8, 6);
    local.writeUInt16LE(metodo, 8);
    local.writeUInt16LE(hora, 10);
    local.writeUInt16LE(dia, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(cuerpo.length, 18);
    local.writeUInt32LE(datos.length, 22);
    local.writeUInt16LE(n.length, 26);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(NOMBRE_EN_UTF8, 8);
    central.writeUInt16LE(metodo, 10);
    central.writeUInt16LE(hora, 12);
    central.writeUInt16LE(dia, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(cuerpo.length, 20);
    central.writeUInt32LE(datos.length, 24);
    central.writeUInt16LE(n.length, 28);
    central.writeUInt32LE(desplazamiento, 42);

    partes.push(local, n, cuerpo);
    centrales.push(central, n);
    desplazamiento += local.length + n.length + cuerpo.length;
  }
  const directorio = Buffer.concat(centrales);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0);
  fin.writeUInt16LE(archivos.length, 8);
  fin.writeUInt16LE(archivos.length, 10);
  fin.writeUInt32LE(directorio.length, 12);
  fin.writeUInt32LE(desplazamiento, 16);
  return Buffer.concat([...partes, directorio, fin]);
};
