import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { PinoLogger } from 'nestjs-pino';
import type { SupabaseService } from 'src/supabase/supabase.service';
import { mockPinoLogger } from 'src/testing/mocks';
import { ActasDeLaZonaService } from '../competencia/actas.service';
import {
  competidoresReales,
  diferenciasDePrecio,
  fichaDeMercado,
  type OfertaLeida,
  ofertasDelActa,
} from '../competencia/competencia';
import {
  CompetenciaRepository,
  type ProcesoLigero,
} from '../competencia/competencia.repository';
import { CompetenciaService } from '../competencia/competencia.service';
import type { RubroService } from '../competencia/rubro.service';
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

// COMPETIDORES REALES (decisiones 70 y 71, 22 y 23-10). Felipe: "mis
// competidores son esos": los que ofertaron donde ofertó la empresa, ganara
// o perdiera; "y luego traer la información de ellos, todas las
// licitaciones en las que participan... es como un estudio de mercado"; y
// "la lectura de actas debería ser automática". Lo que fija: el acta en
// filas; el precio comparado línea a línea (el 23-10 Centropan salió
// «3.984 % más caro» por comparar totales de líneas distintas); la lista
// sin «Parecido a ti»; la ficha de mercado; la lectura sola, en orden y sin
// repetir; y las marcas.

const VDS = '77701305-K';
const SOL = '77067895-1';
const PAN = '76214886-2';

const PROCESO = {
  codigo: '4364-5-LE25',
  nombre: 'Día del Profesor 2025',
  organismo_codigo: '4364',
  organismo: 'I. Municipalidad de Quillón',
  region: 'Ñuble',
  comuna: 'Quillón',
  fecha_publicacion: '2025-09-20T12:00:00Z',
};

const oferta_ = (
  rut: string,
  proveedor: string,
  precio: number | null,
  gano = false,
) => ({
  rut,
  proveedor,
  detalle: '',
  precio_unitario: precio,
  cantidad_adjudicada: gano ? 1 : 0,
  total_adjudicado: gano && precio ? precio : 0,
  adjudicada: gano,
});

/** Dos líneas: almuerzo (los tres) y pan (solo Centropan). */
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
        oferta_('77.701.305-k', 'VALLE DEL SOL QUILLON SPA', 5_000_000, true),
        oferta_(
          '77.067.895-1',
          'CENTRO TURISTICO SOL DE QUILLON SPA',
          6_000_000,
        ),
        oferta_(null as unknown as string, 'SIN RUT', 1),
      ],
    },
    {
      numero: 2,
      producto: 'Pan',
      especificacion: 'Pan amasado',
      cantidad: 100,
      ofertas: [
        oferta_('76.214.886-2', 'SOCIEDAD COMERCIAL CENTROPAN LTDA.', 2_000),
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
  it('una fila por proveedor con RUT: lo ofertado por la cantidad pedida, ganó si ganó una línea', () => {
    const filas = ofertasDelActa(PROCESO, ACTA);
    expect(filas.map((f) => f.rut)).toEqual([VDS, SOL, PAN]);
    expect(filas[0]).toMatchObject({
      total_ofertado: 10_000_000,
      adjudicada: true,
      lineas: 1,
      fecha: '2025-09-20',
    });
    expect(filas[2]).toMatchObject({ total_ofertado: 200_000, lineas: 1 });
  });
});

describe('Su precio frente al tuyo, línea a línea', () => {
  it('compara solo las líneas que ofertaron los dos: en otra línea no hay comparación', () => {
    const diferencias = diferenciasDePrecio(
      SOL,
      VDS,
      ACTA,
      undefined,
      undefined,
    );
    expect(diferencias).toHaveLength(1);
    expect(diferencias[0]).toBeCloseTo(20);
    // Centropan ofertó pan, Valle del Sol el almuerzo: antes salía
    // «3.984 % más caro».
    expect(diferenciasDePrecio(PAN, VDS, ACTA, undefined, undefined)).toEqual(
      [],
    );
  });

  it('sin acta (una compra ágil), los totales, solo si cada uno ofertó una línea', () => {
    const [d] = diferenciasDePrecio(
      SOL,
      VDS,
      null,
      { total_ofertado: 900, lineas: 1 },
      { total_ofertado: 1_000, lineas: 1 },
    );
    expect(d).toBeCloseTo(-10);
    expect(
      diferenciasDePrecio(
        SOL,
        VDS,
        null,
        { total_ofertado: 900, lineas: 2 },
        { total_ofertado: 1_000, lineas: 1 },
      ),
    ).toEqual([]);
  });
});

