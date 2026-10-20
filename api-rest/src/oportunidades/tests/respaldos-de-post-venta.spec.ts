import { BadRequestException } from '@nestjs/common';
import type { PinoLogger } from 'nestjs-pino';
import { mockPinoLogger } from 'src/testing/mocks';
import type {
  DocumentosDeUnEvento,
  EventiaRepository,
} from '../eventia/eventia.repository';
import type { LeerRespaldoService } from '../oferente/leer-respaldo.service';
import type { OferenteRepository } from '../oferente/oferente.repository';
import {
  archivoDeLaRuta,
  documentosParaLeer,
  mismoNumero,
  nombreDelRespaldo,
  respaldosDePostVenta,
  yaEsta,
} from '../oferente/respaldos-de-post-venta';
import { RespaldosDePostVentaService } from '../oferente/respaldos-de-post-venta.service';

// LOS RESPALDOS DE POST-VENTA (decisión 45, 19-10). Felipe: "debería el
// motor, a la hora de generar la licitación, evaluar si tiene experiencia
// suficiente o debe ir a post venta a buscar respaldos... traer desde
// Eventia es raro, si estamos en Eventia". Al armar la postulación, el motor
// lee las facturas y órdenes de compra de los eventos hechos que no están en
// «Mi empresa»; no copia nada.

const RUTA = 'c1/event-documents/q-1';

const evento = (
  numero: number,
  documentos: Array<
    [DocumentosDeUnEvento['documentos'][number]['categoria'], string, string]
  >,
  cliente: string | null = 'Municipalidad de Quillón',
  fecha = '2026-08-10',
): DocumentosDeUnEvento => ({
  numero,
  fecha,
  cliente,
  documentos: documentos.map(([categoria, nombre, archivo], i) => ({
    id: numero * 10 + i,
    categoria,
    nombre,
    ruta: `${RUTA}/${categoria}/2026-08-10T22-05-40-004Z_${archivo}`,
  })),
});

describe('Las reglas de los respaldos de Post-venta', () => {
  it('en qué orden se prueban: las órdenes de compra primero, después las facturas; solo PDF o foto, y hasta 3', () => {
    const nombres = (e: DocumentosDeUnEvento) =>
      documentosParaLeer(e).map((d) => d.nombre);
    expect(
      nombres(
        evento(473, [
          ['facturas', 'Factura 347.pdf', 'Factura_347.pdf'],
          ['ordenes_compra', 'Orden de compra', '5040-126-TD26.pdf'],
        ]),
      ),
    ).toEqual(['Orden de compra', 'Factura 347.pdf']);
    expect(
      nombres(
        evento(400, [
          ['ordenes_compra', 'OC.docx', 'OC.docx'],
          ['facturas', '368.pdf', '368.pdf'],
        ]),
      ),
    ).toEqual(['368.pdf']);
    expect(
      nombres(
        evento(481, [
          ['ordenes_compra', '1 de 3', 'a.pdf'],
          ['ordenes_compra', '2 de 3', 'b.pdf'],
          ['ordenes_compra', '3 de 3', 'c.pdf'],
          ['facturas', 'Factura', 'd.pdf'],
        ]),
      ),
    ).toEqual(['1 de 3', '2 de 3', '3 de 3']);
  });

  it('el nombre del archivo sale de la ruta, sin el sello de hora', () => {
    expect(
      archivoDeLaRuta(
        'c1/event-documents/q/ordenes_compra/2026-07-29T19-40-06-104Z_1213301-49-AG26.pdf',
      ),
    ).toBe('1213301-49-AG26.pdf');
  });

  it('ya está si un documento del evento lleva el número de un respaldo de «Mi empresa» (no un número dentro de otro)', () => {
    const e415 = evento(415, [
      ['facturas', '345.pdf', '345.pdf'],
      ['ordenes_compra', '1213301-49-AG26.pdf', '1213301-49-AG26.pdf'],
    ]);
    expect(yaEsta(e415, [{ numero: '1213301-49-AG26' }])).toBe(true);
    expect(yaEsta(e415, [{ numero: '34' }, { numero: '49' }])).toBe(false);
    const e473 = evento(473, [
      ['ordenes_compra', 'Orden de compra', '5040-126-TD26.pdf'],
    ]);
    expect(yaEsta(e473, [{ numero: '5040-126-td26' }])).toBe(true);
  });

  it('el mismo número sin espacios, mayúsculas ni ceros a la izquierda; y su nombre', () => {
    expect(mismoNumero('5040-126-td26', ' 5040-126-TD26')).toBe(true);
    expect(mismoNumero('00345', '345')).toBe(true);
    expect(mismoNumero('', '')).toBe(false);
    expect(nombreDelRespaldo('orden_de_compra', '5040-126-TD26', 'pdf')).toBe(
      'Orden de compra 5040-126-TD26.pdf',
    );
    expect(nombreDelRespaldo('factura', ' 347/A ', 'jpg')).toBe(
      'Factura 347-A.jpg',
    );
  });

  it('lo anotado en el trabajo de los anexos se lee con cuidado: solo de la empresa y completo', () => {
    const bueno = {
      numero: '347',
      mandante: 'ILUSTRE MUNICIPALIDAD DE QUILLON',
      contrato: 'Almuerzo',
      anio: 2026,
      monto: 1_245_000,
      fuente: 'manual',
      evento: 473,
      archivo: 'Factura 347.pdf',
      ruta: 'c1/event-documents/q-473/facturas/x_347.pdf',
      bytes: 900,
    };
    expect(
      respaldosDePostVenta(
        {
          monto_total: 1,
          post_venta: [
            bueno,
            // De otra empresa, sin número o sin evento: fuera.
            { ...bueno, ruta: 'c7/event-documents/q/facturas/x.pdf' },
            { ...bueno, ruta: 'c1/oportunidades/40/postulacion/x.pdf' },
            { ...bueno, numero: '' },
            { ...bueno, evento: null },
          ],
        },
        1,
      ),
    ).toEqual([bueno]);
    expect(respaldosDePostVenta(null, 1)).toEqual([]);
    expect(respaldosDePostVenta({ post_venta: 'x' }, 1)).toEqual([]);
  });
});

