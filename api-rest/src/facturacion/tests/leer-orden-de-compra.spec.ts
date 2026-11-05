import type Anthropic from '@anthropic-ai/sdk';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { mockPinoLogger } from '../../testing/mocks';
import { propuestaDeLaLectura } from '../ordenes-de-compra/leer-orden-de-compra';
import { LeerOrdenDeCompraService } from '../ordenes-de-compra/leer-orden-de-compra.service';

/**
 * BELIA LEE UNA ORDEN DE COMPRA (doc 19, paso 2b). El caso es real: la OC
 * 3 de 3 del evento #481, que el Instituto Profesional Santo Tomás le emitió
 * a Valle del Sol Quillón SpA.
 */
const VALLE_DEL_SOL = {
  nombre: 'Valle del Sol Quillón SpA',
  rut: '77.701.305-K',
};

const LEIDA = {
  es_orden_de_compra: true,
  numero: '32000066941',
  fecha: '2026-10-14',
  rut_comprador: '65.175.239-6',
  razon_social_comprador: 'Corporación Instituto Profesional Santo Tomás',
  giro_comprador: '853201-ENSEÑANZA SUPERIOR EN INSTITUTOS PROFESIONALES',
  direccion_comprador: 'Av. Vicuña Mackenna 4835',
  comuna_comprador: 'San Joaquín',
  ciudad_comprador: 'Santiago de Chile',
  detalle: 'Fiesta de Navidad Santo Tomás 2026, adultos 78 y niños 23',
  neto: 0,
  iva: 0,
  total: 4405023,
  otras_referencias: [],
};

describe('Lo que BelIA propone de una OC', () => {
  it('el comprador, limpio: el RUT sin puntos y lo que no trae, en null', () => {
    expect(propuestaDeLaLectura(LEIDA, VALLE_DEL_SOL)).toEqual({
      propuesta: {
        numero: '32000066941',
        fecha: '2026-10-14',
        rut: '65175239-6',
        razon_social: 'Corporación Instituto Profesional Santo Tomás',
        descripcion:
          'Fiesta de Navidad Santo Tomás 2026, adultos 78 y niños 23',
        neto: null,
        iva: null,
        total: 4405023,
        giro: '853201-ENSEÑANZA SUPERIOR EN INSTITUTOS PROFESIONALES',
        direccion: 'Av. Vicuña Mackenna 4835',
        comuna: 'San Joaquín',
        ciudad: 'Santiago de Chile',
        otras_referencias: [],
      },
      avisos: [],
    });
  });

  it('si lee el RUT de la propia empresa, no lo usa y lo dice', () => {
    const leido = propuestaDeLaLectura(
      { ...LEIDA, rut_comprador: '77701305-K' },
      VALLE_DEL_SOL,
    );
    expect(leido?.propuesta.rut).toBeNull();
    expect(leido?.avisos).toEqual([
      'BelIA leyó el RUT de la propia empresa: revisa quién emite la OC.',
    ]);
  });

  it('un RUT mal leído no se usa', () => {
    const leido = propuestaDeLaLectura(
      { ...LEIDA, rut_comprador: '65.175.239-5' },
      VALLE_DEL_SOL,
    );
    expect(leido?.propuesta.rut).toBeNull();
    expect(leido?.avisos).toEqual([
      'El RUT leído (65.175.239-5) no es válido: revísalo.',
    ]);
  });

  it('el neto y el IVA tienen que cuadrar con el total (L17)', () => {
    const leido = propuestaDeLaLectura(
      { ...LEIDA, neto: 2201621, iva: 418308, total: 2619930 },
      VALLE_DEL_SOL,
    );
    expect(leido?.avisos).toEqual([
      'El neto y el IVA de la OC suman 2619929 y el total dice 2619930: revísalo.',
    ]);
  });

  it('lo que falta se pide, y un N° de más de 18 se avisa', () => {
    const leido = propuestaDeLaLectura(
      {
        ...LEIDA,
        numero: '1234567890123456789',
        fecha: '14-10-2026',
        rut_comprador: '',
        total: 0,
      },
      VALLE_DEL_SOL,
    );
    expect(leido?.avisos).toEqual([
      'El N° de la OC pasa de 18 caracteres: el SII no lo acepta en la referencia. Revísalo.',
      'No se leyó la fecha de la OC: complétala.',
      'No se leyó el RUT de quien emite la OC: complétalo.',
      'No se leyó el total de la OC: complétalo.',
    ]);
  });

  it('lo que no es una OC, o no trae su N°, no se propone', () => {
    expect(
      propuestaDeLaLectura(
        { ...LEIDA, es_orden_de_compra: false },
        VALLE_DEL_SOL,
      ),
    ).toBeNull();
    expect(
      propuestaDeLaLectura({ ...LEIDA, numero: '' }, VALLE_DEL_SOL),
    ).toBeNull();
  });

  it('la nota de pedido que menciona la OC viaja aparte (CCU)', () => {
    const leido = propuestaDeLaLectura(
      {
        ...LEIDA,
        otras_referencias: [{ tipo: 'nota_de_pedido', numero: '4505440173' }],
      },
      VALLE_DEL_SOL,
    );
    expect(leido?.propuesta.otras_referencias).toEqual([
      { tipo: 'nota_de_pedido', numero: '4505440173' },
    ]);
  });
});

