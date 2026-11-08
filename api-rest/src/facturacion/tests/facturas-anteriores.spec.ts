import { BadRequestException, ConflictException } from '@nestjs/common';
import { deflateSync } from 'node:zlib';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { mockPinoLogger } from '../../testing/mocks';
import { FacturasAnterioresService } from '../facturas-anteriores/facturas-anteriores.service';
import {
  leerFacturaAnterior,
  receptorDeLaFactura,
  textosDelPdf,
} from '../facturas-anteriores/texto-del-pdf';

/**
 * TUS FACTURAS ANTERIORES (doc 19 §9.29; Felipe, 08-11: *"¿qué pasó con
 * buscar los datos solo con el RUT?"*). El cuadro del cliente leído del PDF
 * que arma facturacion.cl (JasperReports con iText 2.0.1: cada texto en su
 * bloque `BT … ET`, con su posición y su `(texto) Tj`), y la lectura por
 * detrás, de la factura más nueva a la más vieja. Datos inventados.
 */

type Texto = [x: number, y: number, texto: string];

/** Un texto como lo escribe iText: en latin-1, con los paréntesis y la
 *  barra escapados y la eñe en octal. */
const literal = (texto: string) =>
  Array.from(texto)
    .map((c) => {
      const n = c.charCodeAt(0);
      if (c === '(' || c === ')' || c === '\\') return `\\${c}`;
      return n > 127 ? `\\${n.toString(8)}` : c;
    })
    .join('');

/** Un PDF con la forma de los de facturacion.cl, más un logo que no se lee. */
const pdfComoFacturacionCl = (textos: Texto[]) => {
  const contenido = textos
    .map(
      ([x, y, t]) =>
        `BT\n1 0 0 1 ${x} ${y} Tm\n/F1 8 Tf\n0 0 0 rg\n(${literal(t)})Tj\n0 g\nET\n1 0 0 1 0 0 cm\n`,
    )
    .join('');
  const flujo = deflateSync(Buffer.from(contenido, 'latin1'));
  const logo = deflateSync(Buffer.from('esto no es texto BT (x)Tj', 'latin1'));
  return Buffer.concat([
    Buffer.from(
      '%PDF-1.4\n1 0 obj\n<</Type/Catalog/Pages 2 0 R>>\nendobj\n' +
        `4 0 obj\n<</Length ${logo.length}/Subtype/Image/Filter/FlateDecode>>stream\n`,
      'latin1',
    ),
    logo,
    Buffer.from(
      `\nendstream\nendobj\n5 0 obj\n<</Filter/FlateDecode/Length ${flujo.length}>>stream\n`,
      'latin1',
    ),
    flujo,
    Buffer.from('\nendstream\nendobj\n%%EOF\n', 'latin1'),
  ]);
};

/** El cuadro del cliente del formato de producción (factura N° 379, 08-11),
 *  con otros datos y en otro orden, como lo escribe iText. */
const PRODUCCION: Texto[] = [
  [446.71, 752.72, 'R.U.T.: 77.701.305-K'],
  [432.84, 718.54, 'FACTURA ELECTRONICA'],
  [479.34, 687.72, 'Nº 380'],
  [422.6, 646.72, 'Quillon, 05 de noviembre de 2026'],
  [100, 618.6, '65.123.456-5'],
  [100, 606.6, 'ORGANIZACION COMUNITARIA'],
  [100, 594.6, 'LOS AROMOS 123'],
  [100, 582.6, 'QUILLÓN'],
  [475, 582.6, 'QUILLÓN'],
  [100, 630.6, 'JUNTA DE VECINOS VILLA LOS AROMOS'],
  [40, 630.6, 'Señor(es)'],
  [40, 618.6, 'R.U.T.'],
  [40, 606.6, 'Giro'],
  [40, 594.6, 'Dirección'],
  [40, 582.6, 'Comuna'],
  [400, 582.6, 'Ciudad'],
  [95, 630.6, ':'],
  [95, 618.6, ':'],
  [95, 606.6, ':'],
  [95, 594.6, ':'],
  [95, 582.6, ':'],
  [470, 582.6, ':'],
];

const ESPERADO = {
  rut: '65123456-5',
  razon_social: 'JUNTA DE VECINOS VILLA LOS AROMOS',
  giro: 'ORGANIZACION COMUNITARIA',
  direccion: 'LOS AROMOS 123',
  comuna: 'QUILLÓN',
  ciudad: 'QUILLÓN',
  fecha_emision: '2026-11-05',
};

