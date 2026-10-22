import { archivoDelZip, nombresDelZip, textoDeDocx } from '../analisis/docx';
import { wordCon, zipCon } from './zip-de-prueba';

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

describe('lo que trae un Word', () => {
  it('los nombres de adentro: así se cuentan las imágenes (la firma)', () => {
    expect(nombresDelZip(wordCon(['Firma: ____'], 2))).toEqual([
      '[Content_Types].xml',
      'word/document.xml',
      'word/media/image1.png',
      'word/media/image2.png',
    ]);
    expect(nombresDelZip(Buffer.from('esto no es un zip'))).toBeNull();
  });
});
