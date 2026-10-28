import type Anthropic from '@anthropic-ai/sdk';
import { BadRequestException } from '@nestjs/common';
import type { PinoLogger } from 'nestjs-pino';
import { mockPinoLogger } from 'src/testing/mocks';
import type { AdjuntosRepository } from '../adjuntos/adjuntos.repository';
import type { AnalisisRepository } from '../analisis/analisis.repository';
import { CRITERIO_DE_LA_LEY } from '../analisis/criterios-de-evaluacion';
import {
  actaEnTexto,
  cotizacionesEnTexto,
  instruccionesDelPorQue,
} from '../comparacion/por-que-perdimos';
import { PorQuePerdimosService } from '../comparacion/por-que-perdimos.service';
import type { ResultadosRepository } from '../competencia/resultados.repository';
import type { GeneracionRepository } from '../generacion/generacion.repository';
import type { OferenteRepository } from '../oferente/oferente.repository';
import type { OportunidadesRepository } from '../oportunidades.repository';
import type { ElSetService } from '../postulacion/el-set.service';

// POR QUÉ PERDIMOS (decisión 97 del doc 17, 27-10). Felipe: "abajo está la
// predicción y luego está el por qué perdimos y si el haber perdido era
// razonable o no". Con los criterios de «Cómo te evalúan» (decisión 95).

/** El catamarán, como lo trae el detalle oficial con «Proveedor
 *  seleccionado» (recortado). */
const COTIZANTES = {
  proveedores_cotizando: [
    {
      razon_social: 'BPM EVENTOS SPA',
      rut_proveedor: '76.430.926-k',
      monto_total: 6800000,
      proveedor_seleccionado: 1,
      descripcion: ' oferta todo lo requerido con extras',
      justificacion_inadmisibilidad: null,
      productos_cotizados: [
        {
          nombre_producto: 'Servicios de cocina o preparación de comidas',
          descripcion: 'Servicio de colaciones',
          monto_total_producto: 3600000,
        },
      ],
    },
    {
      razon_social: 'VALLE DEL SOL QUILLON SPA',
      rut_proveedor: '77.701.305-K',
      monto_total: 7090000,
      proveedor_seleccionado: 0,
      descripcion: 'según documentación adjunta',
      justificacion_inadmisibilidad: null,
      productos_cotizados: [
        {
          nombre_producto: 'Servicios de cocina o preparación de comidas',
          descripcion: 'Servicio de colaciones',
          monto_total_producto: 3797983,
        },
      ],
    },
  ],
};

const PUBLICO = {
  tipo: 'compra_agil',
  elegidos: [
    { rut: '76.430.926-k', proveedor: 'BPM EVENTOS SPA', monto: 6800000 },
  ],
  ofertas: [
    {
      rut: '76.430.926-k',
      proveedor: 'BPM EVENTOS SPA',
      monto: 6800000,
      inadmisible: null,
    },
    {
      rut: '77.701.305-K',
      proveedor: 'VALLE DEL SOL QUILLON SPA',
      monto: 7090000,
      inadmisible: null,
    },
  ],
};

