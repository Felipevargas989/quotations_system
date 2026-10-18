import type { PinoLogger } from 'nestjs-pino';
import { mockPinoLogger } from 'src/testing/mocks';
import { HistoriaService } from '../historia/historia.service';
import {
  LECTURA_ACTUAL,
  LecturaDetenida,
  type LecturaService,
  type ProcesoParaLeer,
} from '../lectura/lectura.service';
import {
  type MercadoPublicoClient,
  MercadoPublicoError,
} from '../mercado-publico/mercado-publico.client';
import type {
  OportunidadesRepository,
  ProcesoConocido,
} from '../oportunidades.repository';
import { enParalelo, RadarService } from '../radar.service';

const VDS = { id: 1, name: 'Valle del Sol', high_value_threshold: 3_000_000 };
const CONFIG_VDS = {
  regiones: ['Ñuble', 'Biobío'],
  comunas_cercanas: ['Quillón', 'Bulnes'],
  perfil: 'Complejo turístico en Quillón',
};

// Como la entrega la API: hora de Chile sin zona.
const detalle = (codigo: string) => ({
  CodigoExterno: codigo,
  Nombre: `Proceso ${codigo}`,
  Comprador: {
    NombreOrganismo: 'Municipalidad de Chillán',
    RegionUnidad: 'Región del Ñuble',
  },
  Fechas: { FechaCierre: '2026-10-30T15:00:00' },
});

const abierto = (
  codigo: string,
  extra: Partial<ProcesoParaLeer> = {},
): ProcesoParaLeer => ({
  codigo,
  tipo: 'licitacion',
  nombre: `Proceso ${codigo}`,
  descripcion: null,
  organismo: 'Municipalidad de Chillán',
  unidad: null,
  comuna: null,
  region: 'Región del Ñuble',
  monto: null,
  fecha_cierre: '2026-10-30T18:00:00.000Z',
  productos: [],
  ...extra,
});

const caida = (status = 504) =>
  new MercadoPublicoError(`Mercado Público respondió ${status}`, status);

/** `base` = lo que ya está en mp_procesos (código → cierre y estado,
 *  como los devuelve Postgres). */
function armar(base = new Map<string, ProcesoConocido>()) {
  const leidas = new Set<string>();
  const releer = new Set<string>();
  const mp = {
    configurado: true,
    licitacionesActivas: jest.fn().mockResolvedValue([]),
    detalleLicitacion: jest.fn((codigo: string) =>
      Promise.resolve(detalle(codigo)),
    ),
    comprasAgiles: jest.fn().mockResolvedValue([]),
    detalleCompraAgil: jest.fn().mockResolvedValue(null),
    licitacionesDelDia: jest.fn().mockResolvedValue([]),
  };
  const repo = {
    tomarCorrida: jest.fn().mockResolvedValue(7),
    abandonarCorridasDeAntes: jest.fn().mockResolvedValue(0),
    procesosPorAdjudicar: jest.fn().mockResolvedValue([]),
    siguienteDiaDeHistoria: jest.fn().mockResolvedValue(null),
    marcarDiaDeHistoria: jest.fn().mockResolvedValue(undefined),
    terminarCorrida: jest.fn().mockResolvedValue(undefined),
    ultimaCorridaOk: jest.fn().mockResolvedValue(null),
    procesosConocidos: jest.fn((codigos: string[]) =>
      Promise.resolve(
        new Map([...base].filter(([codigo]) => codigos.includes(codigo))),
      ),
    ),
    guardarProcesos: jest.fn().mockResolvedValue(undefined),
    actualizarCierre: jest.fn().mockResolvedValue(undefined),
    registrarCambios: jest.fn().mockResolvedValue(undefined),
    procesosAbiertos: jest.fn().mockResolvedValue([]),
    empresasConModulo: jest.fn().mockResolvedValue([VDS]),
    configDe: jest.fn().mockResolvedValue(CONFIG_VDS),
    catalogoResumido: jest.fn().mockResolvedValue({
      paquetes: ['Evento: matrimonio'],
      fijos: ['Garzón'],
    }),
    // Como la base: lo que se guarda queda leído para la pasada siguiente;
    // lo de `releer` se leyó con reglas viejas y nadie lo ha tocado.
    lecturasDe: jest.fn(() =>
      Promise.resolve({
        hechas: new Set(leidas),
        releer: new Set([...releer].filter((c) => !leidas.has(c))),
      }),
    ),
    guardarLectura: jest.fn((_empresa: number, codigo: string) => {
      leidas.add(codigo);
      return Promise.resolve();
    }),
  };
  const lectura = {
    configurado: true,
    candidatasPorNombre: jest.fn().mockResolvedValue(new Set<string>()),
    leer: jest.fn().mockResolvedValue({
      semaforo: 'verde',
      etiquetas: ['evento'],
      se_hace_en_el_complejo: 'si',
      razon: 'Es un evento.',
    }),
  };
  const historia = new HistoriaService(
    mp as unknown as MercadoPublicoClient,
    repo as unknown as OportunidadesRepository,
    lectura as unknown as LecturaService,
    mockPinoLogger() as unknown as PinoLogger,
  );
  const radar = new RadarService(
    mp as unknown as MercadoPublicoClient,
    repo as unknown as OportunidadesRepository,
    lectura as unknown as LecturaService,
    historia,
    mockPinoLogger() as unknown as PinoLogger,
  );
  return { mp, repo, lectura, radar, leidas, releer };
}

