import type Anthropic from '@anthropic-ai/sdk';
import { BadRequestException } from '@nestjs/common';
import type { PinoLogger } from 'nestjs-pino';
import { writeFile } from 'node:fs/promises';
import type { SupabaseService } from 'src/supabase/supabase.service';
import { mockPinoLogger } from 'src/testing/mocks';
import type { ActasDeLaZonaService } from '../competencia/actas.service';
import type { CompetenciaRepository } from '../competencia/competencia.repository';
import { CompetenciaService } from '../competencia/competencia.service';
import type { RubroService } from '../competencia/rubro.service';
import type { ComprasAgilesDelMes } from '../datos-abiertos/compras-agiles-del-mes';
import {
  diaUnoDe,
  mesesHaciaAtras,
  urlDelArchivo,
} from '../datos-abiertos/datos-abiertos';
import type {
  CargaDelMercado,
  DatosAbiertosRepository,
} from '../datos-abiertos/datos-abiertos.repository';
import {
  cambioLaUnion,
  DatosAbiertosService,
} from '../datos-abiertos/datos-abiertos.service';
import type { FilaDeLaZona } from '../datos-abiertos/mercado-de-la-zona';
import { MercadoDeLaZonaRepository } from '../datos-abiertos/mercado-de-la-zona.repository';
import type { FichaRepository } from '../ficha/ficha.repository';
import type { SeVieneService } from '../historia/se-viene.service';
import type { MercadoPublicoClient } from '../mercado-publico/mercado-publico.client';
import type { OferenteRepository } from '../oferente/oferente.repository';
import type { OportunidadesRepository } from '../oportunidades.repository';
import { OportunidadesService } from '../oportunidades.service';
import { huellaDelPerfil, reglasDeLaUnion } from '../rubro/rubro-de-la-empresa';
import {
  CODIGO_SOLO_RUBRO_GENERAL,
  RubroDeLaEmpresaService,
} from '../rubro/rubro-de-la-empresa.service';
import {
  csvDePrueba,
  filaDeCompraAgil,
  filaDeLicitacion,
  zipDePrueba,
} from './datos-abiertos-de-prueba';

// EL RUBRO DE CADA EMPRESA EN EL MOTOR (Licita, 25-11). Solo en una
// instalación de rubro «general»: el cargador guarda con la unión de reglas
// y marca cada mes; el mercado de la zona se lee por empresa y vacío es
// vacío; «Leer mi rubro» propone y guardar rehace las marcas. En «eventos»
// nada de esto se lee (lo amarran también las pruebas de siempre).

