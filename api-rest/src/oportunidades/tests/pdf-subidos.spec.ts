import type Anthropic from '@anthropic-ai/sdk';
import { armarContenido, MAX_BYTES_DE_PDF } from '../analisis/comun';
import { idDelPdf, VENCE_EN_SEGUNDOS } from '../analisis/pdf-subidos';

// LOS PDF QUE NO CABEN EN EL PEDIDO (decisión 103, 28-10): pasado 22 MB
// van por la Files API, vencen solos a las 2 horas y el mismo PDF se
// vuelve a usar con su `file_id`, para que «Pregúntale a la IA» lea la
// caché del análisis.

type Subida = { file: { name: string }; expires_in_seconds: number };

const clienteFalso = () => {
  let n = 0;
  const upload = jest.fn((_pedido: Subida) =>
    Promise.resolve({ id: `file_${++n}` }),
  );
  return { cliente: { files: { upload } } as unknown as Anthropic, upload };
};

describe('idDelPdf', () => {
  it('lo sube con vencimiento de 2 horas y usa el mismo por una hora y media', async () => {
    const { cliente, upload } = clienteFalso();
    const datos = Buffer.from('%PDF-1.7 las bases de la primera prueba');
    const t = 1_000_000;

    expect(await idDelPdf(cliente, datos, 'Bases.pdf', t)).toBe('file_1');
    expect(
      await idDelPdf(cliente, datos, 'Bases.pdf', t + 89 * 60 * 1000),
    ).toBe('file_1');
    expect(upload).toHaveBeenCalledTimes(1);
    expect(VENCE_EN_SEGUNDOS).toBe(2 * 60 * 60);
    expect(upload.mock.calls[0][0].expires_in_seconds).toBe(VENCE_EN_SEGUNDOS);

    expect(
      await idDelPdf(cliente, datos, 'Bases.pdf', t + 91 * 60 * 1000),
    ).toBe('file_2');
    expect(upload).toHaveBeenCalledTimes(2);
  });

  it('otro contenido es otro archivo, con el nombre sin lo que la Files API no acepta', async () => {
    const { cliente, upload } = clienteFalso();
    await idDelPdf(cliente, Buffer.from('%PDF uno'), 'Bases: anexo "1".pdf');
    await idDelPdf(cliente, Buffer.from('%PDF dos'), 'Anexo/2.pdf');

    expect(upload).toHaveBeenCalledTimes(2);
    expect(upload.mock.calls.map(([p]) => p.file.name)).toEqual([
      'Bases_ anexo _1_.pdf',
      'Anexo_2.pdf',
    ]);
  });
});

describe('armarContenido con subir', () => {
  const MB = 1024 * 1024;

  it('si los PDF pasan de 22 MB juntos, van todos por la Files API; el texto sigue adentro', async () => {
    const archivos: Record<string, Buffer> = {
      'c1/a.pdf': Buffer.alloc(12 * MB, 'a'),
      'c1/b.pdf': Buffer.alloc(11 * MB, 'b'),
      'c1/c.txt': Buffer.from('ACLARATORIA N°1'),
    };
    const subir = jest.fn((_datos: Buffer, nombre: string) =>
      Promise.resolve(`file_${nombre}`),
    );

    const { bloques, sinAbrir } = await armarContenido(
      [
        { nombre: 'Bases.pdf', ruta: 'c1/a.pdf' },
        { nombre: 'Anexos.pdf', ruta: 'c1/b.pdf' },
        { nombre: 'Aclaratoria.txt', ruta: 'c1/c.txt' },
      ],
      (ruta) => Promise.resolve(archivos[ruta]),
      subir,
    );

    expect(sinAbrir).toEqual([]);
    expect(bloques.map((b) => [b.title, b.source])).toEqual([
      ['Bases.pdf', { type: 'file', file_id: 'file_Bases.pdf' }],
      ['Anexos.pdf', { type: 'file', file_id: 'file_Anexos.pdf' }],
      [
        'Aclaratoria.txt',
        { type: 'text', media_type: 'text/plain', data: 'ACLARATORIA N°1' },
      ],
    ]);
  });

  it('bajo 22 MB, o sin con qué subir, van dentro del pedido como siempre', async () => {
    const subir = jest.fn();
    const chico = await armarContenido(
      [{ nombre: 'Bases.pdf', ruta: 'c1/x.pdf' }],
      () => Promise.resolve(Buffer.from('%PDF-1.7')),
      subir,
    );
    expect(chico.bloques[0].source).toEqual({
      type: 'base64',
      media_type: 'application/pdf',
      data: Buffer.from('%PDF-1.7').toString('base64'),
    });
    expect(subir).not.toHaveBeenCalled();

    const sinSubir = await armarContenido(
      [{ nombre: 'Bases.pdf', ruta: 'c1/x.pdf' }],
      () => Promise.resolve(Buffer.alloc(MAX_BYTES_DE_PDF + 1)),
    );
    expect(sinSubir.bloques[0].source.type).toBe('base64');
  });
});
