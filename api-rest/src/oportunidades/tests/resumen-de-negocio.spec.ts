import type Anthropic from '@anthropic-ai/sdk';
import type { PinoLogger } from 'nestjs-pino';
import { mockPinoLogger } from 'src/testing/mocks';
import type { AdjuntosRepository } from '../adjuntos/adjuntos.repository';
import type { GeneracionRepository } from '../generacion/generacion.repository';
import type { OportunidadesRepository } from '../oportunidades.repository';
import {
  instruccionesDelResumen,
  MODELO_DEL_RESUMEN,
  ResumenDeNegocioService,
  textoDeLaLicitacion,
} from '../seguimiento/resumen-de-negocio.service';

// EL RESUMEN DE NEGOCIO DE UNA LICITACIÓN SEGUIDA (decisión 30, sprint E,
// 19-10). Felipe: "quién se la ganó, qué incluye el programa, qué postuló,
// bajo qué precios... información que me pueda servir para negocios del
// Valle". La IA va de mentira.

const PERFIL =
  'Valle del Sol es un complejo turístico, gastronómico y de eventos en Quillón. Vende: alojamiento en cabañas, almuerzos y cenas.';

const ACTA = {
  informada: '05/11/2026 10:12',
  monto_adjudicado: 56_034_300,
  items: [
    {
      numero: 1,
      producto: 'Servicios de viajes',
      especificacion: 'Gira de estudio a Pucón, 45 alumnos',
      cantidad: 1,
      ofertas: [
        {
          rut: '76.123.456-7',
          proveedor: 'TURISMO DEL SUR LIMITADA',
          detalle: 'Bus y alojamiento',
          precio_unitario: 56_034_300,
          cantidad_adjudicada: 1,
          total_adjudicado: 56_034_300,
          adjudicada: true,
        },
      ],
    },
  ],
};

const FICHA = {
  id: 274,
  codigo: '4239-33-LE26',
  proceso: {
    nombre: 'SERVICIO PARA GIRAS DE ESTUDIO DEL LICEO MARIANO LATORRE',
    organismo: 'I MUNICIPALIDAD DE CURANILAHUE',
    comuna: 'Curanilahue',
    region: 'Región del Biobío',
    estado: 'Adjudicada',
    monto: 66_680_816,
    acta: ACTA,
  },
};

const RESUMEN = {
  resumen: 'Gira de estudio a Pucón para 45 alumnos; la ganó Turismo del Sur.',
  quien_gano: 'TURISMO DEL SUR LIMITADA (76.123.456-7) por $56.034.300 neto',
  que_incluye: ['Pucón, 5 días', '45 alumnos y 3 profesores'],
  ofertas: [
    {
      proveedor: 'TURISMO DEL SUR LIMITADA',
      precio: '$56.034.300 neto',
      que_ofrecio: 'Bus y alojamiento',
      gano: true,
    },
  ],
  para_tu_empresa: [
    'Ofrecerle a Turismo del Sur una parada con almuerzo en Quillón.',
  ],
  siguientes_pasos: ['Llamar a Turismo del Sur esta semana.'],
};

class ResumenDePrueba extends ResumenDeNegocioService {
  parse = jest.fn();
  protected cliente(): Anthropic {
    return { messages: { parse: this.parse } } as unknown as Anthropic;
  }
}

function armar() {
  const repo = {
    abandonarAntesDe: jest.fn().mockResolvedValue(undefined),
    ultimoDeTipo: jest.fn().mockResolvedValue(null),
    crearGeneracion: jest.fn((fila: Record<string, unknown>) =>
      Promise.resolve({ id: 12, estado: 'procesando', ...fila }),
    ),
    terminar: jest.fn().mockResolvedValue(undefined),
    descargar: jest.fn().mockResolvedValue(Buffer.from('%PDF-1.4 bases')),
  };
  const adjuntos = {
    listar: jest.fn().mockResolvedValue([
      {
        id: 7,
        nombre: 'Acta de evaluación.pdf',
        ruta: 'c1/oportunidades/274/acta.pdf',
        tipo: 'application/pdf',
        bytes: 1_000,
        creado_en: '2026-11-05T13:00:00Z',
      },
    ]),
    perfilDe: jest.fn().mockResolvedValue('perfil-1'),
  };
  const oportunidades = {
    ficha: jest.fn().mockResolvedValue(FICHA),
    configDe: jest.fn().mockResolvedValue({ perfil: PERFIL }),
  };
  const servicio = new ResumenDePrueba(
    repo as unknown as GeneracionRepository,
    adjuntos as unknown as AdjuntosRepository,
    oportunidades as unknown as OportunidadesRepository,
    mockPinoLogger() as unknown as PinoLogger,
  );
  return { repo, adjuntos, oportunidades, servicio };
}