const guardados = (repo: ReturnType<typeof armar>['repo']) =>
  repo.guardarProcesos.mock.calls.flatMap(([lote]) =>
    (lote as Array<{ codigo: string }>).map((p) => p.codigo),
  );

afterEach(() => jest.restoreAllMocks());

describe('RadarService — el candado', () => {
  it('si ya hay una corrida en marcha, no parte otra', async () => {
    const { radar, repo, mp } = armar();
    repo.tomarCorrida.mockResolvedValue(null);
    await expect(radar.correr('reloj')).resolves.toBeNull();
    await expect(radar.iniciar('manual')).resolves.toBeNull();
    expect(mp.licitacionesActivas).not.toHaveBeenCalled();
    expect(repo.terminarCorrida).not.toHaveBeenCalled();
  });

  it('iniciar devuelve el número de corrida y la deja andando', async () => {
    const { radar, repo } = armar();
    repo.tomarCorrida.mockResolvedValue(9);
    const terminada = new Promise<void>((listo) =>
      repo.terminarCorrida.mockImplementation(() => {
        listo();
        return Promise.resolve();
      }),
    );
    await expect(radar.iniciar('manual')).resolves.toBe(9);
    await terminada;
    expect(repo.terminarCorrida).toHaveBeenCalledWith(
      9,
      'ok',
      expect.any(Object),
    );
  });
});

describe('RadarService — al encender', () => {
  it('suelta el candado de una corrida a medias y nunca lanza', async () => {
    const { radar, repo } = armar();
    await radar.limpiarAlEncender('2026-10-17T03:27:10.000Z');
    expect(repo.abandonarCorridasDeAntes).toHaveBeenCalledWith(
      '2026-10-17T03:27:10.000Z',
    );
    repo.abandonarCorridasDeAntes.mockRejectedValue({ message: 'sin base' });
    await expect(
      radar.limpiarAlEncender('2026-10-17T03:27:10.000Z'),
    ).resolves.toBeUndefined();
  });
});