describe('Tus competidores', () => {
  const CON_LA_EMPRESA = ofertasDelActa(PROCESO, ACTA);
  const HISTORIAL = [
    oferta({
      codigo: 'OTRA-1',
      rut: SOL,
      adjudicada: true,
      total_adjudicado: 3_000_000,
      organismo: 'DAEM Quillón',
      fecha: '2026-03-01',
    }),
    oferta({
      codigo: 'OTRA-2',
      rut: SOL,
      organismo: 'DAEM Quillón',
      fecha: '2024-05-01',
    }),
  ];

  it('solo los que ofertaron donde ofertó la empresa y los que sigue; con su historia en la zona y el precio por línea', () => {
    const lista = competidoresReales({
      rutEmpresa: '77.701.305-K',
      ofertasConLaEmpresa: CON_LA_EMPRESA,
      historial: HISTORIAL,
      actas: new Map([[PROCESO.codigo, ACTA]]),
      marcas: [
        {
          rut: '96555444-1',
          nombre: 'HOTEL SEGUIDO',
          seguido: true,
          descartado: false,
        },
      ],
    });
    expect(lista.map((c) => c.rut)).toEqual(['96555444-1', SOL, PAN]);
    expect(lista[1]).toMatchObject({
      etiquetas: ['compitio'],
      encuentros: 1,
      te_gano: 0,
      ganaste: 1,
      diferencia_de_precio: 20,
      lineas_comparadas: 1,
      participaciones: 3,
      ganadas: 1,
      monto_ganado: 3_000_000,
      ultima: '2026-03-01',
      comprador_principal: { nombre: 'DAEM Quillón', veces: 2 },
    });
    expect(lista[2]).toMatchObject({
      diferencia_de_precio: null,
      lineas_comparadas: 0,
    });
    expect(lista[0]).toMatchObject({ etiquetas: ['seguido'], encuentros: 0 });
  });

  it('«No es mi competidor» queda marcado (la pantalla lo esconde y se recupera)', () => {
    const lista = competidoresReales({
      rutEmpresa: VDS,
      ofertasConLaEmpresa: CON_LA_EMPRESA,
      historial: [],
      actas: new Map(),
      marcas: [{ rut: PAN, nombre: null, seguido: false, descartado: true }],
    });
    expect(lista.find((c) => c.rut === PAN)?.descartado).toBe(true);
  });
});

