import { BadRequestException } from '@nestjs/common';
import type { PinoLogger } from 'nestjs-pino';
import { mockPinoLogger } from 'src/testing/mocks';
import type {
  DocumentosDeUnEvento,
  EventiaRepository,
} from '../eventia/eventia.repository';
import type { LeerRespaldoService } from '../oferente/leer-respaldo.service';
import type { OferenteRepository } from '../oferente/oferente.repository';
import type { OferenteService } from '../oferente/oferente.service';
import {
  datosDeRespaldo,
  type DatosDeRespaldo,
  soloLosDatos,
} from '../oferente/respaldo';
import {
  archivoDeLaRuta,
  elegirDocumento,
  mismoNumero,
  nombreDelRespaldo,
  yaEsta,
} from '../oferente/respaldos-de-eventia';
import { RespaldosDeEventiaService } from '../oferente/respaldos-de-eventia.service';

// «TRAER DE EVENTIA» (decisión 45, 19-10). Felipe: "buscar en Eventia y
// terminar de armar ese archivo con experiencia relevante y los respaldos
// que o están en Eventia o están en mi empresa". Las facturas y órdenes de
// compra de los eventos hechos pasan a «Mi empresa» como respaldos, uno por
// evento y sin repetir.

const RUTA = 'c1/event-documents/q-1';

const evento = (
  numero: number,
  documentos: Array<
    [DocumentosDeUnEvento['documentos'][number]['categoria'], string, string]
  >,
  cliente: string | null = 'Municipalidad de Quillón',
): DocumentosDeUnEvento => ({
  numero,
  fecha: '2026-08-10',
  cliente,
  documentos: documentos.map(([categoria, nombre, archivo], i) => ({
    id: numero * 10 + i,
    categoria,
    nombre,
    ruta: `${RUTA}/${categoria}/2026-08-10T22-05-40-004Z_${archivo}`,
  })),
});

const respaldo = (
  numero: string,
  extra: Partial<DatosDeRespaldo> & { id?: number } = {},
) => ({
  numero,
  mandante: 'ILUSTRE MUNICIPALIDAD DE QUILLON',
  contrato: null,
  anio: 2026,
  monto: 1_500_000,
  fuente: 'mercado_publico' as const,
  archivo: `Orden de compra ${numero}.pdf`,
  id: 1,
  ...extra,
});

