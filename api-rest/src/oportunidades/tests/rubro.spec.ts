import type Anthropic from '@anthropic-ai/sdk';
import type { PinoLogger } from 'nestjs-pino';
import { mockPinoLogger } from 'src/testing/mocks';
import type {
  CompetenciaRepository,
  ProcesoLigero,
} from '../competencia/competencia.repository';
import {
  ganadoresDeLasLineas,
  lineasDelProceso,
  MAX_LINEAS_A_LA_IA,
  rankingDelRubro,
  rubroValido,
  textoParaLaIA,
} from '../competencia/rubro';
import { RubroService } from '../competencia/rubro.service';
import type { OportunidadesRepository } from '../oportunidades.repository';

// QUIÉN GANA LO QUE TÚ HACES (decisión 71, 23-10). Felipe: "siento que estoy
// como en un mar de productores de eventos y yo no soy productor de
// eventos... catering, celebraciones, cenas, paseos, fiestas de
// funcionarios". La IA lee cada licitación una vez y dice qué líneas son del
// rubro; cuenta quién ganó esas líneas, no el escenario.

const item = (
  producto: string,
  descripcion: string,
  ganador?: { rut: string; nombre: string; monto: number; cantidad?: number },
) => ({
  NombreProducto: producto,
  Descripcion: descripcion,
  Cantidad: ganador?.cantidad ?? 1,
  Adjudicacion: ganador
    ? {
        RutProveedor: ganador.rut,
        NombreProveedor: ganador.nombre,
        MontoUnitario: ganador.monto,
        Cantidad: ganador.cantidad ?? 1,
      }
    : null,
});

const PROFESOR = [
  item('Servicio de banquetería', 'Almuerzo para 300 personas', {
    rut: '77.067.895-1',
    nombre: 'SOL DE QUILLON',
    monto: 30_000,
    cantidad: 300,
  }),
  item('Amplificación', 'Audio e iluminación', {
    rut: '76.457.495-8',
    nombre: 'SOUND LIGHT',
    monto: 2_000_000,
  }),
];

describe('Las líneas de una licitación', () => {
  it('cada línea con su producto, su descripción y quién la ganó (por la cantidad adjudicada)', () => {
    expect(lineasDelProceso(PROFESOR)).toEqual([
      {
        n: 1,
        producto: 'Servicio de banquetería',
        descripcion: 'Almuerzo para 300 personas',
        ganador: {
          rut: '77067895-1',
          nombre: 'SOL DE QUILLON',
          monto: 9_000_000,
        },
      },
      {
        n: 2,
        producto: 'Amplificación',
        descripcion: 'Audio e iluminación',
        ganador: { rut: '76457495-8', nombre: 'SOUND LIGHT', monto: 2_000_000 },
      },
    ]);
    expect(lineasDelProceso(null)).toEqual([]);
  });

  it('la cantidad pedida es el tope: el comprador que escribió el total como cantidad no infla el monto', () => {
    const [linea] = lineasDelProceso([
      {
        NombreProducto: 'Producción de eventos',
        Descripcion: 'Cena de 200 personas',
        Cantidad: 200,
        Adjudicacion: {
          RutProveedor: '15.237.123-3',
          NombreProveedor: 'JOSE MIGUEL',
          MontoUnitario: 62_213.2,
          Cantidad: 12_442_640,
        },
      },
    ]);
    expect(linea.ganador?.monto).toBeCloseTo(12_442_640);
  });

  it('la IA ve hasta 15 líneas, numeradas, y cuántas más hay', () => {
    const muchas = lineasDelProceso(
      Array.from({ length: 20 }, (_, i) => item(`Producto ${i + 1}`, '')),
    );
    const t = textoParaLaIA({ codigo: 'X-1', nombre: 'Insumos' }, muchas);
    expect(t.split('\n')[0]).toBe('#X-1 | Insumos');
    expect(t).toContain(
      `  ${MAX_LINEAS_A_LA_IA}. Producto ${MAX_LINEAS_A_LA_IA}`,
    );
    expect(t).not.toContain('16. Producto 16');
    expect(t).toContain('(y 5 líneas más)');
  });
});