const antes = process.env.OPORTUNIDADES_RUBRO;
const llaveDeAntes = process.env.ANTHROPIC_API_KEY;
const enGeneral = () => {
  process.env.OPORTUNIDADES_RUBRO = 'general';
};
afterEach(() => {
  if (antes === undefined) delete process.env.OPORTUNIDADES_RUBRO;
  else process.env.OPORTUNIDADES_RUBRO = antes;
  if (llaveDeAntes === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = llaveDeAntes;
});

const logger = () => mockPinoLogger() as unknown as PinoLogger;

// ─── el cargador ──────────────────────────────────────────────────────────

const [MES] = mesesHaciaAtras(new Date(), 1);
const DIA = diaUnoDe(MES);
const URL_LIC = urlDelArchivo('licitaciones', MES);
const URL_COT = urlDelArchivo('compra_agil', MES);
const MODIFICADO = 'Wed, 28 Oct 2026 14:37:47 GMT';
const ZIPS: Record<string, Buffer> = {
  [URL_LIC]: zipDePrueba([
    {
      nombre: 'lic.csv',
      contenido: csvDePrueba([
        filaDeLicitacion({
          'Nombre producto genrico': 'Servicios de catering',
        }),
      ]),
    },
  ]),
  [URL_COT]: zipDePrueba([
    {
      nombre: 'COT.csv',
      contenido: csvDePrueba([
        filaDeCompraAgil(),
        filaDeCompraAgil({
          CodigoCotizacion: '3497-480-COT26',
          NombreCotizacion: 'RESMAS DE PAPEL',
          CodigoProducto: '14111507',
          NombreProductoGenerico: 'Papel para impresora',
        }),
      ]),
    },
  ]),
};

class RepoDelCargador {
  registradas: CargaDelMercado[] = [];
  cambios: Array<{ fuente: string; mes: string } & Record<string, unknown>> =
    [];
  comprasAgiles: ComprasAgilesDelMes[] = [];
  cargas = jest.fn(() => Promise.resolve(this.registradas));
  marcarCarga = jest.fn(
    (fuente: string, mes: string, c: Record<string, unknown>) => {
      this.cambios.push({ fuente, mes, ...c });
      return Promise.resolve();
    },
  );
  guardarLicitaciones = jest.fn(() => Promise.resolve());
  guardarComprasAgiles = jest.fn((_mes: string, c: ComprasAgilesDelMes) => {
    this.comprasAgiles.push(c);
    return Promise.resolve();
  });
  resumirMes = jest.fn(() => Promise.resolve({ procesos: 1 }));
  reglasDeLasEmpresas = jest.fn(() =>
    Promise.resolve([
      { company_id: 7, onu_familias: ['1411'], palabras: ['resma'] },
    ]),
  );
  anotarProductosOnu = jest.fn(() => Promise.resolve());
  marcarMes = jest.fn(() => Promise.resolve(3));
}

const armarCargador = () => {
  const repo = new RepoDelCargador();
  const servicio = new DatosAbiertosService(
    repo as unknown as DatosAbiertosRepository,
    logger(),
  );
  const bajadas: string[] = [];
  servicio.red = {
    cabecera: () =>
      Promise.resolve({ existe: true, modificado: MODIFICADO, bytes: 10 }),
    bajar: async (url, ruta) => {
      bajadas.push(url);
      await writeFile(ruta, ZIPS[url]);
    },
  };
  return { repo, servicio, bajadas };
};

const UNA_HORA = () => Date.now() + 3_600_000;
const UNION = reglasDeLaUnion([
  { onu_familias: ['1411'], palabras: ['resma'] },
]);

describe('el cargador en «general»', () => {
  it('guarda las compras ágiles con la unión de reglas, anota la huella y el catálogo, y marca cada mes resumido', async () => {
    enGeneral();
    const { repo, servicio } = armarCargador();
    await servicio.cargar({ hasta: UNA_HORA(), meses: 1, origen: 'prueba' });
    // La unión busca «resma» y la familia 1411: la de papel, no la del
    // día del funcionario (que en Eventia sí se guardaría).
    expect(repo.comprasAgiles[0].solicitudes.map((s) => s.codigo)).toEqual([
      '3497-480-COT26',
    ]);
    const listas = repo.cambios.filter((c) => c.estado === 'lista');
    expect(listas.map((c) => c.reglas_huella)).toEqual([
      UNION.huella,
      UNION.huella,
    ]);
    expect(repo.marcarMes.mock.calls).toEqual([
      ['licitaciones', DIA],
      ['compra_agil', DIA],
    ]);
    const anotados = (
      repo.anotarProductosOnu.mock.calls as unknown as Array<
        [Array<{ codigo: string; nombre: string; veces: number }>]
      >
    ).flatMap(([p]) => p);
    expect(anotados).toEqual(
      expect.arrayContaining([
        { codigo: '90101603', nombre: 'Servicios de catering', veces: 1 },
        { codigo: '14111507', nombre: 'Papel para impresora', veces: 1 },
      ]),
    );
  });

  it('si cambió la unión, vuelve a bajar las compras ágiles del mes aunque el archivo sea el mismo; las licitaciones no', async () => {
    enGeneral();
    const { repo, servicio, bajadas } = armarCargador();
    repo.registradas = [
      {
        fuente: 'licitaciones',
        mes: DIA,
        estado: 'lista',
        archivo_modificado: MODIFICADO,
        reglas_huella: 'otra',
      } as CargaDelMercado,
      {
        fuente: 'compra_agil',
        mes: DIA,
        estado: 'lista',
        archivo_modificado: MODIFICADO,
        reglas_huella: 'otra',
      } as CargaDelMercado,
    ];
    const resumen = await servicio.cargar({
      hasta: UNA_HORA(),
      meses: 1,
      origen: 'prueba',
    });
    expect(bajadas).toEqual([URL_COT]);
    expect(resumen).toMatchObject({ cargadas: 1, sinCambios: 1 });
  });

  it('cambioLaUnion: solo compras ágiles, solo los últimos 8 meses y solo en «general»', () => {
    const hoy = new Date();
    const reciente = diaUnoDe(mesesHaciaAtras(hoy, 8)[7]);
    const viejo = diaUnoDe(mesesHaciaAtras(hoy, 9)[8]);
    const carga = { reglas_huella: 'otra' } as CargaDelMercado;
    expect(cambioLaUnion('compra_agil', reciente, carga, UNION, hoy)).toBe(
      true,
    );
    expect(cambioLaUnion('compra_agil', viejo, carga, UNION, hoy)).toBe(false);
    expect(cambioLaUnion('licitaciones', reciente, carga, UNION, hoy)).toBe(
      false,
    );
    expect(cambioLaUnion('compra_agil', reciente, carga, null, hoy)).toBe(
      false,
    );
    expect(
      cambioLaUnion(
        'compra_agil',
        reciente,
        { reglas_huella: UNION.huella } as CargaDelMercado,
        UNION,
        hoy,
      ),
    ).toBe(false);
  });

  it('en «eventos» no lee reglas, no marca, no anota catálogo ni huella', async () => {
    const { repo, servicio } = armarCargador();
    await servicio.cargar({ hasta: UNA_HORA(), meses: 1, origen: 'prueba' });
    expect(repo.reglasDeLasEmpresas).not.toHaveBeenCalled();
    expect(repo.marcarMes).not.toHaveBeenCalled();
    expect(repo.anotarProductosOnu).not.toHaveBeenCalled();
    expect(repo.cambios.some((c) => 'reglas_huella' in c)).toBe(false);
    expect(repo.comprasAgiles[0].solicitudes.map((s) => s.codigo)).toEqual([
      '3497-466-COT26',
    ]);
  });

  it('si marcar el mes falla, el mes queda resumido y la carga sigue', async () => {
    enGeneral();
    const { repo, servicio } = armarCargador();
    repo.marcarMes.mockRejectedValue(new Error('tope de tiempo'));
    const resumen = await servicio.cargar({
      hasta: UNA_HORA(),
      meses: 1,
      origen: 'prueba',
    });
    expect(resumen).toMatchObject({ cargadas: 2, errores: 0, resumidas: 2 });
  });
});

// ─── el mercado de la zona, por empresa ──────────────────────────────────

const fila = (codigo: string, cambios: Partial<FilaDeLaZona> = {}) =>
  ({
    codigo,
    nombre: 'ASEO INDUSTRIAL HOSPITAL',
    organismo: 'SERVICIO DE SALUD ÑUBLE',
    organismo_codigo: '111',
    unidad: null,
    comuna: 'Chillán',
    region: 'Región del Ñuble',
    fecha_publicacion: new Date().toISOString().slice(0, 10),
    fecha_cierre: null,
    monto_estimado: 10_000_000,
    oferentes: 2,
    rubros: [],
    ganadores: [
      { rut: '76111111-1', nombre: 'LIMPIA', cantidad: 1, monto_unitario: 9 },
    ],
    ...cambios,
  }) as FilaDeLaZona;

function armarZona(
  porLlamada: (args: Record<string, unknown>) => FilaDeLaZona[] = () => [],
) {
  const rpc = jest.fn((nombre: string, args: Record<string, unknown>) =>
    Promise.resolve({
      data: nombre === 'mercado_zona_de_empresa' ? porLlamada(args) : 42,
      error: null,
    }),
  );
  const tablas: string[] = [];
  const from = jest.fn((tabla: string) => {
    tablas.push(tabla);
    const cadena: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'in', 'gte', 'gt', 'order', 'limit']) {
      cadena[m] = () => cadena;
    }
    cadena.then = (bien: (v: unknown) => unknown) =>
      Promise.resolve({ data: [], error: null }).then(bien);
    return cadena;
  });
  const largo = {
    rpc: jest.fn(() => Promise.resolve({ data: 42, error: null })),
  };
  const repo = new MercadoDeLaZonaRepository({
    client: { from, rpc },
    clientParaTrabajosLargos: largo,
  } as unknown as SupabaseService);
  return { repo, rpc, from, tablas, largo };
}

