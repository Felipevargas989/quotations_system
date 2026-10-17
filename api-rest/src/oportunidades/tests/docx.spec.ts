import { deflateRawSync } from 'node:zlib';
import { archivoDelZip, textoDeDocx } from '../analisis/docx';

/** Un ZIP mínimo, armado a mano como lo hace Word: encabezado local de cada
 *  archivo, directorio central y fin del directorio. */
const zipCon = (
  archivos: Array<[string, string]>,
  comprimir = true,
): Buffer => {
  const partes: Buffer[] = [];
  const centrales: Buffer[] = [];
  let desplazamiento = 0;
  for (const [nombre, texto] of archivos) {
    const datos = Buffer.from(texto, 'utf8');
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

const DOCUMENTO = [
  '<w:document><w:body>',
  '<w:p><w:r><w:t>ANEXO N°1: Identificación del oferente</w:t></w:r></w:p>',
  '<w:p><w:r><w:t>RUT:</w:t></w:r><w:r><w:tab/><w:t>__________</w:t></w:r></w:p>',
  '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Razón social</w:t></w:r></w:p></w:tc>',
  '<w:tc><w:p><w:r><w:t>Valle &amp; Sol</w:t></w:r></w:p></w:tc></w:tr></w:tbl>',
  '<w:p><w:r><w:t>Monto &lt;= $15.960.000</w:t></w:r></w:p>',
  '</w:body></w:document>',
].join('');

describe('el texto de un Word', () => {
  it('un párrafo por línea, la tabulación y las celdas separadas', () => {
    const texto = textoDeDocx(
      zipCon([
        ['[Content_Types].xml', '<Types/>'],
        ['word/document.xml', DOCUMENTO],
      ]),
    );
    expect(texto).toContain('ANEXO N°1: Identificación del oferente');
    expect(texto).toContain('RUT:\t__________');
    expect(texto).toContain('Razón social');
    expect(texto).toContain(' | Valle & Sol');
    expect(texto).toContain('Monto <= $15.960.000');
    expect(texto).not.toContain('<w:');
  });

  it('también si el ZIP guarda sin comprimir', () => {
    const zip = zipCon([['word/document.xml', DOCUMENTO]], false);
    expect(textoDeDocx(zip)).toContain('Identificación del oferente');
  });

  it('lo que no es un Word devuelve null, sin reventar', () => {
    expect(textoDeDocx(Buffer.from('esto no es un zip'))).toBeNull();
    expect(textoDeDocx(zipCon([['otra/cosa.xml', '<x/>']]))).toBeNull();
    expect(archivoDelZip(Buffer.alloc(10), 'word/document.xml')).toBeNull();
  });
});