const antes = process.env.ANTHROPIC_API_KEY;
beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = 'llave-de-prueba';
});
afterAll(() => {
  if (antes === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = antes;
});

describe('El resumen de negocio', () => {
  it('lo pide con Sonnet, los documentos subidos, lo publicado con el acta y la descripción de «Mi empresa»', async () => {
    const { repo, servicio } = armar();
    const ejecutar = jest
      .spyOn(servicio, 'ejecutar')
      .mockResolvedValue(undefined);

    const fila = await servicio.pedir(1, 'cuenta-1', 274);

    expect(fila).toMatchObject({ id: 12, estado: 'procesando' });
    expect(repo.crearGeneracion).toHaveBeenCalledWith(
      expect.objectContaining({
        company_id: 1,
        oportunidad_id: 274,
        tipo: 'resumen',
        modelo: MODELO_DEL_RESUMEN,
        archivos: [{ id: 7, nombre: 'Acta de evaluación.pdf' }],
        pedido_por: 'perfil-1',
      }),
    );
    const [, , archivos, , contexto] = ejecutar.mock.calls[0];
    expect(archivos.map((a) => a.id)).toEqual([7]);
    expect(contexto.perfil).toBe(PERFIL);
    expect(contexto.licitacion).toContain('TURISMO DEL SUR LIMITADA');
    expect(contexto.licitacion).toContain(
      'Estado en Mercado Público: Adjudicada',
    );
  });

  it('por detrás: guarda el resumen con lo que costó; si la IA falla, queda el error en palabras', async () => {
    const { repo, servicio } = armar();
    servicio.parse.mockResolvedValue({
      parsed_output: RESUMEN,
      usage: { input_tokens: 20_000, output_tokens: 1_500 },
      stop_reason: 'end_turn',
    });

    await servicio.ejecutar(1, 12, [], [], {
      perfil: PERFIL,
      licitacion: 'LA LICITACIÓN',
    });

    const [modelo] = servicio.parse.mock.calls[0] as [
      { model: string; system: string },
    ];
    expect(modelo.model).toBe('claude-sonnet-5-5');
    expect(modelo.system).toContain(PERFIL);
    // Sonnet 5.5: 20.000 × 2 + 1.500 × 10 por millón = US$0,055.
    expect(repo.terminar).toHaveBeenCalledWith(1, 12, {
      estado: 'listo',
      resultado: RESUMEN,
      no_leidos: [],
      tokens_entrada: 20_000,
      tokens_salida: 1_500,
      costo_usd: 0.055,
    });

    servicio.parse.mockRejectedValue(new Error('se cayó'));
    await servicio.ejecutar(1, 13, [], [], {
      perfil: null,
      licitacion: 'x',
    });
    expect(repo.terminar).toHaveBeenLastCalledWith(
      1,
      13,
      expect.objectContaining({ estado: 'error' }),
    );
  });

  it('las instrucciones llevan la descripción de la empresa; sin ella, lo dicen', () => {
    expect(instruccionesDelResumen(PERFIL)).toContain(PERFIL);
    expect(instruccionesDelResumen(null)).toContain(
      'todavía no escribe su descripción en «Mi empresa»',
    );
    expect(
      textoDeLaLicitacion({
        codigo: 'X',
        proceso: { nombre: 'Gira', acta: null },
      }),
    ).toContain('todavía no está publicada');
  });
});
