import { deflateRawSync } from 'node:zlib';

/** Un ZIP mínimo, armado a mano como lo hace Word: encabezado local de cada
 *  archivo, directorio central y fin del directorio. Para las pruebas del
 *  lector de Word y de lo que entrega la IA. */
export const zipCon = (
  archivos: Array<[string, string | Buffer]>,
  comprimir = true,
): Buffer => {
  const partes: Buffer[] = [];
  const centrales: Buffer[] = [];
  let desplazamiento = 0;
  for (const [nombre, contenido] of archivos) {
    const datos =
      typeof contenido === 'string'
        ? Buffer.from(contenido, 'utf8')
        : contenido;
    const cuerpo = comprimir ? deflateRawSync(datos) : datos;
    const n = Buffer.from(nombre, 'utf8');
    const metodo = comprimir ? 8 : 0;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(metodo, 8);
    local.writeUInt32LE(cuerpo.length, 18);
    local.writeUInt32LE(datos.length, 22);
    local.writeUInt16LE(n.length, 26);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(metodo, 10);
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

/** Un Word con esos párrafos y, si se pide, imágenes en word/media/. */
export const wordCon = (parrafos: string[], imagenes = 0): Buffer =>
  zipCon([
    ['[Content_Types].xml', '<Types/>'],
    [
      'word/document.xml',
      `<w:document><w:body>${parrafos
        .map((p) => `<w:p><w:r><w:t>${p}</w:t></w:r></w:p>`)
        .join('')}</w:body></w:document>`,
    ],
    ...Array.from({ length: imagenes }, (_, i): [string, Buffer] => [
      `word/media/image${i + 1}.png`,
      Buffer.from('png'),
    ]),
  ]);