describe('Lo que dice la IA', () => {
  it('solo códigos pedidos, una vez; «si» son todas las líneas; «parcial» sin líneas no es del rubro; líneas que no existen no cuentan', () => {
    expect(
      rubroValido(
        {
          licitaciones: [
            { codigo: '#A', del_rubro: 'si', lineas: [], razon: 'cena' },
            { codigo: 'A', del_rubro: 'no', lineas: [], razon: 'repetido' },
            {
              codigo: 'B',
              del_rubro: 'parcial',
              lineas: [1, 9, 0],
              razon: 'almuerzo y audio',
            },
            { codigo: 'C', del_rubro: 'parcial', lineas: [], razon: 'raro' },
            { codigo: 'D', del_rubro: 'quizás', lineas: [], razon: 'raro' },
            { codigo: 'Z', del_rubro: 'si', lineas: [], razon: 'no pedida' },
          ],
        },
        new Map([
          ['A', 3],
          ['B', 2],
          ['C', 2],
          ['D', 1],
        ]),
      ),
    ).toEqual([
      { codigo: 'A', del_rubro: 'si', lineas: [1, 2, 3], razon: 'cena' },
      {
        codigo: 'B',
        del_rubro: 'parcial',
        lineas: [1],
        razon: 'almuerzo y audio',
      },
      { codigo: 'C', del_rubro: 'no', lineas: [], razon: 'raro' },
    ]);
    expect(rubroValido(null, new Map())).toEqual([]);
  });

  it('en una mixta cuenta quién ganó la comida, no el escenario', () => {
    expect(ganadoresDeLasLineas(lineasDelProceso(PROFESOR), [1])).toEqual([
      { rut: '77067895-1', nombre: 'SOL DE QUILLON', monto: 9_000_000 },
    ]);
  });

  it('el ranking: de más triunfos a menos, con monto, la última vez y dónde gana más; lo que no es del rubro no cuenta', () => {
    const r = rankingDelRubro([
      {
        codigo: 'A',
        del_rubro: 'si',
        ganadores: [{ rut: 'S', nombre: 'SOL', monto: 100 }],
        nombre: null,
        organismo: 'Quillón',
        comuna: null,
        fecha: '2025-01-01',
      },
      {
        codigo: 'B',
        del_rubro: 'parcial',
        ganadores: [{ rut: 'S', nombre: 'SOL', monto: 50 }],
        nombre: null,
        organismo: 'Quillón',
        comuna: null,
        fecha: '2026-02-01',
      },
      {
        codigo: 'C',
        del_rubro: 'si',
        ganadores: [{ rut: 'R', nombre: 'ROSAS', monto: 500 }],
        nombre: null,
        organismo: 'Bulnes',
        comuna: null,
        fecha: '2024-01-01',
      },
      {
        codigo: 'D',
        del_rubro: 'no',
        ganadores: [{ rut: 'P', nombre: 'PRODUCTORA', monto: 9_999 }],
        nombre: null,
        organismo: 'Chillán',
        comuna: null,
        fecha: '2026-01-01',
      },
    ]);
    expect(r.map((c) => [c.rut, c.triunfos, c.monto_total, c.ultimo])).toEqual([
      ['S', 2, 150, '2026-02-01'],
      ['R', 1, 500, '2024-01-01'],
    ]);
    expect(r[0].organismos).toEqual([{ nombre: 'Quillón', veces: 2 }]);
  });
});

class RubroDePrueba extends RubroService {
  constructor(
    repo: unknown,
    oportunidades: unknown,
    readonly parse: jest.Mock,
  ) {
    super(
      repo as CompetenciaRepository,
      oportunidades as OportunidadesRepository,
      mockPinoLogger() as unknown as PinoLogger,
    );
  }
  protected cliente(): Anthropic {
    return { messages: { parse: this.parse } } as unknown as Anthropic;
  }
}

