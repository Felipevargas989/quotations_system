import { archivoDelZip, nombresDelZip } from '../analisis/docx';
import { armarZip, crc32 } from '../postulacion/zip';

// El ZIP para Mercado Público (decisión 34): armado a mano, tiene que abrir
// en Windows y en Mac. El CRC mal puesto o los nombres sin la marca de
// UTF-8 dan un ZIP «dañado» o carpetas con letras raras.

describe('el ZIP del set para Mercado Público', () => {
  it('calcula el CRC-32 estándar', () => {
    expect(crc32(Buffer.from('123456789'))).toBe(0xcbf43926);
    expect(crc32(Buffer.alloc(0))).toBe(0);
  });

  it('guarda cada archivo tal cual, en su carpeta, con nombres en UTF-8', () => {
    const pdf = Buffer.from('%PDF-1.7 patente');
    const word = Buffer.from('PK word lleno');
    const zip = armarZip(
      [
        { nombre: '1. Administrativa/Patente 2026.pdf', datos: pdf },
        { nombre: '2. Técnica/Propuesta técnica.docx', datos: word },
      ],
      new Date('2026-10-19T18:30:00.000Z'),
    );

    expect(nombresDelZip(zip)).toEqual([
      '1. Administrativa/Patente 2026.pdf',
      '2. Técnica/Propuesta técnica.docx',
    ]);
    expect(archivoDelZip(zip, '2. Técnica/Propuesta técnica.docx')).toEqual(
      word,
    );
    expect(archivoDelZip(zip, '1. Administrativa/Patente 2026.pdf')).toEqual(
      pdf,
    );

    // Encabezado local del primero: marca UTF-8, sin comprimir y su CRC.
    expect(zip.readUInt32LE(0)).toBe(0x04034b50);
    expect(zip.readUInt16LE(6) & 0x0800).toBe(0x0800);
    expect(zip.readUInt16LE(8)).toBe(0);
    expect(zip.readUInt32LE(14)).toBe(crc32(pdf));
  });

  it('pone la fecha y la hora de Chile, no las del motor (UTC)', () => {
    // 18:30 UTC del 19-10-2026 son las 15:30 en Chile (horario de verano).
    const zip = armarZip(
      [{ nombre: 'a.txt', datos: Buffer.from('a') }],
      new Date('2026-10-19T18:30:00.000Z'),
    );
    const hora = zip.readUInt16LE(10);
    const dia = zip.readUInt16LE(12);
    expect(hora >> 11).toBe(15);
    expect((hora >> 5) & 0x3f).toBe(30);
    expect((dia >> 9) + 1980).toBe(2026);
    expect((dia >> 5) & 0x0f).toBe(10);
    expect(dia & 0x1f).toBe(19);
  });
});
