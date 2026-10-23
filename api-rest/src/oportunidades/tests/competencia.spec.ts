import type Anthropic from '@anthropic-ai/sdk';
import { BadRequestException } from '@nestjs/common';
import type { PinoLogger } from 'nestjs-pino';
import type { SupabaseService } from 'src/supabase/supabase.service';
import { mockPinoLogger } from 'src/testing/mocks';
import {
  competidoresReales,
  encuentrosCon,
  type OfertaLeida,
  ofertasDelActa,
} from '../competencia/competencia';
import { CompetenciaRepository } from '../competencia/competencia.repository';
import {
  clasificacionValida,
  CompetenciaService,
} from '../competencia/competencia.service';
import { type ActaDeAdjudicacion, bajarActa } from '../historia/acta';
import type { OferenteRepository } from '../oferente/oferente.repository';
import type { OportunidadesRepository } from '../oportunidades.repository';

jest.mock('../historia/acta', () => ({
  ...jest.requireActual<typeof import('../historia/acta')>('../historia/acta'),
  bajarActa: jest.fn(),
}));
const acta = { bajarActa: jest.mocked(bajarActa) };

/** El primer argumento de cada llamada a un simulacro. */
const primeros = (m: jest.Mock): unknown[] =>
  (m.mock.calls as unknown[][]).map((c) => c[0]);

// COMPETIDORES REALES (decisión 70, 22-10). Felipe: "podemos hacerle
// seguimiento a las empresas con las que he competido... también busca
// empresas similares... un botón de «no es mi competidor» (con un
// confirmar)". Lo que fija: el acta en filas por proveedor; quién compitió
// con la empresa, quién se le parece en sus compradores y a quién sigue;
// la búsqueda lee primero lo suyo, sin repetir, de a una por empresa; la IA
// solo clasifica a los nuevos y solo con RUT de la lista; y las marcas.

const VDS = '77701305-K';

const PROCESO = {
  codigo: '4364-5-LE25',
  nombre: 'Día del Profesor 2025',
  organismo_codigo: '4364',
  organismo: 'I. Municipalidad de Quillón',
  region: 'Ñuble',
  comuna: 'Quillón',
  fecha_publicacion: '2025-09-20T12:00:00Z',
};

const ACTA: ActaDeAdjudicacion = {
  informada: null,
  monto_adjudicado: 10_000_000,
  items: [
    {
      numero: 1,
      producto: 'Servicio de eventos',
      especificacion: 'Almuerzo',
      cantidad: 2,
      ofertas: [
        {
          rut: '77.701.305-k',
          proveedor: 'VALLE DEL SOL QUILLON SPA',
          detalle: 'Almuerzo en el complejo',
          precio_unitario: 5_000_000,
          cantidad_adjudicada: 2,
          total_adjudicado: 10_000_000,
          adjudicada: true,
        },
        {
          rut: '76.111.222-3',
          proveedor: 'SOL DE QUILLON SPA',
          detalle: '',
          precio_unitario: 4_500_000,
          cantidad_adjudicada: 0,
          total_adjudicado: 0,
          adjudicada: false,
        },
        {
          rut: null,
          proveedor: 'SIN RUT',
          detalle: '',
          precio_unitario: 1,
          cantidad_adjudicada: 0,
          total_adjudicado: 0,
          adjudicada: false,
        },
      ],
    },
    {
      numero: 2,
      producto: 'Cóctel',
      especificacion: 'Cóctel',
      cantidad: null,
      ofertas: [
        {
          rut: '76.111.222-3',
          proveedor: 'SOL DE QUILLON SPA',
          detalle: 'Cóctel y salón',
          precio_unitario: 1_000_000,
          cantidad_adjudicada: 1,
          total_adjudicado: 1_000_000,
          adjudicada: true,
        },
      ],
    },
  ],
};

const oferta = (
  o: Partial<OfertaLeida> & Pick<OfertaLeida, 'codigo' | 'rut'>,
): OfertaLeida => ({
  proveedor: o.rut,
  total_ofertado: null,
  total_adjudicado: 0,
  adjudicada: false,
  lineas: 1,
  detalle: null,
  proceso: null,
  organismo_codigo: '4364',
  organismo: 'Quillón',
  region: 'Ñuble',
  comuna: 'Quillón',
  fecha: '2025-09-20',
  ...o,
});