describe('Leer con BelIA una OC de Documentos', () => {
  const PDF = Buffer.from('%PDF-1.4 la OC');

  class LectorDePrueba extends LeerOrdenDeCompraService {
    constructor(
      repo: never,
      private readonly parse: jest.Mock,
    ) {
      super(repo, mockPinoLogger() as never);
    }
    protected cliente(): Anthropic {
      return { messages: { parse: this.parse } } as unknown as Anthropic;
    }
  }

  const armar = ({
    deLaEmpresa = true,
    documento = {
      id: 261,
      file_url: 'c1/event-documents/ev-481/ordenes_compra/2026-10-17_3de3.pdf',
      file_name: '3 de 3',
      category: 'ordenes_compra',
    } as object | null,
    yaCargadas = [] as { numero: string }[],
  } = {}) => {
    const repo = {
      cotizacionDeLaEmpresa: jest.fn().mockResolvedValue(deLaEmpresa),
      documentoDelEvento: jest.fn().mockResolvedValue(documento),
      descargar: jest.fn().mockResolvedValue(PDF),
      empresaQueVende: jest.fn().mockResolvedValue(VALLE_DEL_SOL),
      deCotizacion: jest.fn().mockResolvedValue(yaCargadas),
    };
    const parse = jest.fn().mockResolvedValue({
      parsed_output: LEIDA,
      usage: { input_tokens: 3000, output_tokens: 200 },
    });
    return { repo, parse, lector: new LectorDePrueba(repo as never, parse) };
  };

  const antes = process.env.ANTHROPIC_API_KEY;
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'de-prueba';
  });
  afterAll(() => {
    process.env.ANTHROPIC_API_KEY = antes;
  });

  it('baja el PDF del evento, se lo pasa a Haiku y devuelve la propuesta', async () => {
    const { repo, parse, lector } = armar();
    const leido = await lector.leer('ev-481', 1, 261);
    expect(repo.descargar).toHaveBeenCalledWith(
      'c1/event-documents/ev-481/ordenes_compra/2026-10-17_3de3.pdf',
    );
    const pedido = (parse.mock.calls as unknown[][])[0][0] as {
      model: string;
      system: string;
      messages: { content: { type: string }[] }[];
    };
    expect(pedido.model).toBe('claude-haiku-5-5');
    expect(pedido.system).toContain(
      'Valle del Sol Quillón SpA (RUT 77.701.305-K)',
    );
    expect(pedido.messages[0].content[0].type).toBe('document');
    expect(leido.propuesta.rut).toBe('65175239-6');
    expect(leido.documento_id).toBe(261);
  });

  it('avisa si esa OC ya está cargada en el evento', async () => {
    const { lector } = armar({ yaCargadas: [{ numero: '32000066941' }] });
    const leido = await lector.leer('ev-481', 1, 261);
    expect(leido.avisos[0]).toBe(
      'La OC N° 32000066941 ya está cargada en este evento.',
    );
  });

  it('el evento de otra empresa, o un PDF que no es del evento, no se leen', async () => {
    const ajeno = armar({ deLaEmpresa: false });
    await expect(ajeno.lector.leer('ajeno', 1, 261)).rejects.toThrow(
      NotFoundException,
    );
    const sinDoc = armar({ documento: null });
    await expect(sinDoc.lector.leer('ev-481', 1, 999)).rejects.toThrow(
      NotFoundException,
    );
    expect(ajeno.parse).not.toHaveBeenCalled();
    expect(sinDoc.parse).not.toHaveBeenCalled();
  });

  it('un archivo de otra empresa no se baja', async () => {
    const { repo, lector } = armar({
      documento: {
        id: 261,
        file_url: 'c7/event-documents/x/3de3.pdf',
        file_name: '3 de 3',
        category: 'ordenes_compra',
      },
    });
    await expect(lector.leer('ev-481', 1, 261)).rejects.toThrow(
      BadRequestException,
    );
    expect(repo.descargar).not.toHaveBeenCalled();
  });

  it('lo que no es una OC se dice con palabras', async () => {
    const { parse, lector } = armar();
    parse.mockResolvedValue({
      parsed_output: { ...LEIDA, es_orden_de_compra: false },
      usage: {},
    });
    await expect(lector.leer('ev-481', 1, 261)).rejects.toThrow(
      'Ese documento no parece una orden de compra, o no trae su N°: cárgala a mano.',
    );
  });
});