describe('RadarService — licitaciones: nuevo = "no está en la base"', () => {
  it('solo pide el detalle de lo que no tiene', async () => {
    const base = new Map([
      [
        'A-1-LE26',
        { fecha_cierre: '2026-10-30T18:00:00+00:00', estado: 'Publicada' },
      ],
    ]);
    const { radar, repo, mp } = armar(base);
    mp.licitacionesActivas.mockResolvedValue([
      { CodigoExterno: 'A-1-LE26', FechaCierre: '2026-10-30T15:00:00' },
      { CodigoExterno: 'B-2-LE26', FechaCierre: '2026-10-30T15:00:00' },
      { CodigoExterno: ' C-3-LE26 ', FechaCierre: '2026-10-30T15:00:00' },
      { CodigoExterno: '' },
    ]);

    const resumen = await radar.correr('reloj');

    expect(mp.detalleLicitacion.mock.calls.map(([c]) => c).sort()).toEqual([
      'B-2-LE26',
      'C-3-LE26',
    ]);
    expect(guardados(repo).sort()).toEqual(['B-2-LE26', 'C-3-LE26']);
    // El mismo cierre escrito distinto (Postgres vs. la API) no es un cambio.
    expect(repo.actualizarCierre).not.toHaveBeenCalled();
    expect(repo.registrarCambios).not.toHaveBeenCalled();
    expect(resumen?.licitaciones).toMatchObject({
      estado: 'ok',
      activas: 3,
      nuevas: 2,
      guardadas: 2,
      cambios: 0,
    });
    expect(repo.terminarCorrida).toHaveBeenCalledWith(7, 'ok', resumen);
  });

  it('si movieron la fecha de cierre, se actualiza y queda anotado', async () => {
    const base = new Map([
      [
        'A-1-LE26',
        { fecha_cierre: '2026-10-30T18:00:00+00:00', estado: 'Publicada' },
      ],
    ]);
    const { radar, repo, mp } = armar(base);
    mp.licitacionesActivas.mockResolvedValue([
      { CodigoExterno: 'A-1-LE26', FechaCierre: '2026-11-03T15:00:00' },
    ]);

    const resumen = await radar.correr('reloj');

    expect(repo.actualizarCierre).toHaveBeenCalledWith(
      'A-1-LE26',
      '2026-11-03T18:00:00.000Z',
      null,
    );
    expect(repo.registrarCambios).toHaveBeenCalledWith([
      {
        codigo: 'A-1-LE26',
        tipo: 'fecha_cierre',
        antes: { fecha_cierre: '2026-10-30T18:00:00+00:00' },
        despues: { fecha_cierre: '2026-11-03T18:00:00.000Z' },
      },
    ]);
    expect(mp.detalleLicitacion).not.toHaveBeenCalled();
    expect(resumen?.licitaciones.cambios).toBe(1);
  });

  it('si una cerrada vuelve a estar activa, es una reapertura', async () => {
    const base = new Map([
      [
        'A-1-LE26',
        { fecha_cierre: '2026-10-30T18:00:00+00:00', estado: 'Cerrada' },
      ],
    ]);
    const { radar, repo, mp } = armar(base);
    mp.licitacionesActivas.mockResolvedValue([
      { CodigoExterno: 'A-1-LE26', FechaCierre: '2026-10-30T15:00:00' },
    ]);

    await radar.correr('reloj');

    expect(repo.actualizarCierre).toHaveBeenCalledWith(
      'A-1-LE26',
      '2026-10-30T18:00:00.000Z',
      'Publicada',
    );
    expect(repo.registrarCambios).toHaveBeenCalledWith([
      {
        codigo: 'A-1-LE26',
        tipo: 'reapertura',
        antes: { estado: 'Cerrada' },
        despues: { estado: 'Publicada' },
      },
    ]);
  });

  it('si Mercado Público no entrega la lista, la corrida sigue y lo avisa', async () => {
    const { radar, repo, mp } = armar();
    mp.licitacionesActivas.mockRejectedValue(caida());
    repo.procesosAbiertos.mockResolvedValue([abierto('Z-9-LE26')]);

    const resumen = await radar.correr('reloj');

    expect(resumen?.licitaciones.estado).toBe('caida');
    expect(resumen?.avisos).toContain('Mercado Público respondió 504');
    // Lo que ya está en la base se lee igual.
    expect(resumen?.lectura.leidas).toBe(1);
    expect(repo.terminarCorrida).toHaveBeenCalledWith(7, 'ok', resumen);
  });

  it('diez detalles fallidos seguidos cortan la corrida, y lo ya traído se guarda', async () => {
    const { radar, repo, mp } = armar();
    const codigos = [
      'OK-1',
      'OK-2',
      ...Array.from({ length: 30 }, (_, i) => `F-${i + 1}`),
    ];
    mp.licitacionesActivas.mockResolvedValue(
      codigos.map((c) => ({ CodigoExterno: c })),
    );
    mp.detalleLicitacion.mockImplementation((codigo: string) =>
      codigo.startsWith('OK')
        ? Promise.resolve(detalle(codigo))
        : Promise.reject(caida()),
    );

    const resumen = await radar.correr('reloj');

    expect(resumen?.licitaciones.estado).toBe('cortada');
    expect(resumen?.licitaciones.sin_detalle).toBeGreaterThanOrEqual(10);
    expect(mp.detalleLicitacion.mock.calls.length).toBeLessThan(codigos.length);
    expect(guardados(repo).sort()).toEqual(['OK-1', 'OK-2']);
    expect(repo.terminarCorrida).toHaveBeenCalledWith(7, 'ok', resumen);
  });

  it('pide primero el detalle de lo que cierra antes, de a uno', async () => {
    const { radar, mp } = armar();
    mp.licitacionesActivas.mockResolvedValue([
      { CodigoExterno: 'NOVIEMBRE', FechaCierre: '2026-11-20T15:00:00' },
      { CodigoExterno: 'SIN-CIERRE' },
      { CodigoExterno: 'LUNES', FechaCierre: '2026-10-19T16:00:00' },
    ]);

    await radar.correr('reloj');

    expect(mp.detalleLicitacion.mock.calls.map(([c]) => c)).toEqual([
      'LUNES',
      'NOVIEMBRE',
      'SIN-CIERRE',
    ]);
  });

  it('si se acaba el tiempo de la corrida, deja lo que falta para la próxima', async () => {
    let ahora = new Date('2026-10-17T12:00:00Z').getTime();
    jest.spyOn(Date, 'now').mockImplementation(() => ahora);
    const { radar, repo, mp } = armar();
    mp.licitacionesActivas.mockResolvedValue(
      Array.from({ length: 6 }, (_, i) => ({ CodigoExterno: `L-${i}` })),
    );
    mp.detalleLicitacion.mockImplementation((codigo: string) => {
      ahora += 20 * 60 * 1000; // cada detalle tarda 20 minutos (tope: 45)
      return Promise.resolve(detalle(codigo));
    });

    const resumen = await radar.correr('reloj');

    expect(mp.detalleLicitacion).toHaveBeenCalledTimes(3);
    expect(resumen?.licitaciones).toMatchObject({
      estado: 'cortada',
      nuevas: 6,
      guardadas: 3,
      pendientes: 3,
    });
    expect(resumen?.avisos.join(' ')).toContain('tiempo');
    expect(repo.terminarCorrida).toHaveBeenCalledWith(7, 'ok', resumen);
  });

  it('sin cupo (429) en un detalle corta en seco', async () => {
    const { radar, mp } = armar();
    mp.licitacionesActivas.mockResolvedValue([
      { CodigoExterno: 'A' },
      { CodigoExterno: 'B' },
      { CodigoExterno: 'C' },
      { CodigoExterno: 'D' },
      { CodigoExterno: 'E' },
    ]);
    mp.detalleLicitacion.mockRejectedValue(caida(429));

    const resumen = await radar.correr('reloj');

    expect(resumen?.licitaciones.estado).toBe('cortada');
    expect(mp.detalleLicitacion.mock.calls.length).toBeLessThan(5);
  });

  it('una falla de la base no revienta: la corrida queda en error con su mensaje', async () => {
    const { radar, repo, mp } = armar();
    mp.licitacionesActivas.mockResolvedValue([{ CodigoExterno: 'A' }]);
    // Así llegan los errores de Supabase: objeto plano, no Error.
    repo.procesosConocidos.mockRejectedValue({
      code: '57014',
      message: 'canceling statement due to statement timeout',
    });

    await expect(radar.correr('reloj')).resolves.toBeDefined();
    expect(repo.terminarCorrida).toHaveBeenCalledWith(
      7,
      'error',
      expect.any(Object),
      '57014: canceling statement due to statement timeout',
    );
  });
});