describe('El acta en filas', () => {
  it('una fila por proveedor con RUT: el total ofertado por la cantidad pedida, ganó si ganó una línea y su primer detalle', () => {
    const filas = ofertasDelActa(PROCESO, ACTA);
    expect(filas.map((f) => f.rut)).toEqual([VDS, '76111222-3']);
    expect(filas[0]).toMatchObject({
      proveedor: 'VALLE DEL SOL QUILLON SPA',
      total_ofertado: 10_000_000,
      total_adjudicado: 10_000_000,
      adjudicada: true,
      lineas: 1,
      detalle: 'Almuerzo en el complejo',
      organismo_codigo: '4364',
      fecha: '2025-09-20',
    });
    expect(filas[1]).toMatchObject({
      total_ofertado: 9_000_000 + 1_000_000,
      total_adjudicado: 1_000_000,
      adjudicada: true,
      lineas: 2,
      detalle: 'Cóctel y salón',
    });
  });
});

describe('Tus competidores reales', () => {
  const OFERTAS = [
    oferta({
      codigo: 'A',
      rut: VDS,
      total_ofertado: 10_000_000,
      adjudicada: true,
    }),
    oferta({
      codigo: 'A',
      rut: '76111222-3',
      proveedor: 'SOL DE QUILLON',
      total_ofertado: 9_000_000,
    }),
    oferta({ codigo: 'B', rut: VDS, total_ofertado: 8_000_000 }),
    oferta({
      codigo: 'B',
      rut: '76111222-3',
      proveedor: 'SOL DE QUILLON',
      total_ofertado: 8_800_000,
      adjudicada: true,
      total_adjudicado: 8_800_000,
      fecha: '2026-03-01',
    }),
    // Ofertó en sus compradores, sin cruzarse con la empresa.
    oferta({
      codigo: 'C',
      rut: '78000111-2',
      proveedor: 'CENTRO DE EVENTOS LAS ROSAS',
      adjudicada: true,
      total_adjudicado: 3_000_000,
    }),
    oferta({
      codigo: 'D',
      rut: '79000222-3',
      proveedor: 'FERRETERIA EL CLAVO',
    }),
  ];

  it('compitió contigo: cuántas veces, quién ganó y la diferencia de precio; parecido solo si la IA dijo sí; seguido aunque no esté en las actas; la empresa no se lista', () => {
    const lista = competidoresReales({
      rutEmpresa: '77.701.305-K',
      ofertas: OFERTAS,
      compradores: new Set(['4364']),
      marcas: [
        {
          rut: '78000111-2',
          nombre: null,
          seguido: false,
          descartado: false,
          parecido: 'si',
          parecido_razon: 'centro de eventos',
        },
        {
          rut: '79000222-3',
          nombre: null,
          seguido: false,
          descartado: false,
          parecido: 'no',
          parecido_razon: 'ferretería',
        },
        {
          rut: '96555444-1',
          nombre: 'HOTEL SEGUIDO',
          seguido: true,
          descartado: false,
          parecido: null,
          parecido_razon: null,
        },
      ],
    });
    expect(lista.map((c) => c.rut)).toEqual([
      '96555444-1',
      '76111222-3',
      '78000111-2',
    ]);
    const sol = lista[1];
    expect(sol).toMatchObject({
      nombre: 'SOL DE QUILLON',
      etiquetas: ['compitio'],
      encuentros: 2,
      te_gano: 1,
      ganaste: 1,
      // (9/10 − 1) = −10 % y (8,8/8 − 1) = +10 %: en promedio, 0.
      diferencia_de_precio: 0,
      ultima: '2026-03-01',
    });
    expect(lista[2]).toMatchObject({
      etiquetas: ['similar'],
      encuentros: 0,
      triunfos_en_tus_compradores: 1,
      monto_ganado: 3_000_000,
      parecido_razon: 'centro de eventos',
    });
    expect(lista[0]).toMatchObject({
      etiquetas: ['seguido'],
      nombre: 'HOTEL SEGUIDO',
      seguido: true,
    });
  });

  it('«No es mi competidor» queda marcado (la pantalla lo esconde y se puede recuperar)', () => {
    const lista = competidoresReales({
      rutEmpresa: VDS,
      ofertas: OFERTAS,
      compradores: new Set(['4364']),
      marcas: [
        {
          rut: '76111222-3',
          nombre: null,
          seguido: false,
          descartado: true,
          parecido: null,
          parecido_razon: null,
        },
      ],
    });
    expect(lista.find((c) => c.rut === '76111222-3')?.descartado).toBe(true);
  });

  it('los encuentros con uno: las licitaciones de los dos, lo más nuevo primero', () => {
    expect(encuentrosCon('76.111.222-3', VDS, OFERTAS)).toEqual([
      {
        codigo: 'B',
        proceso: null,
        organismo: 'Quillón',
        fecha: '2026-03-01',
        su_oferta: 8_800_000,
        tu_oferta: 8_000_000,
        gano_el: true,
        ganaste: false,
      },
      {
        codigo: 'A',
        proceso: null,
        organismo: 'Quillón',
        fecha: '2025-09-20',
        su_oferta: 9_000_000,
        tu_oferta: 10_000_000,
        gano_el: false,
        ganaste: true,
      },
    ]);
  });
});