describe('El estudio de mercado de un competidor', () => {
  it('todas sus licitaciones (ganadas y perdidas, con quién ganó), lo que ganó sin acta, a quién le vende y cuándo compitió contigo', () => {
    const ficha = fichaDeMercado({
      rut: '77.067.895-1',
      rutEmpresa: VDS,
      ofertas: [
        oferta({
          codigo: PROCESO.codigo,
          rut: SOL,
          proveedor: 'SOL',
          total_ofertado: 12_000_000,
          lineas: 1,
          organismo: 'Quillón',
          fecha: '2025-09-20',
        }),
        oferta({
          codigo: 'OTRA-1',
          rut: SOL,
          proveedor: 'SOL',
          adjudicada: true,
          total_adjudicado: 3_000_000,
          organismo: 'DAEM Quillón',
          fecha: '2026-03-01',
        }),
      ],
      enSusLicitaciones: [
        ...ofertasDelActa(PROCESO, ACTA),
        oferta({
          codigo: 'OTRA-1',
          rut: SOL,
          adjudicada: true,
          total_adjudicado: 3_000_000,
          organismo: 'DAEM Quillón',
          fecha: '2026-03-01',
        }),
        oferta({ codigo: 'OTRA-1', rut: '78000111-2', proveedor: 'OTRO' }),
      ],
      triunfosDeLaZona: [
        {
          codigo: 'OTRA-1',
          nombre: 'x',
          organismo: 'DAEM Quillón',
          comuna: null,
          fecha_publicacion: '2026-03-01T00:00:00Z',
          monto: 3_000_000,
          oferentes: 2,
        },
        {
          codigo: 'SIN-ACTA',
          nombre: 'Cena de fin de año',
          organismo: 'Hospital de Bulnes',
          comuna: 'Bulnes',
          fecha_publicacion: '2024-12-01T00:00:00Z',
          monto: 800_000,
          oferentes: 3,
        },
      ],
      actas: new Map([[PROCESO.codigo, ACTA]]),
      marca: null,
    })!;
    expect(ficha.nombre).toBe('SOL');
    expect(ficha.resumen).toMatchObject({
      participaciones: 3,
      ganadas: 2,
      perdidas: 1,
      monto_ganado: 3_800_000,
      ultima: '2026-03-01',
    });
    expect(ficha.resumen.compradores[0]).toEqual({
      nombre: 'DAEM Quillón',
      veces: 1,
      ganadas: 1,
    });
    expect(
      ficha.licitaciones.map((l) => [l.codigo, l.gano, l.contigo]),
    ).toEqual([
      ['OTRA-1', true, false],
      [PROCESO.codigo, false, true],
      ['SIN-ACTA', true, false],
    ]);
    const perdida = ficha.licitaciones[1];
    expect(perdida.ganadores).toEqual([
      { rut: VDS, nombre: 'VALLE DEL SOL QUILLON SPA', monto: 5_000_000 },
    ]);
    expect(perdida.ofertas).toBe(3);
    expect(ficha.encuentros).toEqual([
      expect.objectContaining({
        codigo: PROCESO.codigo,
        gano_el: false,
        ganaste: true,
        diferencia_de_precio: 20,
        lineas_comparadas: 1,
      }),
    ]);
  });

  it('sin nada en las actas ni en lo adjudicado, no hay ficha', () => {
    expect(
      fichaDeMercado({
        rut: SOL,
        rutEmpresa: VDS,
        ofertas: [],
        enSusLicitaciones: [],
        triunfosDeLaZona: [],
        actas: new Map(),
        marca: null,
      }),
    ).toBeNull();
  });
});

const ligero = (
  codigo: string,
  extra: Partial<ProcesoLigero> = {},
): ProcesoLigero => ({
  codigo,
  region: 'Región del Ñuble',
  comuna: 'Chillán',
  organismo_codigo: '9999',
  fecha_publicacion: '2025-01-01T00:00:00Z',
  url_acta: `https://www.mercadopublico.cl/acta?qs=${codigo}`,
  acta_leida_en: null,
  ofertas_leidas_en: null,
  con_ganadores: true,
  ...extra,
});

class ActasDePrueba extends ActasDeLaZonaService {
  protected pausa(): Promise<void> {
    return Promise.resolve();
  }
}

function armarActas() {
  const repo = {
    misLicitaciones: jest
      .fn()
      .mockResolvedValue([{ codigo: 'MIA', organismo_codigo: '4364' }]),
    ofertasDe: jest
      .fn()
      .mockResolvedValue([
        oferta({ codigo: 'VIEJA', rut: VDS, organismo_codigo: '4366' }),
      ]),
    zonaLigera: jest
      .fn()
      .mockResolvedValue([
        ligero('RESTO-NUEVA', { fecha_publicacion: '2026-01-01T00:00:00Z' }),
        ligero('RESTO-VIEJA'),
        ligero('COMUNA', { comuna: 'Quillón' }),
        ligero('COMPRADOR', { organismo_codigo: '4366' }),
        ligero('MIA'),
        ligero('LEIDA', { ofertas_leidas_en: '2026-10-23T00:00:00Z' }),
        ligero('SIN-ACTA', { url_acta: null }),
        ligero('OTRA-REGION', { region: 'Región Metropolitana' }),
      ]),
    procesosParaActa: jest.fn((codigos: string[]) =>
      Promise.resolve(
        codigos.map((codigo) => ({
          ...PROCESO,
          codigo,
          url_acta: `https://x/${codigo}`,
          acta_guardada: codigo === 'MIA',
        })),
      ),
    ),
    actaGuardada: jest.fn().mockResolvedValue(ACTA),
    guardarOfertas: jest.fn().mockResolvedValue(undefined),
    olvidarLaZona: jest.fn(),
  };
  const oportunidades = {
    configDe: jest.fn().mockResolvedValue({
      regiones: ['Ñuble'],
      comunas_cercanas: ['Quillón'],
      perfil: null,
    }),
  };
  const oferente = {
    oferente: jest.fn().mockResolvedValue({ rut: '77.701.305-K' }),
  };
  const servicio = new ActasDePrueba(
    repo as unknown as CompetenciaRepository,
    oportunidades as unknown as OportunidadesRepository,
    oferente as unknown as OferenteRepository,
    mockPinoLogger() as unknown as PinoLogger,
  );
  return { servicio, repo };
}

