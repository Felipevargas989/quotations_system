import { PDFDocument } from 'pdf-lib';
import { paginasDeLosFormularios } from '../generacion/formularios';
import {
  paginasDe,
  paginasParaElTaller,
  recortarPdf,
} from '../generacion/recortar-pdf';

// SOLO LAS PÁGINAS DE LOS FORMULARIOS (19-10): el Día del Profesor murió
// dos veces con "prompt is too long" porque el taller miraba el decreto
// escaneado entero. Ahora recibe solo las páginas de los formularios.

const pdfDe = async (paginas: number): Promise<Buffer> => {
  const doc = await PDFDocument.create();
  for (let i = 0; i < paginas; i++) doc.addPage([200 + i, 300]);
  return Buffer.from(await doc.save());
};

describe('Recortar un PDF a las páginas de sus formularios', () => {
  it('lee las páginas como las escribe el análisis', () => {
    expect(paginasDe('16')).toEqual([16]);
    expect(paginasDe('16-17')).toEqual([16, 17]);
    expect(paginasDe('16 a 18')).toEqual([16, 17, 18]);
    expect(paginasDe('16, 18')).toEqual([16, 18]);
    expect(paginasDe('16 y 17')).toEqual([16, 17]);
    expect(paginasDe('')).toEqual([]);
  });

  it('las del taller: las de todos los formularios y una más', () => {
    expect(paginasParaElTaller(['16', '16-17', '17', '18', '18'])).toEqual([
      16, 17, 18, 19,
    ]);
    expect(paginasParaElTaller(['', ''])).toEqual([]);
  });

  it('del Profesor: solo los formularios que aplican de ese archivo', () => {
    const decreto =
      'Decreto_N°_4.777_apruebas_licitación_y_bases dia del profesor.pdf';
    expect(
      paginasDeLosFormularios(decreto, [
        { archivo: decreto, aplica: true, paginas: '16' },
        { archivo: decreto, aplica: true, paginas: '16-17' },
        { archivo: decreto, aplica: true, paginas: '18' },
        { archivo: decreto, aplica: false, paginas: '30' },
        { archivo: 'otro.pdf', aplica: true, paginas: '2' },
        { archivo: '', aplica: true, paginas: '' },
      ]),
    ).toEqual([16, 17, 18, 19]);
  });

  it('deja solo esas páginas, en orden; si no hay qué recortar o no se puede, null', async () => {
    const original = await pdfDe(20);
    const recortado = await recortarPdf(original, [16, 17, 18, 19]);
    expect(recortado).not.toBeNull();
    const leido = await PDFDocument.load(recortado as Buffer);
    expect(leido.getPageCount()).toBe(4);
    // La primera del recorte es la 16 del original (ancho 215).
    expect(leido.getPage(0).getWidth()).toBe(215);

    expect(await recortarPdf(original, [])).toBeNull();
    expect(await recortarPdf(original, [40, 41])).toBeNull();
    expect(
      await recortarPdf(
        original,
        Array.from({ length: 20 }, (_, i) => i + 1),
      ),
    ).toBeNull();
    expect(await recortarPdf(Buffer.from('no es un pdf'), [1])).toBeNull();
  });
});