describe('La clasificación de la IA', () => {
  it('solo RUT de la lista, una vez cada uno y con sí o no', () => {
    expect(
      clasificacionValida(
        {
          proveedores: [
            { rut: '78.000.111-2', parecido: 'si', razon: 'centro de eventos' },
            { rut: '78000111-2', parecido: 'no', razon: 'repetido' },
            { rut: '11111111-1', parecido: 'si', razon: 'no lo pedí' },
            { rut: '79000222-3', parecido: 'quizás', razon: 'raro' },
          ],
        },
        new Set(['78000111-2', '79000222-3']),
      ),
    ).toEqual([
      { rut: '78000111-2', parecido: 'si', razon: 'centro de eventos' },
    ]);
    expect(clasificacionValida(null, new Set())).toEqual([]);
  });
});

class CompetenciaDePrueba extends CompetenciaService {
  constructor(
    repo: unknown,
    oportunidades: unknown,
    oferente: unknown,
    readonly parse: jest.Mock,
  ) {
    super(
      repo as CompetenciaRepository,
      oportunidades as OportunidadesRepository,
      oferente as OferenteRepository,
      mockPinoLogger() as unknown as PinoLogger,
    );
  }
  protected cliente(): Anthropic {
    return { messages: { parse: this.parse } } as unknown as Anthropic;
  }
  protected pausa(): Promise<void> {
    return Promise.resolve();
  }
}

function armar() {
  const repo = {
    misLicitaciones: jest
      .fn()
      .mockResolvedValue([
        { codigo: '4364-13-LE26', organismo_codigo: '4364' },
      ]),
    actasPorLeer: jest.fn(),
    actaGuardada: jest.fn().mockResolvedValue(null),
    guardarOfertas: jest.fn().mockResolvedValue(undefined),
    ofertasDe: jest.fn().mockResolvedValue([]),
    ofertasDeLicitaciones: jest.fn().mockResolvedValue([]),
    ofertasEnCompradores: jest.fn().mockResolvedValue([]),
    marcas: jest.fn().mockResolvedValue([]),
    marcar: jest.fn(
      (_c: number, rut: string, nombre: string | null, cambios: object) =>
        Promise.resolve({ rut, nombre, ...cambios }),
    ),
    guardarClasificaciones: jest.fn().mockResolvedValue(undefined),
  };
  const oportunidades = {
    configDe: jest.fn().mockResolvedValue({
      regiones: ['Ñuble'],
      comunas_cercanas: ['Quillón', 'Bulnes'],
      perfil: 'Complejo turístico con salones',
    }),
    empresasConModulo: jest.fn().mockResolvedValue([{ id: 1 }]),
  };
  const oferente = {
    oferente: jest.fn().mockResolvedValue({ rut: '77.701.305-K' }),
  };
  const parse = jest.fn();
  const servicio = new CompetenciaDePrueba(
    repo,
    oportunidades,
    oferente,
    parse,
  );
  return { servicio, repo, oportunidades, oferente, parse };
}