describe('RadarService — compras ágiles', () => {
  const AHORA = new Date('2026-10-16T12:00:00Z').getTime();

  it('pide desde la última corrida buena menos 48 horas, en las regiones configuradas', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(AHORA);
    const { radar, repo, mp } = armar();
    repo.ultimaCorridaOk.mockResolvedValue('2026-10-16T10:00:00.000Z');

    await radar.correr('reloj');

    expect(mp.comprasAgiles).toHaveBeenCalledWith(
      '2026-10-14T10:00:00Z',
      [8, 16],
    );
  });

  it('nunca más de 10 días atrás', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(AHORA);
    const { radar, repo, mp } = armar();
    repo.ultimaCorridaOk.mockResolvedValue('2026-09-01T10:00:00.000Z');

    await radar.correr('reloj');

    expect(mp.comprasAgiles).toHaveBeenCalledWith(
      '2026-10-06T12:00:00Z',
      [8, 16],
    );
  });

  it('guarda todas las nuevas de una con lo de la lista, sin pedir el detalle, primero las que cierran antes (decisión 20)', async () => {
    const base = new Map([
      ['CA-2', { fecha_cierre: null, estado: 'Publicada' }],
    ]);
    const { radar, repo, mp } = armar(base);
    mp.comprasAgiles.mockResolvedValue([
      {
        codigo: 'CA-1',
        nombre: 'Coffee break biblioteca',
        fechas: { fecha_cierre: '2026-10-22 13:00:00' },
      },
      { codigo: 'CA-2', nombre: 'Almuerzo ya guardado' },
      {
        codigo: 'CA-3',
        nombre: 'Cena de fin de año',
        fechas: { fecha_cierre: '2026-10-19 10:00:00' },
      },
    ]);

    const resumen = await radar.correr('reloj');

    expect(mp.detalleCompraAgil).not.toHaveBeenCalled();
    expect(guardados(repo)).toEqual(['CA-3', 'CA-1']);
    expect(resumen?.compras_agiles).toMatchObject({
      estado: 'ok',
      listadas: 3,
      nuevas: 2,
      guardadas: 2,
      pendientes: 0,
    });
  });

  it('aunque sean cientos, entran todas en la misma corrida, de a 100', async () => {
    const { radar, repo, mp } = armar();
    mp.comprasAgiles.mockResolvedValue(
      Array.from({ length: 250 }, (_, i) => ({
        codigo: `CA-${i}`,
        nombre: 'x',
      })),
    );

    const resumen = await radar.correr('reloj');

    // (Quién ganó guarda su lote aunque venga vacío: no cuenta.)
    expect(
      repo.guardarProcesos.mock.calls
        .map(([lote]) => (lote as unknown[]).length)
        .filter((n) => n > 0),
    ).toEqual([100, 100, 50]);
    expect(resumen?.compras_agiles).toMatchObject({
      guardadas: 250,
      pendientes: 0,
    });
  });

  it('van antes que las licitaciones, para que la IA las lea al tiro', async () => {
    const { radar, mp } = armar();
    await radar.correr('reloj');
    expect(mp.comprasAgiles.mock.invocationCallOrder[0]).toBeLessThan(
      mp.licitacionesActivas.mock.invocationCallOrder[0],
    );
  });
});