describe('Las actas de la zona, solas', () => {
  beforeEach(() => acta.bajarActa.mockReset());

  it('en orden: lo suyo, sus compradores, sus comunas y el resto de la región, lo nuevo primero; ni lo leído, ni sin acta, ni otra región', async () => {
    const { servicio } = armarActas();
    expect(await servicio.pendientes(1)).toEqual([
      'MIA',
      'COMPRADOR',
      'COMUNA',
      'RESTO-NUEVA',
      'RESTO-VIEJA',
    ]);
  });

  it('lee y guarda cada una; el acta que guardó «Seguir» no se vuelve a bajar; una que falla no frena las demás', async () => {
    const { servicio, repo } = armarActas();
    acta.bajarActa
      .mockRejectedValueOnce(new Error('el acta respondió 500'))
      .mockResolvedValue('<html></html>');
    const leidas = await servicio.leer(1, Date.now() + 60_000);
    expect(primeros(acta.bajarActa)).toEqual([
      'https://x/COMPRADOR',
      'https://x/COMUNA',
      'https://x/RESTO-NUEVA',
      'https://x/RESTO-VIEJA',
    ]);
    expect(repo.actaGuardada).toHaveBeenCalledWith('MIA');
    expect(primeros(repo.guardarOfertas)).toEqual([
      'MIA',
      'COMUNA',
      'RESTO-NUEVA',
      'RESTO-VIEJA',
    ]);
    expect(leidas).toBe(4);
    expect(repo.olvidarLaZona).toHaveBeenCalled();
  });

  it('cuántas de la zona van leídas, y al abrir la pestaña sigue leyendo solo si falta y nadie lee', async () => {
    const { servicio, repo } = armarActas();
    expect(await servicio.estado(1)).toEqual({
      leidas: 1,
      total: 6,
      leyendo: false,
    });
    let soltar: () => void = () => undefined;
    repo.misLicitaciones.mockReturnValue(
      new Promise((r) => {
        soltar = () => r([]);
      }),
    );
    servicio.leerSiHaceFalta(1, { leidas: 1, total: 6, leyendo: false });
    expect((await servicio.estado(1)).leyendo).toBe(true);
    servicio.leerSiHaceFalta(1, { leidas: 1, total: 6, leyendo: true });
    expect(repo.misLicitaciones).toHaveBeenCalledTimes(1);
    soltar();
    await new Promise((r) => setTimeout(r, 0));
    servicio.leerSiHaceFalta(1, { leidas: 6, total: 6, leyendo: false });
    expect(repo.misLicitaciones).toHaveBeenCalledTimes(1);
  });
});

