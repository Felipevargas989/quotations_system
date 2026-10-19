import { PDFDocument } from 'pdf-lib';
import { unirPdf } from '../postulacion/unir-pdf';

// UN SOLO PDF CON SUS RESPALDOS (19-10). Felipe: "que el anexo de
// experiencia adjunte los mismos respaldos, sea un solo PDF, un solo
// documento con los respaldos adjuntos, no tres documentos".

const pdfDe = async (paginas: number): Promise<Buffer> => {
  const doc = await PDFDocument.create();
  for (let i = 0; i < paginas; i++) doc.addPage([300 + i, 400]);
  return Buffer.from(await doc.save());
};

/** Un PNG de 1×1, el más chico que hay. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

describe('Unir el anexo con sus respaldos', () => {
  it('el anexo primero y detrás cada respaldo, con todas sus páginas; una foto, en una página', async () => {
    const r = await unirPdf(await pdfDe(2), [
      { nombre: 'OC 5043-27-AG26.pdf', datos: await pdfDe(3) },
      { nombre: 'Factura 1.png', datos: PNG },
    ]);
    expect(r).not.toBeNull();
    const leido = await PDFDocument.load(r!.datos);
    expect(leido.getPageCount()).toBe(2 + 3 + 1);
    // La primera es la del anexo (ancho 300); la tercera, la del respaldo.
    expect(leido.getPage(0).getWidth()).toBe(300);
    expect(leido.getPage(2).getWidth()).toBe(300);
    expect(r!.saltados).toEqual([]);
  });

  it('lo que no se puede pegar (un Word, un PDF roto) queda aparte; un anexo roto, null', async () => {
    const r = await unirPdf(await pdfDe(1), [
      { nombre: 'Respaldo.docx', datos: Buffer.from('word') },
      { nombre: 'Roto.pdf', datos: Buffer.from('no es un pdf') },
    ]);
    expect(r?.saltados).toEqual(['Respaldo.docx', 'Roto.pdf']);
    expect((await PDFDocument.load(r!.datos)).getPageCount()).toBe(1);
    expect(await unirPdf(Buffer.from('no es un pdf'), [])).toBeNull();
  });
});