describe('RadarService — la lectura', () => {
  it('lee una vez por empresa, solo sus regiones, y aplica las reglas', async () => {
    const { radar, repo, lectura, leidas } = armar();
    repo.procesosAbiertos.mockResolvedValue([
      abierto('P1', {
        organismo: 'ILUSTRE MUNICIPALIDAD DE QUILLON',
        monto: 400_000,
      }),
      abierto('P2', { region: 'Región del Maule' }),
      abierto('P3', { region: 'Región del Biobío' }),
    ]);
    leidas.add('P3');
    lectura.leer.mockResolvedValue({
      semaforo: 'rojo',
      etiquetas: ['alimentacion'],
      se_hace_en_el_complejo: 'no',
      razon: 'Coffee en la biblioteca.',
    });

    const resumen = await radar.correr('reloj');

    expect(lectura.leer).toHaveBeenCalledTimes(1);
    expect(lectura.leer).toHaveBeenCalledWith(
      expect.objectContaining({ codigo: 'P1' }),
      {
        nombre: 'Valle del Sol',
        perfil: 'Complejo turístico en Quillón',
        paquetes: ['Evento: matrimonio'],
        fijos: ['Garzón'],
      },
      expect.any(Object),
    );
    // Quillón y del rubro: nunca rojo.
    expect(repo.guardarLectura).toHaveBeenCalledWith(
      1,
      'P1',
      expect.objectContaining({
        semaforo: 'amarillo',
        alertas: ['comuna_cercana'],
      }),
      LECTURA_ACTUAL,
      false,
    );
    expect(resumen?.lectura).toMatchObject({
      estado: 'ok',
      empresas: 1,
      leidas: 1,
      releidas: 0,
      amarillas: 1,
      rojas: 0,
    });
  });

  it('relee lo leído con reglas viejas que nadie tocó, junto a lo nuevo y por cierre (decisión 19)', async () => {
    const { radar, repo, lectura, leidas, releer } = armar();
    repo.procesosAbiertos.mockResolvedValue([
      abierto('NUEVA'),
      abierto('VIEJA'),
      abierto('AL_DIA'),
    ]);
    leidas.add('AL_DIA');
    releer.add('VIEJA');

    const resumen = await radar.correr('reloj');

    expect(lectura.leer).toHaveBeenCalledTimes(2);
    expect(repo.lecturasDe).toHaveBeenCalledWith(1, LECTURA_ACTUAL);
    expect(repo.guardarLectura).toHaveBeenCalledWith(
      1,
      'VIEJA',
      expect.any(Object),
      LECTURA_ACTUAL,
      true,
    );
    expect(repo.guardarLectura).toHaveBeenCalledWith(
      1,
      'NUEVA',
      expect.any(Object),
      LECTURA_ACTUAL,
      false,
    );
    expect(resumen?.lectura).toMatchObject({ leidas: 2, releidas: 1 });
  });

  it('si la lectura se detiene (sin cupo, llave mala), la corrida termina bien y lo avisa', async () => {
    const { radar, repo, lectura } = armar();
    repo.procesosAbiertos.mockResolvedValue([abierto('P1'), abierto('P2')]);
    lectura.leer.mockRejectedValue(
      new LecturaDetenida('sin cupo en Anthropic'),
    );

    const resumen = await radar.correr('reloj');

    expect(resumen?.lectura.estado).toBe('detenida');
    expect(resumen?.avisos).toContain('sin cupo en Anthropic');
    expect(repo.guardarLectura).not.toHaveBeenCalled();
    expect(repo.terminarCorrida).toHaveBeenCalledWith(7, 'ok', resumen);
  });

  it('un proceso que no se pudo leer queda pendiente para la próxima', async () => {
    const { radar, repo, lectura } = armar();
    repo.procesosAbiertos.mockResolvedValue([abierto('P1')]);
    lectura.leer.mockResolvedValue(null);

    const resumen = await radar.correr('reloj');

    expect(repo.guardarLectura).not.toHaveBeenCalled();
    expect(resumen?.lectura.sin_leer).toBe(1);
  });

  it('diez lecturas fallidas seguidas detienen la lectura de la corrida', async () => {
    const { radar, repo, lectura } = armar();
    repo.procesosAbiertos.mockResolvedValue(
      Array.from({ length: 30 }, (_, i) => abierto(`P${i}`)),
    );
    lectura.leer.mockResolvedValue(null);

    const resumen = await radar.correr('reloj');

    expect(resumen?.lectura.estado).toBe('detenida');
    expect(lectura.leer.mock.calls.length).toBeLessThan(30);
    expect(repo.terminarCorrida).toHaveBeenCalledWith(7, 'ok', resumen);
  });

  it('lee primero lo que cierra antes; lo que no informa cierre, al final', async () => {
    const { radar, repo, lectura } = armar();
    repo.procesosAbiertos.mockResolvedValue([
      abierto('SIN-CIERRE', { fecha_cierre: null }),
      abierto('NOVIEMBRE', { fecha_cierre: '2026-11-20T18:00:00+00:00' }),
      abierto('LUNES', { fecha_cierre: '2026-10-19T19:00:00+00:00' }),
    ]);

    await radar.correr('reloj');

    const orden = lectura.leer.mock.calls.map(
      ([p]) => (p as ProcesoParaLeer).codigo,
    );
    expect(orden).toEqual(['LUNES', 'NOVIEMBRE', 'SIN-CIERRE']);
  });

  it('una empresa sin regiones configuradas no se lee', async () => {
    const { radar, repo, lectura } = armar();
    repo.configDe.mockResolvedValue({ ...CONFIG_VDS, regiones: [] });
    repo.procesosAbiertos.mockResolvedValue([abierto('P1')]);

    const resumen = await radar.correr('reloj');

    expect(lectura.leer).not.toHaveBeenCalled();
    expect(resumen?.lectura.empresas).toBe(0);
    expect(resumen?.compras_agiles.estado).toBe('sin_regiones');
  });
});