const proceso = (codigo: string) => ({
  ...PROCESO,
  codigo,
  acta_guardada: false,
  url_acta: `https://www.mercadopublico.cl/Procurement/Modules/RFB/StepsProcessAward/PreviewAwardAct.aspx?qs=${codigo}`,
});

describe('Buscar en las actas', () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'sk-prueba';
    acta.bajarActa.mockReset();
  });

  it('lee primero lo suyo, después sus compradores y al final sus comunas, sin repetir; guarda el acta con sus ofertas', async () => {
    const { servicio, repo } = armar();
    repo.actasPorLeer
      .mockResolvedValueOnce([proceso('MIA')])
      .mockResolvedValueOnce([proceso('MIA'), proceso('COMPRADOR')])
      .mockResolvedValueOnce([proceso('COMUNA')]);
    acta.bajarActa.mockResolvedValue('<html></html>');
    await servicio.ejecutarBusqueda(1, Date.now() + 60_000);
    const filtros = primeros(repo.actasPorLeer);
    expect(filtros.map((f) => Object.keys(f as object)[0])).toEqual([
      'codigos',
      'organismos',
      'comunas',
    ]);
    expect(filtros[0]).toEqual({ codigos: ['4364-13-LE26'] });
    expect(filtros[2]).toMatchObject({ comunas: ['Quillón', 'Bulnes'] });
    expect(primeros(repo.guardarOfertas)).toEqual([
      'MIA',
      'COMPRADOR',
      'COMUNA',
    ]);
  });

  it('un acta que no se puede bajar no frena las demás', async () => {
    const { servicio, repo } = armar();
    repo.actasPorLeer
      .mockResolvedValueOnce([proceso('MALA'), proceso('BUENA')])
      .mockResolvedValue([]);
    acta.bajarActa
      .mockRejectedValueOnce(new Error('el acta respondió 500'))
      .mockResolvedValue('<html></html>');
    await servicio.ejecutarBusqueda(1, Date.now() + 60_000);
    expect(primeros(repo.guardarOfertas)).toEqual(['BUENA']);
  });

  it('el acta que ya guardó «Seguir» no se vuelve a bajar: sus ofertas salen de la guardada', async () => {
    const { servicio, repo } = armar();
    repo.actasPorLeer
      .mockResolvedValueOnce([{ ...proceso('SEGUIDA'), acta_guardada: true }])
      .mockResolvedValue([]);
    repo.actaGuardada.mockResolvedValue(ACTA);
    await servicio.ejecutarBusqueda(1, Date.now() + 60_000);
    expect(acta.bajarActa).not.toHaveBeenCalled();
    expect(repo.actaGuardada).toHaveBeenCalledWith('SEGUIDA');
    const [[codigo, filas, actaNueva]] = repo.guardarOfertas.mock
      .calls as Array<[string, Array<{ rut: string }>, unknown]>;
    expect(codigo).toBe('SEGUIDA');
    expect(filas.map((f) => f.rut)).toEqual([VDS, '76111222-3']);
    expect(actaNueva).toBeUndefined();
  });

  it('una búsqueda a la vez por empresa, y el estado dice cómo va', async () => {
    const { servicio, repo } = armar();
    let soltar: () => void = () => undefined;
    repo.actasPorLeer.mockReturnValue(
      new Promise((r) => {
        soltar = () => r([]);
      }),
    );
    const primera = await servicio.buscar(1);
    expect(primera.busqueda.buscando).toBe(true);
    await servicio.buscar(1);
    expect(repo.misLicitaciones).toHaveBeenCalledTimes(3);
    soltar();
    await new Promise((r) => setTimeout(r, 0));
  });

  it('la IA clasifica solo a los proveedores nuevos de sus compradores (ni la empresa ni los ya clasificados) y guarda lo válido', async () => {
    const { servicio, repo, parse } = armar();
    repo.actasPorLeer.mockResolvedValue([]);
    repo.ofertasEnCompradores.mockResolvedValue([
      oferta({ codigo: 'X', rut: VDS }),
      oferta({
        codigo: 'X',
        rut: '78000111-2',
        proveedor: 'CENTRO DE EVENTOS LAS ROSAS',
        detalle: 'Banquetería',
      }),
      oferta({
        codigo: 'Y',
        rut: '79000222-3',
        proveedor: 'FERRETERIA EL CLAVO',
      }),
    ]);
    repo.marcas.mockResolvedValue([
      {
        rut: '79000222-3',
        nombre: null,
        seguido: false,
        descartado: false,
        parecido: 'no',
        parecido_razon: 'ferretería',
      },
    ]);
    parse.mockResolvedValue({
      parsed_output: {
        proveedores: [
          { rut: '78000111-2', parecido: 'si', razon: 'centro de eventos' },
        ],
      },
      usage: { input_tokens: 100, output_tokens: 20 },
    });
    await servicio.ejecutarBusqueda(1, Date.now() + 60_000);
    const [[pedido]] = parse.mock.calls as Array<
      [{ model: string; messages: Array<{ content: string }> }]
    >;
    expect(pedido.model).toBe('claude-haiku-5-5');
    expect(pedido.messages[0].content).toBe(
      '78000111-2 | CENTRO DE EVENTOS LAS ROSAS | ofreció: Banquetería',
    );
    expect(repo.guardarClasificaciones).toHaveBeenCalledWith(
      1,
      [
        {
          rut: '78000111-2',
          parecido: 'si',
          razon: 'centro de eventos',
          nombre: 'CENTRO DE EVENTOS LAS ROSAS',
        },
      ],
      'claude-haiku-5-5',
    );
  });
});

