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

/** Un Excel mínimo de una hoja («Oferta»): cada fila con sus celdas, el
 *  texto escrito en la celda y los números como números (decisión 127). */
export const excelCon = (filas: Array<Array<string | number>>): Buffer => {
  const hoja = filas
    .map((celdas, f) => {
      const fila = celdas
        .map((valor, c) => {
          const ref = `${String.fromCharCode(65 + c)}${f + 1}`;
          return typeof valor === 'number'
            ? `<c r="${ref}"><v>${valor}</v></c>`
            : `<c r="${ref}" t="inlineStr"><is><t>${valor}</t></is></c>`;
        })
        .join('');
      return `<row r="${f + 1}">${fila}</row>`;
    })
    .join('');
  return zipCon([
    ['[Content_Types].xml', '<Types/>'],
    [
      'xl/workbook.xml',
      '<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Oferta" sheetId="1" r:id="rId1"/></sheets></workbook>',
    ],
    [
      'xl/_rels/workbook.xml.rels',
      '<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    ],
    [
      'xl/worksheets/sheet1.xml',
      `<worksheet><sheetData>${hoja}</sheetData></worksheet>`,
    ],
  ]);
};