describe('RadarService — dos pasadas de lectura', () => {
  it('lo de la primera pasada no se relee, y lo que falló no se reintenta en la misma corrida', async () => {
    const { radar, repo, lectura, mp } = armar();
    repo.procesosAbiertos.mockResolvedValue([abierto('P1'), abierto('FALLA')]);
    lectura.leer.mockImplementation((p: ProcesoParaLeer) =>
      Promise.resolve(
        p.codigo === 'FALLA'
          ? null
          : {
              semaforo: 'verde',
              etiquetas: ['evento'],
              se_hace_en_el_complejo: 'si',
              razon: 'ok',
            },
      ),
    );
    mp.comprasAgiles.mockResolvedValue([]);

    const resumen = await radar.correr('reloj');

    expect(lectura.leer).toHaveBeenCalledTimes(2);
    expect(resumen?.lectura).toMatchObject({
      leidas: 1,
      sin_leer: 1,
      empresas: 1,
    });
  });
});

describe('RadarService — sin llaves', () => {
  it('sin MP_TICKET ni ANTHROPIC_API_KEY no consulta nada y lo dice', async () => {
    const { radar, repo, mp, lectura } = armar();
    mp.configurado = false;
    lectura.configurado = false;

    const resumen = await radar.correr('reloj');

    expect(mp.licitacionesActivas).not.toHaveBeenCalled();
    expect(mp.comprasAgiles).not.toHaveBeenCalled();
    expect(lectura.leer).not.toHaveBeenCalled();
    expect(resumen?.licitaciones.estado).toBe('sin_ticket');
    expect(resumen?.compras_agiles.estado).toBe('sin_ticket');
    expect(resumen?.lectura.estado).toBe('sin_llave');
    expect(repo.terminarCorrida).toHaveBeenCalledWith(7, 'ok', resumen);
  });
});

describe('enParalelo', () => {
  it('nunca corre más de n a la vez, y los hace todos', async () => {
    let enCurso = 0;
    let maximo = 0;
    const hechos: number[] = [];
    await enParalelo([1, 2, 3, 4, 5, 6, 7], 3, async (i) => {
      enCurso++;
      maximo = Math.max(maximo, enCurso);
      await new Promise((r) => setTimeout(r, 1));
      hechos.push(i);
      enCurso--;
    });
    expect(maximo).toBe(3);
    expect(hechos.sort()).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('si una falla, deja de repartir y relanza ese error', async () => {
    const vistos: number[] = [];
    await expect(
      enParalelo([1, 2, 3, 4, 5], 1, (i) => {
        vistos.push(i);
        return i === 2 ? Promise.reject(new Error('falla')) : Promise.resolve();
      }),
    ).rejects.toThrow('falla');
    expect(vistos).toEqual([1, 2]);
  });

  it('con la lista vacía no hace nada', async () => {
    const fn = jest.fn();
    await enParalelo([], 4, fn);
    expect(fn).not.toHaveBeenCalled();
  });
});