describe('Las reglas para traer respaldos de Eventia', () => {
  it('uno por evento: la orden de compra si hay, si no la factura; solo PDF o foto', () => {
    const conOrden = evento(473, [
      ['facturas', 'Factura 347.pdf', 'Factura_347.pdf'],
      ['ordenes_compra', 'Orden de compra', '5040-126-TD26.pdf'],
    ]);
    expect(elegirDocumento(conOrden)?.nombre).toBe('Orden de compra');
    const soloFactura = evento(394, [['facturas', '344.pdf', '344.pdf']]);
    expect(elegirDocumento(soloFactura)?.nombre).toBe('344.pdf');
    // Una orden en Word no se lee: va la factura.
    const ordenEnWord = evento(400, [
      ['ordenes_compra', 'OC.docx', 'OC.docx'],
      ['facturas', '368.pdf', '368.pdf'],
    ]);
    expect(elegirDocumento(ordenEnWord)?.nombre).toBe('368.pdf');
    expect(
      elegirDocumento(
        evento(1, [['facturas', 'Factura.xlsx', 'Factura.xlsx']]),
      ),
    ).toBeNull();
  });

  it('el nombre del archivo sale de la ruta, sin el sello de hora', () => {
    expect(
      archivoDeLaRuta(
        'c1/event-documents/q/ordenes_compra/2026-07-29T19-40-06-104Z_1213301-49-AG26.pdf',
      ),
    ).toBe('1213301-49-AG26.pdf');
  });

  it('ya está si se trajo de ese evento o si un documento suyo lleva el número de un respaldo', () => {
    const e415 = evento(415, [
      ['facturas', '345.pdf', '345.pdf'],
      ['ordenes_compra', '1213301-49-AG26.pdf', '1213301-49-AG26.pdf'],
    ]);
    // La orden del 415 ya estaba subida a mano en «Mi empresa».
    expect(yaEsta(e415, [{ numero: '1213301-49-AG26' }])).toBe(true);
    expect(yaEsta(e415, [{ numero: '9999-1-AG26', evento: 415 }])).toBe(true);
    // El número dentro de otro no cuenta: 34 no es 345, ni 49 es la orden.
    expect(yaEsta(e415, [{ numero: '34' }, { numero: '49' }])).toBe(false);
    // Por el nombre en el balde, aunque el nombre que se ve sea otro.
    const e473 = evento(473, [
      ['ordenes_compra', 'Orden de compra', '5040-126-TD26.pdf'],
    ]);
    expect(yaEsta(e473, [{ numero: '5040-126-td26' }])).toBe(true);
  });

  it('el mismo número sin espacios, mayúsculas ni ceros a la izquierda', () => {
    expect(mismoNumero('5040-126-td26', ' 5040-126-TD26')).toBe(true);
    expect(mismoNumero('00345', '345')).toBe(true);
    expect(mismoNumero('345', '346')).toBe(false);
    expect(mismoNumero('', '')).toBe(false);
  });

  it('se llama como lo que es, con su número', () => {
    expect(nombreDelRespaldo('orden_de_compra', '5040-126-TD26', 'pdf')).toBe(
      'Orden de compra 5040-126-TD26.pdf',
    );
    expect(nombreDelRespaldo('factura', ' 347/A ', 'jpg')).toBe(
      'Factura 347-A.jpg',
    );
  });

  it('el evento viaja en los datos del respaldo, y lo que se guarda son solo los datos', () => {
    expect(
      datosDeRespaldo(JSON.stringify({ numero: '347', evento: 473 })),
    ).toEqual({
      numero: '347',
      mandante: null,
      contrato: null,
      anio: null,
      monto: null,
      fuente: 'manual',
      evento: 473,
    });
    expect(
      datosDeRespaldo(JSON.stringify({ numero: '347', evento: 'x' })),
    ).not.toHaveProperty('evento');
    expect(soloLosDatos(respaldo('345', { evento: 415 }))).toEqual({
      numero: '345',
      mandante: 'ILUSTRE MUNICIPALIDAD DE QUILLON',
      contrato: null,
      anio: 2026,
      monto: 1_500_000,
      fuente: 'mercado_publico',
      evento: 415,
    });
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
  respaldos: ReturnType<typeof respaldo>[] = [],
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
    respaldos: jest.fn().mockResolvedValue(respaldos),
    anotarEvento: jest.fn().mockResolvedValue(undefined),
  };
  const oferente = {
    subirDocumento: jest.fn().mockResolvedValue({ id: 99 }),
  };
  const lector = { leer: jest.fn() };
  const servicio = new RespaldosDeEventiaService(
    eventia as unknown as EventiaRepository,
    repo as unknown as OferenteRepository,
    oferente as unknown as OferenteService,
    lector as unknown as LeerRespaldoService,
    mockPinoLogger() as unknown as PinoLogger,
  );
  return { eventia, repo, oferente, lector, servicio };
}

describe('Traer de Eventia', () => {
  it('trae lo que falta, sin repetir lo que ya estaba (por nombre o por número)', async () => {
    const { eventia, repo, oferente, lector, servicio } = armar(
      [
        // Ya estaba: su orden se llama con el número de un respaldo.
        evento(415, [
          ['ordenes_compra', '1213301-49-AG26.pdf', '1213301-49-AG26.pdf'],
        ]),
        // Nuevo: su orden pasa a «Mi empresa».
        evento(473, [
          ['facturas', 'Factura 347.pdf', 'Factura_347.pdf'],
          ['ordenes_compra', 'Orden de compra', '5040-126-TD26.pdf'],
        ]),
        // Ya estaba, pero se sabe al leerlo: se anota de qué evento es.
        evento(400, [
          ['ordenes_compra', 'Seminaro de flores - OC.pdf', 'OC.pdf'],
        ]),
      ],
      [
        respaldo('1213301-49-AG26', { id: 21 }),
        respaldo('5043-27-AG26', { id: 19 }),
      ],
    );
    lector.leer.mockImplementation((_c: number, a: { originalname: string }) =>
      Promise.resolve(
        a.originalname === 'OC.pdf'
          ? lectura('5043-27-AG26')
          : lectura('5040-126-TD26'),
      ),
    );

    const r = await servicio.traer(1, 'cuenta-1');

    expect(r).toEqual({ traidos: 1, ya_estaban: 2, sin_traer: [] });
    expect(eventia.documentosDeExperiencia).toHaveBeenCalledWith(
      1,
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    );
    // El 415 ni se baja ni se lee.
    expect(eventia.descargarDocumento).toHaveBeenCalledTimes(2);
    expect(lector.leer).toHaveBeenCalledTimes(2);
    expect(lector.leer).toHaveBeenCalledWith(1, {
      originalname: '5040-126-TD26.pdf',
      buffer: expect.any(Buffer),
      size: expect.any(Number),
    });
    const [empresa, cuenta, archivo, dto] = oferente.subirDocumento.mock
      .calls[0] as [
      number,
      string,
      { originalname: string },
      { tipo: string; datos: string },
    ];
    expect([empresa, cuenta, archivo.originalname, dto.tipo]).toEqual([
      1,
      'cuenta-1',
      'Orden de compra 5040-126-TD26.pdf',
      'respaldo_experiencia',
    ]);
    expect(JSON.parse(dto.datos)).toEqual({
      numero: '5040-126-TD26',
      mandante: 'ILUSTRE MUNICIPALIDAD DE QUILLON',
      contrato: 'Almuerzo',
      anio: 2026,
      monto: 1_245_000,
      fuente: 'mercado_publico',
      evento: 473,
    });
    // El que ya estaba queda con su evento: la próxima vez no se lee.
    expect(repo.anotarEvento).toHaveBeenCalledWith(1, 19, {
      numero: '5043-27-AG26',
      mandante: 'ILUSTRE MUNICIPALIDAD DE QUILLON',
      contrato: null,
      anio: 2026,
      monto: 1_500_000,
      fuente: 'mercado_publico',
      evento: 400,
    });
  });

  it('dos eventos con el mismo número: se trae una vez', async () => {
    const { oferente, lector, servicio } = armar([
      evento(486, [['facturas', 'Factura delegación', '366.pdf']]),
      evento(487, [['facturas', 'Factura expositor', '366-b.pdf']]),
    ]);
    lector.leer.mockResolvedValue(lectura('366', 'factura'));
    const r = await servicio.traer(1, 'cuenta-1');
    expect(r.traidos).toBe(1);
    expect(r.ya_estaban).toBe(1);
    expect(oferente.subirDocumento).toHaveBeenCalledTimes(1);
  });

  it('lo que no es orden ni factura, la orden de otro proveedor o lo que no se pudo leer no se trae, y se dice por qué', async () => {
    const { oferente, lector, eventia, servicio } = armar([
      evento(
        374,
        [['facturas', 'Cotización joker.pdf', 'cotizacion.pdf']],
        'JOKER SERVICIOS SPA',
      ),
      evento(460, [['ordenes_compra', 'Orden ajena', 'ajena.pdf']]),
      evento(
        483,
        [['facturas', 'FA-373 .pdf', 'FA-373_.pdf']],
        'Corporación ADRA Chile',
      ),
      evento(476, [['facturas', 'Factura 348.pdf', 'Factura_348.pdf']], null),
    ]);
    lector.leer.mockImplementation(
      (_c: number, a: { originalname: string }) => {
        if (a.originalname === 'cotizacion.pdf') {
          return Promise.resolve(lectura('C-1', 'otro'));
        }
        if (a.originalname === 'ajena.pdf') {
          return Promise.resolve(
            lectura('1234-5-AG26', 'orden_de_compra', {
              aviso:
                'Esta orden de compra es de otro proveedor (RUT 76.000.000-1).',
            }),
          );
        }
        return Promise.reject(
          new BadRequestException(
            'No encontré el número de la orden de compra o de la factura: complétalo a mano.',
          ),
        );
      },
    );
    eventia.descargarDocumento.mockImplementation((_c: number, ruta: string) =>
      ruta.endsWith('Factura_348.pdf')
        ? Promise.reject(new Error('Object not found'))
        : Promise.resolve(Buffer.from('%PDF')),
    );

    const r = await servicio.traer(1, 'cuenta-1');

    expect(r.traidos).toBe(0);
    expect(oferente.subirDocumento).not.toHaveBeenCalled();
    expect(r.sin_traer).toEqual(
      expect.arrayContaining([
        'Evento N° 374 (JOKER SERVICIOS SPA): «Cotización joker.pdf» no parece orden de compra ni factura.',
        'Evento N° 460 (Municipalidad de Quillón): Esta orden de compra es de otro proveedor (RUT 76.000.000-1).',
        'Evento N° 483 (Corporación ADRA Chile): No encontré el número de la orden de compra o de la factura: complétalo a mano.',
        'Evento N° 476: Object not found',
      ]),
    );
  });

  it('de a 30 por vez: lo que queda se dice', async () => {
    const eventos = Array.from({ length: 32 }, (_, i) =>
      evento(500 + i, [['facturas', `${i}.pdf`, `${i}.pdf`]]),
    );
    const { lector, servicio } = armar(eventos);
    let n = 0;
    lector.leer.mockImplementation(() =>
      Promise.resolve(lectura(String(1000 + n++), 'factura')),
    );
    const r = await servicio.traer(1, 'cuenta-1');
    expect(r.traidos).toBe(30);
    expect(r.sin_traer).toEqual([
      'Quedan 2 eventos: vuelve a traer para seguir.',
    ]);
  });
});