function armarCompetencia() {
  const repo = {
    ofertasDe: jest.fn((rut: string) =>
      Promise.resolve(
        rut === VDS
          ? [oferta({ codigo: PROCESO.codigo, rut: VDS })]
          : [oferta({ codigo: PROCESO.codigo, rut, proveedor: ' SOL ' })],
      ),
    ),
    ofertasDeLicitaciones: jest
      .fn()
      .mockResolvedValue(ofertasDelActa(PROCESO, ACTA)),
    ofertasDeRuts: jest.fn().mockResolvedValue([]),
    marcas: jest.fn().mockResolvedValue([]),
    actasDe: jest.fn().mockResolvedValue(new Map([[PROCESO.codigo, ACTA]])),
    filasDelRubro: jest.fn().mockResolvedValue([]),
    marcar: jest.fn(
      (_c: number, rut: string, nombre: string | null, cambios: object) =>
        Promise.resolve({ rut, nombre, ...cambios }),
    ),
  };
  const oportunidades = {
    configDe: jest.fn().mockResolvedValue({ regiones: ['Ñuble'] }),
    procesosDeLaZona: jest.fn().mockResolvedValue([]),
  };
  const oferente = {
    oferente: jest.fn().mockResolvedValue({ rut: '77.701.305-K' }),
  };
  const actas = {
    estado: jest
      .fn()
      .mockResolvedValue({ leidas: 10, total: 6000, leyendo: false }),
    leerSiHaceFalta: jest.fn(),
    estaLeyendo: jest.fn().mockReturnValue(true),
  };
  const rubro = {
    estado: jest
      .fn()
      .mockResolvedValue({ revisadas: 0, total: 5900, revisando: false }),
    clasificarSiHaceFalta: jest.fn(),
    estaRevisando: jest.fn().mockReturnValue(false),
  };
  const servicio = new CompetenciaService(
    repo as unknown as CompetenciaRepository,
    oportunidades as unknown as OportunidadesRepository,
    oferente as unknown as OferenteRepository,
    actas as unknown as ActasDeLaZonaService,
    rubro as unknown as RubroService,
    mockPinoLogger() as unknown as PinoLogger,
  );
  return { servicio, repo, actas, rubro, oferente };
}