describe('El cuadro del cliente de una factura de facturacion.cl', () => {
  it('lee los textos con su posición, con la eñe y los paréntesis escapados, sin el logo', () => {
    const textos = textosDelPdf(pdfComoFacturacionCl(PRODUCCION));
    expect(textos).toHaveLength(PRODUCCION.length);
    expect(textos).toContainEqual({ x: 40, y: 630.6, texto: 'Señor(es)' });
    expect(textos).toContainEqual({ x: 40, y: 594.6, texto: 'Dirección' });
  });

  it('el formato de producción: cada valor junto a su etiqueta, la ciudad en la fila de la comuna, y la fecha', () => {
    expect(leerFacturaAnterior(pdfComoFacturacionCl(PRODUCCION))).toEqual(
      ESPERADO,
    );
  });

  it('el formato de prueba: lo de la columna de la derecha (teléfono, vencimiento, forma de pago) no se mezcla', () => {
    const prueba: Texto[] = [
      [468.39, 752.72, 'R.U.T. : 1-9'],
      [421.49, 646.72, 'Iquique, 06 de noviembre de 2026'],
      [30, 737.58, 'GIRO PRUEBA'],
      [30, 717.58, 'Dirección:'],
      [36, 630.6, 'Señor(es)'],
      [85, 630.6, ':'],
      [90, 630.6, 'Valle del Sol Quillón SpA'],
      [345, 630.6, 'Teléfono'],
      [417, 630.6, ':'],
      [36, 618.6, 'R.U.T.'],
      [85, 618.6, ':'],
      [90, 618.6, '77.701.305-K'],
      [345, 618.6, 'Vencimiento'],
      [417, 618.6, ':'],
      [423, 618.6, '06/12/2026'],
      [36, 606.6, 'Giro'],
      [85, 606.6, ':'],
      [90, 606.6, 'Turismo y eventos (prueba)'],
      [345, 606.6, 'Forma de Pago'],
      [417, 606.6, ':'],
      [423, 606.6, 'CREDITO'],
      [36, 594.6, 'Dirección'],
      [85, 594.6, ':'],
      [90, 594.6, 'Dirección de prueba 123'],
      [345, 594.6, 'Vendedor'],
      [417, 594.6, ':'],
      [36, 582.6, 'Comuna'],
      [85, 582.6, ':'],
      [90, 582.6, 'QUILLON'],
      [345, 582.6, 'Ciudad'],
      [417, 582.6, ':'],
      [423, 582.6, 'QUILLON'],
    ];
    expect(leerFacturaAnterior(pdfComoFacturacionCl(prueba))).toEqual({
      rut: '77701305-K',
      razon_social: 'Valle del Sol Quillón SpA',
      giro: 'Turismo y eventos (prueba)',
      direccion: 'Dirección de prueba 123',
      comuna: 'QUILLON',
      ciudad: 'QUILLON',
      fecha_emision: '2026-11-06',
    });
  });

  it('también un PDF de otro armador (pdf-lib, con el texto en hexadecimal)', async () => {
    const doc = await PDFDocument.create();
    const pagina = doc.addPage([612, 792]);
    const letra = await doc.embedFont(StandardFonts.Helvetica);
    for (const [x, y, texto] of PRODUCCION)
      pagina.drawText(texto, { x, y, size: 8, font: letra });
    const pdf = Buffer.from(await doc.save());
    expect(leerFacturaAnterior(pdf)).toEqual(ESPERADO);
  });

  it('sin RUT válido, sin «Señor(es)» o si no es un PDF, no se lee nada (mejor no llenar que llenar mal)', () => {
    const conRut = (rut: string) =>
      PRODUCCION.map(
        ([x, y, t]): Texto => [x, y, t === '65.123.456-5' ? rut : t],
      );
    expect(
      leerFacturaAnterior(pdfComoFacturacionCl(conRut('65.123.456-1'))),
    ).toBeNull();
    expect(
      leerFacturaAnterior(pdfComoFacturacionCl(conRut('66.666.666-6'))),
    ).toBeNull();
    expect(
      receptorDeLaFactura(
        PRODUCCION.filter(([, , t]) => t !== 'Señor(es)').map(
          ([x, y, texto]) => ({
            x,
            y,
            texto,
          }),
        ),
      ),
    ).toBeNull();
    expect(leerFacturaAnterior(Buffer.from('no soy un PDF'))).toBeNull();
  });
});