describe('Cuando compitió contigo', () => {
  it('las licitaciones de los dos y su nombre, con el RUT escrito como sea', async () => {
    const { servicio, repo } = armar();
    repo.ofertasDe.mockResolvedValue([oferta({ codigo: 'A', rut: VDS })]);
    repo.ofertasDeLicitaciones.mockResolvedValue([
      oferta({ codigo: 'A', rut: VDS, total_ofertado: 10_000_000 }),
      oferta({
        codigo: 'A',
        rut: '76111222-3',
        proveedor: ' SOL DE QUILLON ',
        total_ofertado: 9_000_000,
        adjudicada: true,
      }),
    ]);
    const r = await servicio.encuentros(1, '76.111.222-3');
    expect(repo.ofertasDe).toHaveBeenCalledWith(VDS);
    expect(repo.ofertasDeLicitaciones).toHaveBeenCalledWith(['A']);
    expect(r.nombre).toBe('SOL DE QUILLON');
    expect(r.encuentros).toEqual([
      expect.objectContaining({ codigo: 'A', gano_el: true, ganaste: false }),
    ]);
  });

  it('sin el RUT de la empresa no hay encuentros', async () => {
    const { servicio, oferente } = armar();
    oferente.oferente.mockResolvedValue({ rut: null });
    expect(await servicio.encuentros(1, '76111222-3')).toEqual({
      nombre: null,
      encuentros: [],
    });
  });
});