type Lectura = Awaited<ReturnType<LeerRespaldoService['leer']>>;

const lectura = (
  numero: string,
  tipo: Lectura['tipo'] = 'orden_de_compra',
  extra: Partial<Lectura> = {},
): Lectura => ({
  datos: {
    numero,
    mandante: 'ILUSTRE MUNICIPALIDAD DE QUILLON',
    contrato: 'Almuerzo',
    anio: 2026,
    monto: 1_245_000,
    fuente: tipo === 'orden_de_compra' ? 'mercado_publico' : 'manual',
  },
  aviso: null,
  tipo,
  ...extra,
});

function armar(
  eventos: DocumentosDeUnEvento[],
  carpeta: Array<{ numero: string }> = [],
) {
  const eventia = {
    documentosDeExperiencia: jest.fn().mockResolvedValue(eventos),
    descargarDocumento: jest
      .fn()
      .mockImplementation((_c: number, ruta: string) =>
        Promise.resolve(Buffer.from(`%PDF ${ruta}`)),
      ),
  };
  const repo = {
    respaldos: jest.fn().mockResolvedValue(
      carpeta.map((r) => ({
        mandante: null,
        contrato: null,
        anio: 2026,
        monto: null,
        fuente: 'mercado_publico',
        archivo: `OC ${r.numero}.pdf`,
        ...r,
      })),
    ),
  };
  const lector = { leer: jest.fn() };
  const servicio = new RespaldosDePostVentaService(
    eventia as unknown as EventiaRepository,
    repo as unknown as OferenteRepository,
    lector as unknown as LeerRespaldoService,
    mockPinoLogger() as unknown as PinoLogger,
  );
  return { eventia, repo, lector, servicio };
}

