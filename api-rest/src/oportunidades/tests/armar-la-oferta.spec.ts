import type Anthropic from '@anthropic-ai/sdk';
import type { PinoLogger } from 'nestjs-pino';
import type { GenerarRepository } from 'src/quotations/generar/generar.repository';
import { mockPinoLogger } from 'src/testing/mocks';
import type { AdjuntosRepository } from '../adjuntos/adjuntos.repository';
import type { AnalisisRepository } from '../analisis/analisis.repository';
import type { GeneracionRepository } from '../generacion/generacion.repository';
import { SOLO_LO_QUE_PIDEN } from '../generacion/instrucciones';
import type { OferenteRepository } from '../oferente/oferente.repository';
import type { OportunidadesRepository } from '../oportunidades.repository';
import {
  instruccionesDeLaOferta,
  leerArmado,
} from '../postulacion/armar-la-oferta';
import {
  ArmarLaOfertaService,
  MODELO_DE_LA_OFERTA,
} from '../postulacion/armar-la-oferta.service';

// ARMAR LA OFERTA (decisión 33 del doc 17, sprint G, 19-10): por cada
// especificación técnica de las bases, qué se ofrece y con qué productos
// del catálogo; más lo que falta en el catálogo. La IA va de mentira.

const ANALISIS = {
  id: 4,
  estado: 'listo',
  resultado: {
    resumen: 'Ceremonia y cena del Día del Funcionario para 160 personas.',
    lugar: 'Centro de eventos en Quillón',
    criterios: [],
    requisitos: [
      {
        que: 'Escenario de 4x3 m con escalera y faldón negro',
        tipo: 'tecnico',
        obligatorio: true,
        pagina: 18,
      },
      {
        que: '160 brochetas de carne (vacuno y pollo)',
        tipo: 'tecnico',
        obligatorio: true,
        pagina: 19,
      },
    ],
  },
};

const RESPUESTA = {
  resumen: 'La cena sale del catálogo; el escenario hay que agregarlo.',
  cajas: [
    {
      dia: 1,
      categoria: 'Almuerzo o Cena',
      audiencia: 'adultos',
      personas: 160,
      menu_id: 7,
      quitar: [],
      servicios: [{ id: 31, cantidad: 1 }],
    },
  ],
  fijos: [{ dia: 0, id: 45, cantidad: 1 }],
  matriz: [
    {
      especificacion: '160 brochetas de carne (vacuno y pollo)',
      pagina: 19,
      como: '160 brochetas de carne de vacuno y pollo, una por persona.',
      origen: 'catalogo',
      productos: [31],
    },
    {
      especificacion: 'Escenario de 4x3 m con escalera y faldón negro',
      pagina: 18,
      como: 'Escenario de 4x3 m con escalera y faldón negro.',
      origen: 'subcontratar',
      productos: [],
    },
  ],
  faltan_en_el_catalogo: [],
  // Decisión 57: lo subcontratado, junto, y los detalles, aparte.
  subcontratar: ['Escenario de 4x3 m con escalera y faldón negro'],
  detalles: ['Empanadas de cóctel: 2 de queso y 1 de carne por persona'],
  // Lo disponible para lo que postula (decisión 74): la línea que cubre.
  presupuesto: 17_200_000,
};

class OfertaDePrueba extends ArmarLaOfertaService {
  parse = jest.fn();
  protected cliente(): Anthropic {
    return { messages: { parse: this.parse } } as unknown as Anthropic;
  }
}