describe('La competencia, de punta a punta', () => {
  it('la lista sale de las licitaciones de la empresa, con la historia de cada uno; si faltan actas, sigue leyendo sola', async () => {
    const { servicio, repo, actas } = armarCompetencia();
    const r = await servicio.estado(1);
    expect(repo.ofertasDe).toHaveBeenCalledWith(VDS);
    expect(repo.ofertasDeRuts).toHaveBeenCalledWith(
      expect.arrayContaining([SOL, PAN]),
    );
    expect(r.competidores.map((c) => c.rut)).toEqual([SOL, PAN]);
    expect(actas.leerSiHaceFalta).toHaveBeenCalledWith(1, {
      leidas: 10,
      total: 6000,
      leyendo: false,
    });
    // Recién empezó a leer: la pantalla lo sabe y vuelve a preguntar.
    expect(r.actas).toEqual({ leidas: 10, total: 6000, leyendo: true });
  });

  it('la ficha de mercado con el RUT escrito como sea; un RUT raro es 400 y sin nada, 404', async () => {
    const { servicio, repo } = armarCompetencia();
    const ficha = await servicio.ficha(1, '77.067.895-1');
    expect(ficha.rut).toBe(SOL);
    expect(ficha.encuentros).toHaveLength(1);
    await expect(servicio.ficha(1, 'hola')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    repo.ofertasDe.mockResolvedValue([]);
    repo.ofertasDeLicitaciones.mockResolvedValue([]);
    await expect(servicio.ficha(1, SOL)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('«Quién gana en tu zona» sale de lo revisado del rubro; si falta, la IA sigue sola', async () => {
    const { servicio, repo, rubro } = armarCompetencia();
    repo.filasDelRubro.mockResolvedValue([
      {
        codigo: 'A',
        del_rubro: 'si',
        ganadores: [{ rut: SOL, nombre: 'SOL', monto: 1_000 }],
        nombre: 'Cena',
        organismo: 'Quillón',
        comuna: null,
        fecha: '2026-01-01',
      },
    ]);
    const r = await servicio.zona(1);
    expect(r.ranking.map((c) => c.rut)).toEqual([SOL]);
    expect(rubro.clasificarSiHaceFalta).toHaveBeenCalledWith(1, {
      revisadas: 0,
      total: 5900,
      revisando: false,
    });
  });

  it('«Seguir» y «No es mi competidor» con el RUT normalizado; un RUT raro o sin cambios no', async () => {
    const { servicio, repo } = armarCompetencia();
    await servicio.marcar(1, '77.067.895-1', { descartado: true });
    expect(repo.marcar).toHaveBeenCalledWith(1, SOL, 'SOL', {
      descartado: true,
    });
    await expect(
      servicio.marcar(1, 'hola', { seguido: true }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(servicio.marcar(1, SOL, {})).rejects.toThrow(
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
        'lt',
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
    return { repo, pasos, from };
  };

  it('la zona liviana: licitaciones desde una fecha, con el enlace al acta y si tiene ganadores; se guarda diez minutos', async () => {
    const { repo, pasos, from } = armarRepo([
      {
        codigo: 'A',
        region: 'Ñuble',
        url_acta: 'https://x',
        ganador: { rut: '1-9' },
      },
      { codigo: 'B', region: 'Ñuble', url_acta: null, ganador: null },
    ]);
    const filas = await repo.zonaLigera('2023-10-23T00:00:00.000Z');
    expect(filas.map((f) => [f.codigo, f.con_ganadores])).toEqual([
      ['A', true],
      ['B', false],
    ]);
    expect(pasos[0].pasos).toEqual(
      expect.arrayContaining([
        ['eq', 'tipo', 'licitacion'],
        ['gte', 'fecha_publicacion', '2023-10-23T00:00:00.000Z'],
      ]),
    );
    const [, columnas] = pasos[0].pasos[0] as [string, string];
    expect(columnas).toContain('url_acta:adjudicacion->>url_acta');
    expect(columnas).toContain('ganador:adjudicacion->ganadores->0');
    await repo.zonaLigera('2023-10-23T05:00:00.000Z');
    expect(from).toHaveBeenCalledTimes(1);
    repo.olvidarLaZona();
    await repo.zonaLigera('2023-10-23T05:00:00.000Z');
    expect(from).toHaveBeenCalledTimes(2);
  });

  it('los procesos para leer: solo con enlace al acta, y si «Seguir» ya la guardó', async () => {
    const { repo } = armarRepo([
      {
        ...PROCESO,
        adjudicacion: { url_acta: 'https://x' },
        acta_leida_en: '2026-10-20',
      },
      { ...PROCESO, codigo: 'SIN', adjudicacion: null, acta_leida_en: null },
    ]);
    expect(await repo.procesosParaActa(['4364-5-LE25', 'SIN'])).toEqual([
      { ...PROCESO, url_acta: 'https://x', acta_guardada: true },
    ]);
  });

  it('guardar las ofertas: reemplazan las de antes y el proceso queda pasado (con su acta, si se bajó)', async () => {
    const { repo, pasos } = armarRepo();
    const filas = ofertasDelActa(PROCESO, ACTA);
    await repo.guardarOfertas('4364-5-LE25', filas, ACTA);
    expect(pasos.map((p) => p.tabla)).toEqual([
      'mp_ofertas',
      'mp_ofertas',
      'mp_procesos',
    ]);
    const [, cambios] = pasos[2].pasos[0] as [string, Record<string, unknown>];
    expect(Object.keys(cambios).sort()).toEqual([
      'acta',
      'acta_leida_en',
      'ofertas_leidas_en',
    ]);
  });

  it('las marcas son de la empresa, sin lo que decía la IA; marcar hace upsert por empresa y RUT', async () => {
    const { repo, pasos } = armarRepo({ rut: SOL });
    await repo.marcar(1, SOL, 'SOL', { seguido: true });
    const [, fila, opciones] = pasos[0].pasos.find(([m]) => m === 'upsert') as [
      string,
      Record<string, unknown>,
      unknown,
    ];
    expect(fila).toMatchObject({ company_id: 1, rut: SOL, seguido: true });
    expect(opciones).toEqual({ onConflict: 'company_id,rut' });
    const r2 = armarRepo([]);
    await r2.repo.marcas(1);
    const [, columnas] = r2.pasos[0].pasos[0] as [string, string];
    expect(columnas).not.toContain('parecido');
    expect(r2.pasos[0].pasos).toEqual(
      expect.arrayContaining([['eq', 'company_id', 1]]),
    );
  });
});