describe('lo que lee la IA (decisión 97)', () => {
  it('las cotizaciones de una compra ágil, con la elegida y el precio de cada producto', () => {
    const lineas = cotizacionesEnTexto(COTIZANTES.proveedores_cotizando);
    expect(lineas[0]).toMatch(
      /^- BPM EVENTOS SPA \(ELEGIDA\): \$6\.800\.000 con IVA/,
    );
    expect(lineas[1]).toContain(
      'Servicios de cocina o preparación de comidas: $3.600.000',
    );
    expect(lineas[2]).toMatch(/^- VALLE DEL SOL QUILLON SPA: \$7\.090\.000/);
    expect(cotizacionesEnTexto(null)).toEqual([]);
  });

  it('el acta de una licitación, línea por línea', () => {
    expect(
      actaEnTexto({
        informada: null,
        monto_adjudicado: 13352941,
        items: [
          {
            numero: 1,
            producto: 'Producción de eventos',
            especificacion: '',
            cantidad: 1,
            ofertas: [
              {
                rut: '77.067.895-1',
                proveedor: 'Sol de Quillón',
                detalle: '',
                precio_unitario: 11220959,
                cantidad_adjudicada: 1,
                total_adjudicado: 13352941,
                adjudicada: true,
              },
              {
                rut: '77.701.305-K',
                proveedor: 'Valle del Sol',
                detalle: '',
                precio_unitario: 11228021,
                cantidad_adjudicada: 0,
                total_adjudicado: 0,
                adjudicada: false,
              },
            ],
          },
        ],
      }),
    ).toEqual([
      '- Línea 1: Producción de eventos (1)',
      '   · Sol de Quillón (ADJUDICADA): $11.220.959 neto por unidad, total adjudicado $13.352.941',
      '   · Valle del Sol: $11.228.021 neto por unidad',
    ]);
  });

  it('las instrucciones dicen el resultado, los criterios y, si es la ley, lo que obliga al comprador', () => {
    const texto = instruccionesDelPorQue({
      codigo: '1346350-37-COT26',
      nombre: 'Catamarán',
      organismo: 'MUNICIPALIDAD DE QUILLÓN',
      tipo: 'compra_agil',
      empresa: 'VALLE DEL SOL QUILLON SPA',
      criterios: [CRITERIO_DE_LA_LEY],
      resultado: {
        tipo: 'compra_agil',
        estado: 'perdida',
        proveedor: 'BPM EVENTOS SPA',
        rut_proveedor: '76.430.926-k',
        monto: 6800000,
        mas_elegidos: 0,
        mi_monto: 7090000,
        lugar: 2,
        ofertas: 2,
        era_la_mas_barata: false,
        inadmisible: null,
      },
      cotizaciones: ['- BPM EVENTOS SPA (ELEGIDA): $6.800.000 con IVA'],
      acta: [],
      prediccion: 'Gana BPM por precio.',
    });
    expect(texto).toContain('uso interno');
    expect(texto).toContain(
      'eligieron a BPM EVENTOS SPA por $6.800.000. La empresa ofertó $7.090.000.',
    );
    expect(texto).toContain('1. Menor precio (100%)');
    expect(texto).toContain('Es el criterio de la ley');
    expect(texto).toContain('LAS COTIZACIONES');
    expect(texto).toContain(
      'LO QUE PREDIJO LA COMPARACIÓN ANTES DEL RESULTADO: Gana BPM por precio.',
    );
    expect(texto).not.toContain('EL ACTA');
  });
});

class PorQueDePrueba extends PorQuePerdimosService {
  parse = jest.fn<Promise<unknown>, [{ system: string }]>().mockResolvedValue({
    parsed_output: {
      resumen: 'Eligieron a BPM porque cotizó $290.000 menos.',
      razonable: 'si',
      fundamento: 'Por ley gana la más económica que cumple lo técnico.',
      en_que_se_perdio: [
        { criterio: 'Menor precio', que_paso: 'BPM más barato.' },
      ],
      para_la_proxima: ['Bajar el precio de las colaciones.'],
    },
    usage: { input_tokens: 1000, output_tokens: 200 },
    stop_reason: 'end_turn',
  });
  protected cliente(): Anthropic {
    return { messages: { parse: this.parse } } as unknown as Anthropic;
  }
}

function armar(estado = 'perdida', tipo = 'compra_agil') {
  const repo = {
    abandonarAntesDe: jest.fn().mockResolvedValue(undefined),
    ultimoDeTipo: jest.fn().mockResolvedValue(null),
    crearGeneracion: jest.fn((fila: Record<string, unknown>) =>
      Promise.resolve({ id: 70, estado: 'procesando', ...fila }),
    ),
    terminar: jest.fn().mockResolvedValue(undefined),
    descargar: jest.fn().mockResolvedValue(Buffer.from('%PDF-1.4')),
  };
  const adjuntos = {
    listar: jest.fn().mockResolvedValue([]),
    perfilDe: jest.fn().mockResolvedValue('perfil-1'),
  };
  const oportunidades = {
    ficha: jest.fn().mockResolvedValue({
      id: 3219,
      codigo: '1346350-37-COT26',
      estado,
      proceso: {
        tipo,
        nombre: 'Catamarán',
        organismo: 'MUNICIPALIDAD DE QUILLÓN',
      },
    }),
  };
  const analisis = {
    ultimo: jest
      .fn()
      .mockResolvedValue({ estado: 'listo', resultado: { criterios: [] } }),
  };
  const oferente = {
    oferente: jest.fn().mockResolvedValue({
      rut: '77.701.305-K',
      razon_social: 'VALLE DEL SOL QUILLON SPA',
    }),
  };
  const set = { piezas: jest.fn().mockResolvedValue([]) };
  const resultados = {
    resultadosDe: jest
      .fn()
      .mockResolvedValue(new Map([['1346350-37-COT26', PUBLICO]])),
    delProceso: jest
      .fn()
      .mockResolvedValue({ cotizantes: COTIZANTES, acta: null }),
    perdidasRecientes: jest
      .fn()
      .mockResolvedValue([{ id: 3219, codigo: '1346350-37-COT26' }]),
  };
  const servicio = new PorQueDePrueba(
    repo as unknown as GeneracionRepository,
    adjuntos as unknown as AdjuntosRepository,
    oportunidades as unknown as OportunidadesRepository,
    analisis as unknown as AnalisisRepository,
    oferente as unknown as OferenteRepository,
    set as unknown as ElSetService,
    resultados as unknown as ResultadosRepository,
    mockPinoLogger() as unknown as PinoLogger,
  );
  return { repo, adjuntos, oportunidades, analisis, resultados, servicio };
}