const ligero = (
  codigo: string,
  extra: Partial<ProcesoLigero> = {},
): ProcesoLigero => ({
  codigo,
  region: 'Región del Ñuble',
  comuna: 'Quillón',
  organismo_codigo: '4364',
  fecha_publicacion: '2025-10-01T00:00:00Z',
  url_acta: null,
  acta_leida_en: null,
  ofertas_leidas_en: null,
  con_ganadores: true,
  ...extra,
});

function armar() {
  const repo = {
    clasificadas: jest.fn().mockResolvedValue(new Set(['YA'])),
    zonaLigera: jest
      .fn()
      .mockResolvedValue([
        ligero('PROFESOR'),
        ligero('YA'),
        ligero('SIN-GANADOR', { con_ganadores: false }),
        ligero('OTRA-REGION', { region: 'Región de Valparaíso' }),
      ]),
    procesosParaElRubro: jest.fn().mockResolvedValue([
      {
        codigo: 'PROFESOR',
        nombre: 'Día del Profesor',
        organismo: 'I. Municipalidad de Quillón',
        comuna: 'Quillón',
        region: 'Ñuble',
        fecha_publicacion: '2025-10-01T00:00:00Z',
        items: PROFESOR,
      },
    ]),
    guardarRubro: jest.fn().mockResolvedValue(undefined),
    olvidarLaZona: jest.fn(),
  };
  const oportunidades = {
    configDe: jest.fn().mockResolvedValue({
      regiones: ['Ñuble'],
      comunas_cercanas: [],
      perfil: 'Complejo turístico',
    }),
  };
  const parse = jest.fn().mockResolvedValue({
    parsed_output: {
      licitaciones: [
        {
          codigo: 'PROFESOR',
          del_rubro: 'parcial',
          lineas: [1],
          razon: 'almuerzo sí, audio no',
        },
      ],
    },
    usage: { input_tokens: 500, output_tokens: 40 },
  });
  const servicio = new RubroDePrueba(repo, oportunidades, parse);
  return { servicio, repo, parse };
}

describe('La IA del rubro, de punta a punta', () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'sk-prueba';
  });

  it('revisa solo lo adjudicado de la zona que falta, con Haiku, y guarda quién ganó lo del rubro', async () => {
    const { servicio, repo, parse } = armar();
    expect(await servicio.clasificar(1, Date.now() + 60_000)).toBe(1);
    expect(repo.procesosParaElRubro).toHaveBeenCalledWith(['PROFESOR']);
    const [[pedido]] = parse.mock.calls as Array<
      [{ model: string; messages: Array<{ content: string }> }]
    >;
    expect(pedido.model).toBe('claude-haiku-5-5');
    expect(pedido.messages[0].content).toContain(
      '#PROFESOR | Día del Profesor',
    );
    expect(repo.guardarRubro).toHaveBeenCalledWith(
      1,
      [
        expect.objectContaining({
          codigo: 'PROFESOR',
          del_rubro: 'parcial',
          lineas: [1],
          ganadores: [
            { rut: '77067895-1', nombre: 'SOL DE QUILLON', monto: 9_000_000 },
          ],
          fecha: '2025-10-01',
        }),
      ],
      'claude-haiku-5-5',
    );
  });

  it('cuánto va revisado de la zona; sin la llave de la IA no revisa nada', async () => {
    const { servicio, parse } = armar();
    expect(await servicio.estado(1)).toEqual({
      revisadas: 1,
      total: 2,
      revisando: false,
    });
    delete process.env.ANTHROPIC_API_KEY;
    expect(await servicio.clasificar(1, Date.now() + 60_000)).toBe(0);
    expect(parse).not.toHaveBeenCalled();
  });
});