describe('el mercado de la zona en «general»: cada empresa con su rubro', () => {
  it('lee las marcas de la empresa por la función, una región a la vez, sin tocar la marca de eventos', async () => {
    enGeneral();
    const { repo, rpc, tablas } = armarZona((a) =>
      a.p_region === 16 ? [fila('1-1-LE25')] : [],
    );
    const procesos = await repo.procesosDeLaZona(['Ñuble', 'Biobío'], 7);
    expect(procesos.map((p) => p.codigo)).toEqual(['1-1-LE25']);
    expect(
      rpc.mock.calls.map(([n, a]) => [n, a.p_company, a.p_region]),
    ).toEqual([
      ['mercado_zona_de_empresa', 7, 8],
      ['mercado_zona_de_empresa', 7, 16],
    ]);
    expect(rpc.mock.calls[0][1]).toMatchObject({
      p_tipo: 'licitacion',
      p_despues: null,
      p_limite: 1000,
    });
    // Ni la capa con la marca ni la vista de la 169.
    expect(tablas).toEqual([]);
  });

  it('pagina por código: la página siguiente pide después del último', async () => {
    enGeneral();
    const llena = Array.from({ length: 1000 }, (_, i) =>
      fila(`A-${String(i).padStart(4, '0')}`),
    );
    const { repo, rpc } = armarZona((a) =>
      a.p_despues === null ? llena : [fila('B-1')],
    );
    const procesos = await repo.procesosDeLaZona(['Ñuble'], 7);
    expect(procesos).toHaveLength(1001);
    expect(rpc.mock.calls[1][1].p_despues).toBe('A-0999');
  });

  it('vacío es vacío (nada de respaldo), sin empresa no lee, y la memoria es por empresa', async () => {
    enGeneral();
    const { repo, rpc, tablas } = armarZona();
    expect(await repo.procesosDeLaZona(['Ñuble'], 7)).toEqual([]);
    expect(tablas).toEqual([]);
    await repo.procesosDeLaZona(['Ñuble'], 7);
    expect(rpc).toHaveBeenCalledTimes(1);
    await repo.procesosDeLaZona(['Ñuble'], 8);
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(await repo.procesosDeLaZona(['Ñuble'])).toEqual([]);
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it('«el año anterior» sale de la zona de la empresa: esos compradores, con ganador y de los últimos 31 meses', async () => {
    enGeneral();
    const { repo } = armarZona(() => [
      fila('BIEN'),
      fila('OTRO-COMPRADOR', { organismo_codigo: '999' }),
      fila('SIN-GANADOR', { ganadores: null }),
      fila('MUY-VIEJA', { fecha_publicacion: '2020-01-01' }),
    ]);
    const pasados = await repo.historialDeOrganismos(['111'], {
      companyId: 7,
      regiones: ['Ñuble'],
    });
    expect(pasados?.map((p) => p.codigo)).toEqual(['BIEN']);
    expect(await repo.historialDeOrganismos(['111'])).toEqual([]);
  });

  it('«lo que ya salió»: el radar como siempre y las compras ágiles marcadas de la empresa', async () => {
    enGeneral();
    const { repo, rpc, tablas } = armarZona((a) =>
      a.p_tipo === 'compra_agil'
        ? [fila('CA-1'), fila('CA-VIEJA', { fecha_publicacion: '2020-01-01' })]
        : [],
    );
    const recientes = await repo.recientesDeLaZona(['Ñuble'], 7);
    expect(tablas).toEqual(['mp_procesos']);
    expect(recientes.map((r) => r.codigo)).toEqual(['CA-1']);
    const args = rpc.mock.calls[0][1];
    expect(args).toMatchObject({ p_company: 7, p_tipo: 'compra_agil' });
    expect(String(args.p_desde)).toMatch(/^\d{4}-\d{2}-01$/);
  });

  it('marcar una empresa va por el cliente de trabajos largos y olvida lo guardado de ella', async () => {
    enGeneral();
    const { repo, rpc, largo } = armarZona(() => [fila('1-1-LE25')]);
    await repo.procesosDeLaZona(['Ñuble'], 7);
    expect(await repo.marcarEmpresa(7)).toBe(42);
    expect(largo.rpc).toHaveBeenCalledWith('mercado_marcar_empresa', {
      p_company: 7,
    });
    await repo.procesosDeLaZona(['Ñuble'], 7);
    expect(rpc).toHaveBeenCalledTimes(2);
  });
});

// ─── los servicios que leen la zona ───────────────────────────────────────

function armarOportunidades(mercado: Record<string, jest.Mock>) {
  const repo = {
    configDe: jest.fn().mockResolvedValue({ regiones: ['Ñuble'] }),
    datosDeEmpresa: jest.fn().mockResolvedValue(null),
    procesosDeLaZona: jest.fn().mockResolvedValue([{ codigo: 'RADAR' }]),
    historialDeOrganismos: jest.fn().mockResolvedValue([{ codigo: 'RADAR' }]),
    listar: jest.fn().mockResolvedValue([
      {
        id: 1,
        codigo: 'C-1',
        leida_con: null,
        proceso: {
          fecha_cierre: null,
          nombre: 'Aseo',
          organismo_codigo: '111',
          fecha_publicacion: null,
        },
      },
    ]),
  };
  const seViene = {
    conSemaforo: jest.fn((_e: number, series: unknown[]) =>
      Promise.resolve(series),
    ),
  };
  const servicio = new OportunidadesService(
    repo as unknown as OportunidadesRepository,
    {} as MercadoPublicoClient,
    logger(),
    {} as FichaRepository,
    seViene as unknown as SeVieneService,
    undefined,
    mercado as unknown as MercadoDeLaZonaRepository,
  );
  return { servicio, repo };
}

describe('Oportunidades y Competidores en «general»: sin respaldo de toda la región', () => {
  it('competidores y «Se viene» piden la zona de la empresa y no caen al radar', async () => {
    enGeneral();
    const mercado = {
      procesosDeLaZona: jest.fn().mockResolvedValue([]),
      recientesDeLaZona: jest.fn().mockResolvedValue([]),
    };
    const { servicio, repo } = armarOportunidades(mercado);
    expect(await servicio.competidores(5)).toEqual([]);
    await servicio.calendario(5);
    expect(mercado.procesosDeLaZona).toHaveBeenCalledWith(['Ñuble'], 5);
    expect(mercado.recientesDeLaZona).toHaveBeenCalledWith(['Ñuble'], 5);
    expect(repo.procesosDeLaZona).not.toHaveBeenCalled();
  });

  it('«el año anterior» de la bandeja: con el rubro y las regiones de la empresa, sin la historia del radar', async () => {
    enGeneral();
    const mercado = {
      procesosDeLaZona: jest.fn().mockResolvedValue([]),
      historialDeOrganismos: jest.fn().mockResolvedValue([]),
    };
    const { servicio, repo } = armarOportunidades(mercado);
    const filas = await servicio.listar(5, {});
    expect(filas[0].anterior).toBeNull();
    expect(mercado.historialDeOrganismos).toHaveBeenCalledWith(['111'], {
      companyId: 5,
      regiones: ['Ñuble'],
    });
    expect(repo.historialDeOrganismos).not.toHaveBeenCalled();
  });

  it('el estudio de mercado de un competidor tampoco cae al radar', async () => {
    enGeneral();
    const mercado = { procesosDeLaZona: jest.fn().mockResolvedValue([]) };
    const oportunidades = {
      configDe: jest.fn().mockResolvedValue({ regiones: ['Ñuble'] }),
      procesosDeLaZona: jest.fn().mockResolvedValue([]),
    };
    const repo = {
      ofertasDe: jest.fn().mockResolvedValue([]),
      ofertasDeLicitaciones: jest.fn().mockResolvedValue([]),
      marcas: jest.fn().mockResolvedValue([]),
      actasDe: jest.fn().mockResolvedValue(new Map()),
    };
    const servicio = new CompetenciaService(
      repo as unknown as CompetenciaRepository,
      oportunidades as unknown as OportunidadesRepository,
      {
        oferente: jest.fn().mockResolvedValue(null),
      } as unknown as OferenteRepository,
      {} as ActasDeLaZonaService,
      {} as RubroService,
      logger(),
      mercado as unknown as MercadoDeLaZonaRepository,
    );
    await expect(servicio.ficha(5, '76.111.111-1')).rejects.toThrow();
    expect(mercado.procesosDeLaZona).toHaveBeenCalledWith(['Ñuble'], 5);
    expect(oportunidades.procesosDeLaZona).not.toHaveBeenCalled();
  });
});

// ─── «Leer mi rubro desde el perfil» ─────────────────────────────────────

const PERFIL =
  'Aseo industrial y de oficinas en Concepción. No hacemos control de plagas.';

function armarRubro(config: Record<string, unknown> | null, salida?: unknown) {
  const repo = {
    configDe: jest.fn().mockResolvedValue(config),
    guardarConfig: jest.fn().mockResolvedValue(undefined),
  };
  const mercado = {
    catalogoOnu: jest.fn().mockResolvedValue([
      { codigo: '76111501', nombre: 'Servicios de aseo', veces: 40 },
      { codigo: '90101603', nombre: 'Servicios de catering', veces: 50 },
    ]),
    marcarEmpresa: jest.fn().mockResolvedValue(12),
  };
  const parse = jest.fn().mockResolvedValue({
    parsed_output: salida ?? null,
    usage: { input_tokens: 100, output_tokens: 20 },
  });
  class Probado extends RubroDeLaEmpresaService {
    protected cliente(): Anthropic {
      return { messages: { parse } } as unknown as Anthropic;
    }
  }
  const servicio = new Probado(
    repo as unknown as OportunidadesRepository,
    mercado as unknown as MercadoDeLaZonaRepository,
    logger(),
  );
  return { servicio, repo, mercado, parse };
}

describe('«Leer mi rubro desde el perfil»', () => {
  it('en «eventos» las tres puertas dicen que no corresponde', async () => {
    const { servicio, repo } = armarRubro({ perfil: PERFIL });
    for (const intento of [
      () => servicio.leer(1),
      () => servicio.proponer(1),
      () => servicio.guardar(1, { onu_familias: ['7611'] }),
    ]) {
      const error = await intento().catch((e: unknown) => e);
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toMatchObject({
        codigo: CODIGO_SOLO_RUBRO_GENERAL,
      });
    }
    expect(repo.configDe).not.toHaveBeenCalled();
  });

  it('la IA chica lee el perfil con el menú cerrado; quedan solo códigos del menú y no se guarda nada', async () => {
    enGeneral();
    process.env.ANTHROPIC_API_KEY = 'prueba';
    const { servicio, repo, parse } = armarRubro(
      { perfil: PERFIL },
      {
        onu_familias: ['7611', '43211507'],
        palabras: ['Aseo', 'limpiez'],
        palabras_no: ['plaga'],
        razon: 'Vende aseo industrial.',
      },
    );
    const propuesta = await servicio.proponer(3);
    expect(propuesta).toMatchObject({
      onu_familias: ['7611'],
      palabras: ['aseo', 'limpiez'],
      palabras_no: ['plaga'],
      razon: 'Vende aseo industrial.',
    });
    expect(propuesta.menu).toEqual([
      { codigo: '7611', ejemplos: ['Servicios de aseo'] },
    ]);
    const pedido = (parse.mock.calls as unknown[][])[0][0] as {
      model: string;
      system: Array<{ text: string }>;
      messages: Array<{ content: string }>;
    };
    expect(pedido.model).toBe('claude-haiku-5-5');
    expect(pedido.system[0].text).toContain('761115: Servicios de aseo');
    expect(pedido.messages[0].content).toContain(PERFIL);
    expect(repo.guardarConfig).not.toHaveBeenCalled();
  });

  it('sin perfil no llama a la IA', async () => {
    enGeneral();
    process.env.ANTHROPIC_API_KEY = 'prueba';
    const { servicio, parse } = armarRubro({ perfil: '  ' });
    await expect(servicio.proponer(3)).rejects.toThrow(BadRequestException);
    expect(parse).not.toHaveBeenCalled();
  });

  it('guardar limpia, anota la huella del perfil y rehace las marcas de la empresa', async () => {
    enGeneral();
    const guardado = {
      perfil: PERFIL,
      onu_familias: ['7611'],
      palabras: ['aseo'],
      palabras_no: [],
      rubro_leido_de: huellaDelPerfil(PERFIL),
    };
    const { servicio, repo, mercado } = armarRubro(guardado);
    const r = await servicio.guardar(3, {
      onu_familias: ['7611', '7611', '12'],
      palabras: [' Aseo '],
      palabras_no: [],
    });
    expect(repo.guardarConfig).toHaveBeenCalledWith(3, {
      onu_familias: ['7611'],
      palabras: ['aseo'],
      palabras_no: [],
      rubro_leido_de: huellaDelPerfil(PERFIL),
    });
    expect(mercado.marcarEmpresa).toHaveBeenCalledWith(3);
    expect(r).toMatchObject({
      marcadas: 12,
      perfil_cambio: false,
      hay_perfil: true,
    });
  });

  it('avisa si el perfil cambió desde que se guardó el rubro; si marcar falla, lo guardado queda', async () => {
    enGeneral();
    const { servicio, mercado } = armarRubro({
      perfil: `${PERFIL} También jardines.`,
      onu_familias: ['7611'],
      palabras: null,
      palabras_no: null,
      rubro_leido_de: huellaDelPerfil(PERFIL),
    });
    expect(await servicio.leer(3)).toMatchObject({
      onu_familias: ['7611'],
      palabras: [],
      perfil_cambio: true,
    });
    mercado.marcarEmpresa.mockRejectedValue(new Error('tope'));
    expect(await servicio.guardar(3, { onu_familias: ['7611'] })).toMatchObject(
      { marcadas: null },
    );
  });
});