function armar(analisis: unknown = ANALISIS) {
  const repo = {
    abandonarAntesDe: jest.fn().mockResolvedValue(undefined),
    ultimoDeTipo: jest.fn().mockResolvedValue(null),
    crearGeneracion: jest.fn((fila: Record<string, unknown>) =>
      Promise.resolve({ id: 21, estado: 'procesando', ...fila }),
    ),
    terminar: jest.fn().mockResolvedValue(undefined),
    descargar: jest.fn().mockResolvedValue(Buffer.from('%PDF-1.4 bases')),
  };
  const adjuntos = {
    listar: jest.fn().mockResolvedValue([
      {
        id: 3,
        nombre: 'Bases técnicas.pdf',
        ruta: 'c1/oportunidades/40/bases.pdf',
        tipo: 'application/pdf',
        bytes: 2_000,
        creado_en: '2026-10-17T13:00:00Z',
      },
    ]),
    perfilDe: jest.fn().mockResolvedValue('perfil-1'),
  };
  const analisisRepo = { ultimo: jest.fn().mockResolvedValue(analisis) };
  const oferente = {
    oferente: jest
      .fn()
      .mockResolvedValue({ instalaciones: 'Salón Cúpula para 300 personas.' }),
  };
  const oportunidades = {
    ficha: jest.fn().mockResolvedValue({
      id: 40,
      codigo: '1532886-5-LE26',
      proceso: {
        nombre: 'Ceremonia y Cena Día del Funcionario',
        organismo: 'I. Municipalidad de Quillón',
      },
    }),
    configDe: jest
      .fn()
      .mockResolvedValue({ perfil: 'Vende eventos, almuerzos y cenas.' }),
  };
  const catalogos = {
    catalogo: jest.fn().mockResolvedValue({
      categorias: [],
      menus: [],
      servicios: new Map(),
      fijos: new Map(),
      paquetes: [],
    }),
  };
  const servicio = new OfertaDePrueba(
    repo as unknown as GeneracionRepository,
    adjuntos as unknown as AdjuntosRepository,
    analisisRepo as unknown as AnalisisRepository,
    oferente as unknown as OferenteRepository,
    oportunidades as unknown as OportunidadesRepository,
    catalogos as unknown as GenerarRepository,
    mockPinoLogger() as unknown as PinoLogger,
  );
  return { repo, servicio };
}