describe('«Leer mis facturas anteriores» (§9.29)', () => {
  const armar = ({
    ambiente = 'produccion' as 'produccion' | 'prueba' | 'simulado',
    sinConexion = undefined as string | undefined,
    siguiente = 5,
    pdfs = new Map<number, Buffer | null | Error>(),
    foliosDeEventia = [] as number[],
    ultima = null as Record<string, unknown> | null,
  } = {}) => {
    const repo = {
      ultima: jest.fn().mockResolvedValue(ultima),
      cuantosClientes: jest.fn().mockResolvedValue(0),
      empezar: jest
        .fn()
        .mockImplementation((_c: number, _p: unknown, folios: number[]) =>
          Promise.resolve({ id: 3, estado: 'leyendo', folios: folios.length }),
        ),
      avanzar: jest.fn().mockResolvedValue(undefined),
      terminar: jest.fn().mockResolvedValue(undefined),
      guardar: jest.fn().mockResolvedValue(undefined),
      receptor: jest.fn().mockResolvedValue(null),
      foliosDeEventia: jest.fn().mockResolvedValue(foliosDeEventia),
    };
    const conexion = {
      ambiente,
      sinConexion,
      folios: jest
        .fn()
        .mockResolvedValue({ tipo: 33, siguiente, disponibles: 10 }),
      obtenerPdf: jest.fn().mockImplementation((_t: number, folio: number) => {
        const r = pdfs.get(folio);
        return r instanceof Error
          ? Promise.reject(r)
          : Promise.resolve(r ?? null);
      }),
    };
    const documentos = { ultimoFolio: jest.fn().mockResolvedValue(0) };
    const servicio = new FacturasAnterioresService(
      repo as never,
      { de: () => conexion } as never,
      documentos as never,
      mockPinoLogger() as never,
    );
    servicio.pausaMs = 0;
    return { servicio, repo, conexion };
  };

  const POR = { id: 'u-felipe', nombre: 'Felipe' };

  it('en producción pide de la anterior a la siguiente hacia atrás, y cada RUT queda con su factura más nueva', async () => {
    const nueva = pdfComoFacturacionCl(PRODUCCION);
    const vieja = pdfComoFacturacionCl(
      PRODUCCION.map(
        ([x, y, t]): Texto => [
          x,
          y,
          t === 'LOS AROMOS 123' ? 'DIRECCION VIEJA 1' : t,
        ],
      ),
    );
    const { servicio, repo, conexion } = armar({
      pdfs: new Map<number, Buffer | null | Error>([
        [4, nueva],
        [3, null],
        [2, vieja],
        [1, new Error('se cortó')],
      ]),
    });
    const correr = jest.spyOn(servicio, 'correr');
    const lectura = await servicio.leer(1, POR);
    expect(lectura).toMatchObject({ id: 3, folios: 4 });
    expect(repo.empezar).toHaveBeenCalledWith(1, POR, [4, 3, 2, 1]);
    await correr.mock.results[0].value;

    expect(
      (conexion.obtenerPdf.mock.calls as [number, number][]).map((c) => c[1]),
    ).toEqual([4, 3, 2, 1]);
    expect(repo.guardar).toHaveBeenCalledTimes(1);
    expect(repo.guardar).toHaveBeenCalledWith(1, {
      ...ESPERADO,
      tipo: 33,
      folio: 4,
    });
    // Una sin respuesta suelta no corta la lectura.
    expect(repo.terminar).toHaveBeenCalledWith(1, 3, {
      leidas: 3,
      encontradas: 2,
      clientes: 1,
    });
  });

  it('en prueba (empresa compartida con otros integradores) solo lee las facturas que emitió Eventia', async () => {
    const { servicio, repo, conexion } = armar({
      ambiente: 'prueba',
      foliosDeEventia: [9999839219, 9999839213],
    });
    jest.spyOn(servicio, 'correr').mockResolvedValue(undefined);
    await servicio.leer(1, POR);
    expect(repo.foliosDeEventia).toHaveBeenCalledWith(1, 'prueba', 33);
    expect(conexion.folios).not.toHaveBeenCalled();
    expect(repo.empezar).toHaveBeenCalledWith(1, POR, [9999839219, 9999839213]);
  });

  it('con facturacion.cl simulado o sin conexión no se lee, y lo dice', async () => {
    await expect(
      armar({ ambiente: 'simulado' }).servicio.leer(1, POR),
    ).rejects.toThrow(BadRequestException);
    await expect(
      armar({ sinConexion: 'Faltan las credenciales' }).servicio.leer(1, POR),
    ).rejects.toThrow('Faltan las credenciales');
    expect(
      await armar({ ambiente: 'simulado' }).servicio.estado(1),
    ).toMatchObject({
      se_puede_leer: false,
    });
  });

  it('una lectura a la vez', async () => {
    const { servicio } = armar({
      ultima: { id: 2, estado: 'leyendo', empezo_en: new Date().toISOString() },
    });
    await expect(servicio.leer(1, POR)).rejects.toThrow(ConflictException);
  });

  it('si facturacion.cl deja de responder, la lectura queda «fallo» con lo que se alcanzó', async () => {
    const caida = new Error('facturacion.cl no responde');
    const { servicio, repo } = armar({
      siguiente: 7,
      pdfs: new Map<number, Buffer | null | Error>([
        [6, pdfComoFacturacionCl(PRODUCCION)],
        [5, caida],
        [4, caida],
        [3, caida],
        [2, caida],
        [1, caida],
      ]),
    });
    const correr = jest.spyOn(servicio, 'correr');
    await servicio.leer(1, POR);
    await correr.mock.results[0].value;
    expect(repo.terminar).toHaveBeenCalledWith(
      1,
      3,
      { leidas: 1, encontradas: 1, clientes: 1 },
      expect.stringContaining(
        'facturacion.cl dejó de responder en la factura N° 1',
      ),
    );
  });
});