/** Lo que sigue por detrás: espera a que termine. */
const hastaQue = async (listo: () => boolean) => {
  for (let i = 0; i < 50 && !listo(); i++) {
    await new Promise((r) => setImmediate(r));
  }
};

const LLAVE = process.env.ANTHROPIC_API_KEY;
beforeAll(() => {
  process.env.ANTHROPIC_API_KEY = 'llave-de-prueba';
});
afterAll(() => {
  process.env.ANTHROPIC_API_KEY = LLAVE;
});

describe('PorQuePerdimosService (decisión 97)', () => {
  it('una compra ágil perdida: lee las cotizaciones con el criterio de la ley y deja el por qué', async () => {
    const { repo, servicio } = armar();

    const fila = await servicio.pedir(1, null, 3219);
    expect(fila.estado).toBe('procesando');
    expect(repo.crearGeneracion).toHaveBeenCalledWith(
      expect.objectContaining({
        tipo: 'por_que',
        pedido_por: null,
        parametros: {
          ganador: 'BPM EVENTOS SPA',
          monto: 6800000,
          mi_monto: 7090000,
        },
      }),
    );
    await hastaQue(() => repo.terminar.mock.calls.length > 0);
    const pedido = servicio.parse.mock.calls[0][0];
    expect(pedido.system).toContain('Es el criterio de la ley');
    expect(pedido.system).toContain('BPM EVENTOS SPA (ELEGIDA)');
    expect(repo.terminar).toHaveBeenCalledWith(
      1,
      70,
      expect.objectContaining({
        estado: 'listo',
        resultado: expect.objectContaining({ razonable: 'si' }),
      }),
    );
  });

  it('solo cuando quedó perdida y ya se sabe a quién eligieron', async () => {
    await expect(
      armar('postulada').servicio.pedir(1, 'cuenta', 3219),
    ).rejects.toThrow(BadRequestException);
    const sinResultado = armar();
    sinResultado.resultados.resultadosDe.mockResolvedValue(new Map());
    await expect(
      sinResultado.servicio.pedir(1, 'cuenta', 3219),
    ).rejects.toThrow(/Todavía no se sabe a quién eligieron/);
  });

  it('una licitación sin la oferta de quien ganó no se puede explicar todavía', async () => {
    const { analisis, resultados, servicio } = armar('perdida', 'licitacion');
    analisis.ultimo.mockResolvedValue({
      estado: 'listo',
      resultado: {
        criterios: [
          { nombre: 'Precio', peso: '60%', como_se_evalua: 'Menor precio' },
        ],
      },
    });
    resultados.resultadosDe.mockResolvedValue(
      new Map([
        [
          '1346350-37-COT26',
          {
            tipo: 'licitacion',
            elegidos: [
              {
                rut: '77067895-1',
                proveedor: 'Sol de Quillón',
                monto: 13352941,
              },
            ],
            ofertas: [],
          },
        ],
      ]),
    );
    resultados.delProceso.mockResolvedValue({ cotizantes: null, acta: null });
    await expect(servicio.pedir(1, null, 3219)).rejects.toThrow(
      /Falta la oferta de quien ganó/,
    );
  });

  it('la vuelta de los resultados lo pide solo para las perdidas sin su por qué', async () => {
    const conPorQue = armar();
    conPorQue.repo.ultimoDeTipo.mockResolvedValue({ id: 9, estado: 'listo' });
    await expect(
      conPorQue.servicio.revisar(1, Date.now() + 60_000),
    ).resolves.toBe(0);
    expect(conPorQue.repo.crearGeneracion).not.toHaveBeenCalled();

    const { repo, resultados, servicio } = armar();
    resultados.perdidasRecientes.mockResolvedValue([
      { id: 3219, codigo: '1346350-37-COT26' },
      { id: 3220, codigo: 'B' },
      { id: 3221, codigo: 'C' },
    ]);
    await expect(servicio.revisar(1, Date.now() + 60_000)).resolves.toBe(2);
    expect(repo.crearGeneracion).toHaveBeenCalledTimes(2);
  });

  it('lo que todavía no se puede explicar se intenta en la próxima, sin caerse', async () => {
    const { resultados, servicio } = armar();
    resultados.resultadosDe.mockResolvedValue(new Map());
    await expect(servicio.revisar(1, Date.now() + 60_000)).resolves.toBe(0);
  });
});