const antes = process.env.ANTHROPIC_API_KEY;
beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = 'llave-de-prueba';
});
afterAll(() => {
  if (antes === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = antes;
});

describe('Armar la oferta', () => {
  it('una licitación postulada no se vuelve a armar: lo postulado queda fijo', async () => {
    const { servicio, repo } = armar();
    const { oportunidades } = servicio as unknown as {
      oportunidades: { ficha: jest.Mock };
    };
    oportunidades.ficha.mockResolvedValue({
      id: 40,
      codigo: '1532886-5-LE26',
      estado: 'postulada',
      proceso: { nombre: 'Día del Funcionario', organismo: null },
    });
    await expect(servicio.pedir(1, 'cuenta-1', 40)).rejects.toThrow(
      'Ya la postulaste',
    );
    expect(repo.crearGeneracion).not.toHaveBeenCalled();
  });

  it('sin bases analizadas no se arma', async () => {
    const { servicio, repo } = armar(null);
    await expect(servicio.pedir(1, 'cuenta-1', 40)).rejects.toThrow(
      'Primero analiza las bases: la oferta sale de lo que piden.',
    );
    expect(repo.crearGeneracion).not.toHaveBeenCalled();
  });

  it('se pide con Opus, las bases, las instalaciones, lo que vende y el catálogo', async () => {
    const { servicio, repo } = armar();
    const ejecutar = jest.spyOn(servicio, 'ejecutar').mockResolvedValue(false);

    const fila = await servicio.pedir(1, 'cuenta-1', 40);

    expect(fila).toMatchObject({ id: 21, estado: 'procesando' });
    expect(repo.crearGeneracion).toHaveBeenCalledWith(
      expect.objectContaining({
        tipo: 'oferta',
        modelo: MODELO_DE_LA_OFERTA,
        archivos: [{ id: 3, nombre: 'Bases técnicas.pdf' }],
        pedido_por: 'perfil-1',
      }),
    );
    const sistema = ejecutar.mock.calls[0][4];
    expect(sistema).toContain(
      '1. [tecnico, obligatorio] Escenario de 4x3 m con escalera y faldón negro (pág. 18)',
    );
    expect(sistema).toContain('Salón Cúpula para 300 personas.');
    expect(sistema).toContain('Vende eventos, almuerzos y cenas.');
    expect(sistema).toContain(SOLO_LO_QUE_PIDEN);
    // Bases vagas: se propone con los menús, paquetes o el catálogo
    // (decisión 40).
    expect(sistema).toContain('Si las bases no detallan un servicio');
    expect(sistema).toContain('nunca digas que algo se subcontrata');
    // Decisión 57: un solo pedido al proveedor y las variaciones aparte.
    expect(sistema).toContain(
      'subcontratar: TODO lo que la empresa no tiene y no va a tener por una licitación',
    );
    expect(sistema).toContain(
      'detalles: lo que las bases piden de algo que la empresa YA vende',
    );
    // Decisión 80: una sola lista, el pedido al proveedor.
    expect(sistema).toContain('faltan_en_el_catalogo: va SIEMPRE vacío');
    expect(sistema).toContain(
      'lo que haya que comprar o contratar a un tercero aunque no sea audiovisual',
    );
  });

  it('«Armar postulación» (decisión 35): anota sus parámetros y sigue solo si la oferta quedó lista', async () => {
    const { servicio, repo } = armar();
    const ejecutar = jest.spyOn(servicio, 'ejecutar').mockResolvedValue(true);
    const despues = jest.fn().mockResolvedValue(undefined);

    await servicio.pedir(1, 'cuenta-1', 40, {
      parametros: { postulacion: { total: 11_900_000, propuesta: true } },
      despues,
    });

    expect(repo.crearGeneracion).toHaveBeenCalledWith(
      expect.objectContaining({
        parametros: { postulacion: { total: 11_900_000, propuesta: true } },
      }),
    );
    await new Promise((listo) => setImmediate(listo));
    expect(despues).toHaveBeenCalledWith(21);

    // Si la oferta no resultó, no se sigue con los documentos.
    ejecutar.mockResolvedValue(false);
    despues.mockClear();
    await servicio.pedir(1, 'cuenta-1', 40, { despues });
    await new Promise((listo) => setImmediate(listo));
    expect(despues).not.toHaveBeenCalled();
  });

  it('por detrás: guarda la oferta (cajas y fijos), la matriz y lo que falta, con lo que costó', async () => {
    const { servicio, repo } = armar();
    servicio.parse.mockResolvedValue({
      parsed_output: RESPUESTA,
      usage: { input_tokens: 20_000, output_tokens: 2_000 },
      stop_reason: 'end_turn',
    });

    await servicio.ejecutar(1, 21, [], [], 'SISTEMA');

    const [pedido] = servicio.parse.mock.calls[0] as [
      { model: string; system: string },
    ];
    expect(pedido.model).toBe('claude-opus-5-5');
    expect(pedido.system).toBe('SISTEMA');
    // Opus 5.5: 20.000 × 4 + 2.000 × 20 por millón = US$0,12.
    expect(repo.terminar).toHaveBeenCalledWith(1, 21, {
      estado: 'listo',
      resultado: {
        resumen: RESPUESTA.resumen,
        oferta: { cajas: RESPUESTA.cajas, fijos: RESPUESTA.fijos },
        matriz: RESPUESTA.matriz,
        faltan_en_el_catalogo: RESPUESTA.faltan_en_el_catalogo,
        subcontratar: RESPUESTA.subcontratar,
        detalles: RESPUESTA.detalles,
        presupuesto: 17_200_000,
      },
      no_leidos: [],
      tokens_entrada: 20_000,
      tokens_salida: 2_000,
      costo_usd: 0.12,
    });

    servicio.parse.mockRejectedValue(new Error('se cayó'));
    await servicio.ejecutar(1, 22, [], [], 'SISTEMA');
    expect(repo.terminar).toHaveBeenLastCalledWith(
      1,
      22,
      expect.objectContaining({ estado: 'error' }),
    );
  });

  it('lo que devuelve la IA se lee con cuidado', () => {
    expect(leerArmado(null)).toBeNull();
    expect(leerArmado({ ...RESPUESTA, matriz: [] })).toBeNull();
    const leido = leerArmado({
      ...RESPUESTA,
      matriz: [
        { especificacion: '', como: 'x', origen: 'catalogo', productos: [] },
        {
          especificacion: 'Generador',
          pagina: 'diecinueve',
          como: 'Generador eléctrico con combustible, si es necesario.',
          origen: 'otra cosa',
          productos: [5, -1, 'x'],
        },
      ],
    });
    expect(leido?.matriz).toEqual([
      {
        especificacion: 'Generador',
        pagina: 0,
        como: 'Generador eléctrico con combustible, si es necesario.',
        origen: 'catalogo',
        productos: [5],
      },
    ]);
  });

  it('el pedido al proveedor y los detalles se leen sin vacíos ni repetidos (decisión 57)', () => {
    const leido = leerArmado({
      ...RESPUESTA,
      subcontratar: ['  Pódium, los dos días ', 'Pódium, los dos días', '', 7],
      detalles: 'no es una lista',
    });
    expect(leido?.subcontratar).toEqual(['Pódium, los dos días']);
    expect(leido?.detalles).toEqual([]);
  });

  it('lo que la IA deje como faltante del catálogo entra al pedido al proveedor (decisión 80)', () => {
    // Felipe, 26-10: "todo lo que pusiste en catálogo para mí es
    // proveedor... deja uno solo y mete todo ahí".
    const leido = leerArmado({
      ...RESPUESTA,
      subcontratar: ['Proyector y telón para cada jornada de taller'],
      faltan_en_el_catalogo: [
        { que: 'Diplomas para los alumnos que aprueban', por_que: 'pág. 15' },
        { que: 'Proyector y telón para cada jornada de taller', por_que: '' },
        { que: '', por_que: 'sin qué' },
      ],
    });
    expect(leido?.subcontratar).toEqual([
      'Proyector y telón para cada jornada de taller',
      'Diplomas para los alumnos que aprueban',
    ]);
    expect(leido?.faltan_en_el_catalogo).toEqual([]);
  });

  it('el presupuesto de lo que postula: un entero positivo; si no, 0 (decisión 74)', () => {
    expect(leerArmado(RESPUESTA)?.presupuesto).toBe(17_200_000);
    expect(leerArmado({ ...RESPUESTA, presupuesto: -5 })?.presupuesto).toBe(0);
    expect(
      leerArmado({ ...RESPUESTA, presupuesto: '17.200.000' })?.presupuesto,
    ).toBe(0);
  });

  it('las instrucciones: el catálogo tiene IVA y los precios no cambian productos (decisión 74)', () => {
    // Felipe, 23-10: "no hay que cambiar los productos por precio, arma lo
    // que piden". La IA había bajado el ticket para caber en el tope neto.
    const t = instruccionesDeLaOferta({
      codigo: '5040-14-LE26',
      nombre: 'Día de Campo del Dirigente Social 2026',
      organismo: 'I MUNICIPALIDAD DE QUILLON',
      bases: null,
      instalaciones: null,
      loQueVende: null,
      catalogo: '(catálogo)',
    });
    expect(t).toContain('los precios tienen IVA incluido');
    expect(t).toContain(
      'nunca cambias, quitas ni agregas productos por precio ni para caber en el presupuesto',
    );
    expect(t).toContain(
      'la suma de los montos de las líneas que cubre esta oferta, sin las otras',
    );
  });
});