describe('Los respaldos de Post-venta al armar la postulación', () => {
  it('lee lo que falta en «Mi empresa», sin repetir (por nombre o por número), y no copia nada', async () => {
    const { eventia, lector, servicio } = armar(
      [
        // Ya está: su orden se llama con el número de uno de la carpeta.
        evento(415, [
          ['ordenes_compra', '1213301-49-AG26.pdf', '1213301-49-AG26.pdf'],
        ]),
        // Nuevo.
        evento(473, [
          ['facturas', 'Factura 347.pdf', 'Factura_347.pdf'],
          ['ordenes_compra', 'Orden de compra', '5040-126-TD26.pdf'],
        ]),
        // Ya está, pero se sabe al leerlo.
        evento(400, [
          ['ordenes_compra', 'Seminaro de flores - OC.pdf', 'OC.pdf'],
        ]),
      ],
      [{ numero: '1213301-49-AG26' }, { numero: '5043-27-AG26' }],
    );
    lector.leer.mockImplementation((_c: number, a: { originalname: string }) =>
      Promise.resolve(
        a.originalname === 'OC.pdf'
          ? lectura('5043-27-AG26')
          : lectura('5040-126-TD26'),
      ),
    );

    const r = await servicio.paraLaPostulacion(1);

    expect(r).toEqual([
      {
        numero: '5040-126-TD26',
        mandante: 'ILUSTRE MUNICIPALIDAD DE QUILLON',
        contrato: 'Almuerzo',
        anio: 2026,
        monto: 1_245_000,
        fuente: 'mercado_publico',
        evento: 473,
        archivo: 'Orden de compra 5040-126-TD26.pdf',
        ruta: `${RUTA}/ordenes_compra/2026-08-10T22-05-40-004Z_5040-126-TD26.pdf`,
        bytes: expect.any(Number),
      },
    ]);
    expect(eventia.documentosDeExperiencia).toHaveBeenCalledWith(
      1,
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    );
    // El 415 ni se baja ni se lee.
    expect(eventia.descargarDocumento).toHaveBeenCalledTimes(2);
    expect(lector.leer).toHaveBeenCalledWith(1, {
      originalname: '5040-126-TD26.pdf',
      buffer: expect.any(Buffer),
      size: expect.any(Number),
    });
  });

  it('si el primer documento no es orden ni factura (o no se lee, o es de otro proveedor), prueba el siguiente; si ninguno sirve, el evento no va', async () => {
    const { lector, eventia, servicio } = armar([
      evento(423, [
        ['ordenes_compra', 'Informe Crece 2026.pdf', 'Informe.pdf'],
        ['ordenes_compra', 'Orden ajena', 'ajena.pdf'],
        ['ordenes_compra', 'Orden de compra', '1213301-49-AG26.pdf'],
      ]),
      evento(483, [['facturas', 'FA-373 .pdf', 'FA-373_.pdf']]),
      evento(476, [['facturas', 'Factura 348.pdf', 'Factura_348.pdf']]),
    ]);
    lector.leer.mockImplementation(
      (_c: number, a: { originalname: string }) => {
        if (a.originalname === 'Informe.pdf') {
          return Promise.resolve(lectura('', 'otro'));
        }
        if (a.originalname === 'ajena.pdf') {
          return Promise.resolve(
            lectura('1234-5-AG26', 'orden_de_compra', {
              aviso:
                'Esta orden de compra es de otro proveedor (RUT 76.000.000-1).',
            }),
          );
        }
        if (a.originalname === 'FA-373_.pdf') {
          return Promise.reject(
            new BadRequestException('No encontré el número.'),
          );
        }
        return Promise.resolve(lectura('1213301-49-AG26'));
      },
    );
    eventia.descargarDocumento.mockImplementation((_c: number, ruta: string) =>
      ruta.endsWith('Factura_348.pdf')
        ? Promise.reject(new Error('Object not found'))
        : Promise.resolve(Buffer.from('%PDF')),
    );
    const r = await servicio.paraLaPostulacion(1);
    expect(r.map((x) => [x.evento, x.numero])).toEqual([
      [423, '1213301-49-AG26'],
    ]);
    expect(lector.leer).toHaveBeenCalledTimes(4);
  });

  it('dos eventos con el mismo número: va uno; de más de 4 años, no se mira', async () => {
    const { lector, servicio } = armar([
      evento(486, [['facturas', 'Factura delegación', '366.pdf']]),
      evento(487, [['facturas', 'Factura expositor', '366-b.pdf']]),
      evento(12, [['facturas', 'Vieja', 'vieja.pdf']], 'Antiguo', '2019-05-01'),
    ]);
    lector.leer.mockResolvedValue(lectura('366', 'factura'));
    const r = await servicio.paraLaPostulacion(1);
    expect(r).toHaveLength(1);
    expect(lector.leer).toHaveBeenCalledTimes(2);
  });

  it('de a 30 eventos por vez, los más nuevos', async () => {
    const eventos = Array.from({ length: 32 }, (_, i) =>
      evento(500 + i, [['facturas', `${i}.pdf`, `${i}.pdf`]]),
    );
    const { lector, servicio } = armar(eventos);
    let n = 0;
    lector.leer.mockImplementation(() =>
      Promise.resolve(lectura(String(1000 + n++), 'factura')),
    );
    const r = await servicio.paraLaPostulacion(1);
    expect(r).toHaveLength(30);
    expect(r[0].evento).toBe(500);
  });
});