describe('Seguir y «No es mi competidor»', () => {
  it('con el RUT normalizado y el nombre de sus ofertas; un RUT raro o sin cambios no se acepta', async () => {
    const { servicio, repo } = armar();
    repo.ofertasDe.mockResolvedValue([
      oferta({ codigo: 'A', rut: '76111222-3', proveedor: ' SOL DE QUILLON ' }),
    ]);
    await servicio.marcar(1, '76.111.222-3', { descartado: true });
    expect(repo.marcar).toHaveBeenCalledWith(
      1,
      '76111222-3',
      'SOL DE QUILLON',
      { descartado: true },
    );
    await expect(
      servicio.marcar(1, 'hola', { seguido: true }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(servicio.marcar(1, '76111222-3', {})).rejects.toThrow(
      'No hay nada que cambiar',
    );
  });
});

describe('El repositorio de la competencia', () => {
  type Paso = [string, ...unknown[]];
  const armarRepo = (data: unknown = []) => {
    const pasos: Array<{ tabla: string; pasos: Paso[] }> = [];
    const from = jest.fn((tabla: string) => {
      const consulta = { tabla, pasos: [] as Paso[] };
      pasos.push(consulta);
      const cadena: Record<string, unknown> = {};
      for (const m of [
        'select',
        'update',
        'delete',
        'insert',
        'upsert',
        'eq',
        'in',
        'not',
        'is',
        'gte',
        'order',
        'limit',
        'range',
      ]) {
        cadena[m] = (...args: unknown[]) => {
          consulta.pasos.push([m, ...args]);
          return cadena;
        };
      }
      cadena.single = () => Promise.resolve({ data, error: null });
      cadena.maybeSingle = () => Promise.resolve({ data, error: null });
      cadena.then = (bien: (v: unknown) => unknown) =>
        Promise.resolve({ data, error: null }).then(bien);
      return cadena;
    });
    const repo = new CompetenciaRepository(
      { client: { from } } as unknown as SupabaseService,
      mockPinoLogger() as unknown as PinoLogger,
    );
    return { repo, pasos };
  };

  it('las actas por pasar: adjudicadas, con enlace, sin sus ofertas y de lo pedido', async () => {
    const { repo, pasos } = armarRepo([
      { ...PROCESO, adjudicacion: { url_acta: 'https://x' } },
      { ...PROCESO, codigo: 'SIN', adjudicacion: null },
    ]);
    const r = await repo.actasPorLeer(
      { organismos: ['4364'], desde: '2023-10-22' },
      50,
    );
    expect(r).toEqual([
      { ...PROCESO, url_acta: 'https://x', acta_guardada: false },
    ]);
    expect(pasos[0].tabla).toBe('mp_procesos');
    expect(pasos[0].pasos).toEqual(
      expect.arrayContaining([
        ['not', 'adjudicacion->>url_acta', 'is', null],
        ['is', 'ofertas_leidas_en', null],
        ['in', 'organismo_codigo', ['4364']],
        ['gte', 'fecha_publicacion', '2023-10-22'],
        ['limit', 50],
      ]),
    );
    expect(await repo.actasPorLeer({ codigos: [] }, 50)).toEqual([]);
  });

  it('guardar las ofertas: reemplazan las de antes y el proceso queda pasado (y con su acta, si se bajó)', async () => {
    const { repo, pasos } = armarRepo();
    const filas = ofertasDelActa(PROCESO, ACTA);
    await repo.guardarOfertas('4364-5-LE25', filas, ACTA);
    expect(pasos.map((p) => p.tabla)).toEqual([
      'mp_ofertas',
      'mp_ofertas',
      'mp_procesos',
    ]);
    expect(pasos[0].pasos).toEqual([
      ['delete'],
      ['eq', 'codigo', '4364-5-LE25'],
    ]);
    expect(pasos[1].pasos).toEqual([['insert', filas]]);
    const [, cambios] = pasos[2].pasos[0] as [string, Record<string, unknown>];
    expect(Object.keys(cambios).sort()).toEqual([
      'acta',
      'acta_leida_en',
      'ofertas_leidas_en',
    ]);
    // Desde el acta guardada (o un acta sin ítems): solo la marca.
    const otra = armarRepo();
    await otra.repo.guardarOfertas('4364-5-LE25', filas);
    const [, solo] = otra.pasos[2].pasos[0] as [
      string,
      Record<string, unknown>,
    ];
    expect(Object.keys(solo)).toEqual(['ofertas_leidas_en']);
  });

  it('las marcas son de la empresa, y marcar no pisa lo que dijo la IA', async () => {
    const { repo, pasos } = armarRepo({ rut: '76111222-3' });
    await repo.marcar(1, '76111222-3', 'SOL', { seguido: true });
    const [, fila, opciones] = pasos[0].pasos.find(([m]) => m === 'upsert') as [
      string,
      Record<string, unknown>,
      unknown,
    ];
    expect(fila).toMatchObject({
      company_id: 1,
      rut: '76111222-3',
      nombre: 'SOL',
      seguido: true,
    });
    expect(fila).not.toHaveProperty('parecido');
    expect(opciones).toEqual({ onConflict: 'company_id,rut' });
    const r2 = armarRepo([]);
    await r2.repo.marcas(1);
    expect(r2.pasos[0].pasos).toEqual(
      expect.arrayContaining([['eq', 'company_id', 1]]),
    );
  });
});
