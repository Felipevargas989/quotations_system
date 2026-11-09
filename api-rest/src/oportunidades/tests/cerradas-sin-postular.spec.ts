import type { PinoLogger } from 'nestjs-pino';
import type { SupabaseService } from 'src/supabase/supabase.service';
import { mockPinoLogger } from 'src/testing/mocks';
import { CompetenciaCronService } from '../competencia/competencia-cron.service';
import type { ResultadosDePostuladasService } from '../competencia/resultados.service';
import { CerradasSinPostularRepository } from '../decisiones/cerradas-sin-postular.repository';
import { CerradasSinPostularService } from '../decisiones/cerradas-sin-postular.service';
import type { DecisionesRepository } from '../decisiones/decisiones.repository';
import { OportunidadesCronService } from '../oportunidades-cron.service';
import type { OportunidadesRepository } from '../oportunidades.repository';
import type { RadarService } from '../radar.service';

// LAS «ME INTERESA» QUE CERRARON SIN POSTULAR SE DESCARTAN SOLAS (decisión
// 116, 04-11). Lo que fija: solo las de la empresa, en estudio y ya
// cerradas, y el cambio vuelve a pedir que sigan en estudio; cada una queda
// con el porqué «No alcanzo»; si el porqué falla, el descarte igual cuenta;
// una empresa que falla no frena a las demás; y corre al encender el motor
// y antes del resultado de lo postulado, media hora después de cada pasada
// del radar.

type Consulta = { tabla: string; pasos: unknown[][] };

/** Una base falsa que anota cada consulta; `responder` decide qué vuelve. */
function baseFalsa(responder: (c: Consulta) => unknown) {
  const consultas: Consulta[] = [];
  const from = jest.fn((tabla: string) => {
    const consulta: Consulta = { tabla, pasos: [] };
    consultas.push(consulta);
    const cadena: Record<string, unknown> = {};
    for (const m of ['select', 'update', 'eq', 'lt', 'in', 'limit']) {
      cadena[m] = (...args: unknown[]) => {
        consulta.pasos.push([m, ...args]);
        return cadena;
      };
    }
    cadena.then = (bien: (v: unknown) => unknown) =>
      Promise.resolve({ data: responder(consulta), error: null }).then(bien);
    return cadena;
  });
  const repo = new CerradasSinPostularRepository({
    client: { from },
  } as unknown as SupabaseService);
  return { repo, consultas };
}

function armar(porEmpresa: Record<number, number[] | Error> = {}) {
  const repo = {
    descartarLasQueCerraron: jest.fn((companyId: number) => {
      const r = porEmpresa[companyId] ?? [];
      return r instanceof Error ? Promise.reject(r) : Promise.resolve(r);
    }),
  };
  const oportunidades = {
    empresasConModulo: jest
      .fn()
      .mockResolvedValue(Object.keys(porEmpresa).map((id) => ({ id: +id }))),
  };
  const decisiones = {
    ponerMotivo: jest.fn().mockResolvedValue({ motivo: 'no_alcanzo' }),
  };
  const servicio = new CerradasSinPostularService(
    repo as unknown as CerradasSinPostularRepository,
    oportunidades as unknown as OportunidadesRepository,
    decisiones as unknown as DecisionesRepository,
    mockPinoLogger() as unknown as PinoLogger,
  );
  return { servicio, repo, decisiones };
}

describe('La consulta de las cerradas sin postular (decisión 116)', () => {
  it('busca las «Me interesa» de la empresa ya cerradas y las descarta solo si siguen en estudio', async () => {
    const ahora = new Date('2026-11-04T19:30:00.000Z');
    const { repo, consultas } = baseFalsa((c) =>
      c.pasos.some(([m]) => m === 'update')
        ? [{ id: 8989 }]
        : [{ id: 8989 }, { id: 9408 }],
    );
    await expect(repo.descartarLasQueCerraron(1, ahora)).resolves.toEqual([
      8989,
    ]);
    // En medio, si alguna tiene algo firmado (decisión 122): aquí ninguna.
    const [busca, , cambia] = consultas;
    expect(busca.tabla).toBe('oportunidades');
    expect(busca.pasos).toEqual(
      expect.arrayContaining([
        ['select', 'id, proceso:mp_procesos!inner(fecha_cierre)'],
        ['eq', 'company_id', 1],
        ['eq', 'estado', 'en_estudio'],
        ['lt', 'proceso.fecha_cierre', '2026-11-04T19:30:00.000Z'],
      ]),
    );
    expect(cambia.pasos).toEqual(
      expect.arrayContaining([
        [
          'update',
          { estado: 'descartada', actualizado_en: '2026-11-04T19:30:00.000Z' },
        ],
        ['eq', 'company_id', 1],
        ['eq', 'estado', 'en_estudio'],
        ['in', 'id', [8989, 9408]],
      ]),
    );
  });

  it('una cerrada con algo firmado en «Mi postulación» no se descarta: espera «¿La subiste?» (decisión 122)', async () => {
    const ahora = new Date('2026-11-07T15:37:00.000Z');
    const { repo, consultas } = baseFalsa((c) =>
      c.tabla === 'oportunidad_adjuntos'
        ? [{ oportunidad_id: 11082 }]
        : c.pasos.some(([m]) => m === 'update')
          ? [{ id: 8989 }]
          : [{ id: 8989 }, { id: 11082 }],
    );
    await expect(repo.descartarLasQueCerraron(1, ahora)).resolves.toEqual([
      8989,
    ]);
    const [, firmados, cambia] = consultas;
    expect(firmados.tabla).toBe('oportunidad_adjuntos');
    expect(firmados.pasos).toEqual(
      expect.arrayContaining([
        ['select', 'oportunidad_id'],
        ['eq', 'company_id', 1],
        ['eq', 'seccion', 'postulacion'],
        ['eq', 'origen', 'firmado'],
        ['in', 'oportunidad_id', [8989, 11082]],
      ]),
    );
    expect(cambia.pasos).toEqual(
      expect.arrayContaining([['in', 'id', [8989]]]),
    );
  });

  it('si todas las cerradas tienen algo firmado, no descarta ninguna (decisión 122)', async () => {
    const { repo, consultas } = baseFalsa((c) =>
      c.tabla === 'oportunidad_adjuntos'
        ? [{ oportunidad_id: 11082 }]
        : [{ id: 11082 }],
    );
    await expect(repo.descartarLasQueCerraron(1)).resolves.toEqual([]);
    expect(consultas.map((c) => c.tabla)).toEqual([
      'oportunidades',
      'oportunidad_adjuntos',
    ]);
  });

  it('sin ninguna cerrada, no cambia nada', async () => {
    const { repo, consultas } = baseFalsa(() => []);
    await expect(repo.descartarLasQueCerraron(1)).resolves.toEqual([]);
    expect(consultas).toHaveLength(1);
  });
});

describe('Las cerradas sin postular (decisión 116)', () => {
  it('cada una queda descartada con el porqué «No alcanzo»', async () => {
    const { servicio, decisiones } = armar({ 1: [8989, 9408] });
    await expect(servicio.descartar(1)).resolves.toBe(2);
    expect(decisiones.ponerMotivo.mock.calls).toEqual([
      [1, 8989, 'no_alcanzo'],
      [1, 9408, 'no_alcanzo'],
    ]);
  });

  it('sin ninguna cerrada, no anota nada', async () => {
    const { servicio, decisiones } = armar({ 1: [] });
    await expect(servicio.descartar(1)).resolves.toBe(0);
    expect(decisiones.ponerMotivo).not.toHaveBeenCalled();
  });

  it('si el porqué no se puede anotar, el descarte igual cuenta', async () => {
    const { servicio, decisiones } = armar({ 1: [8989] });
    decisiones.ponerMotivo.mockRejectedValue(new Error('sin red'));
    await expect(servicio.descartar(1)).resolves.toBe(1);
  });

  it('en todas las empresas: una que falla no frena a las demás', async () => {
    const { servicio, repo } = armar({
      1: new Error('caída'),
      7: [40],
    });
    await expect(servicio.enTodas()).resolves.toBe(1);
    expect(repo.descartarLasQueCerraron.mock.calls).toEqual([[1], [7]]);
  });
});

describe('Cuándo corre (decisión 116)', () => {
  it('antes del resultado de lo postulado, en cada empresa con el módulo', async () => {
    const orden: string[] = [];
    const oportunidades = {
      empresasConModulo: jest.fn().mockResolvedValue([{ id: 1 }, { id: 7 }]),
    };
    const resultados = {
      revisar: jest.fn((id: number) => {
        orden.push(`resultados ${id}`);
        return Promise.resolve(0);
      }),
    };
    const cerradas = {
      descartar: jest.fn((id: number) => {
        orden.push(`cerradas ${id}`);
        return Promise.resolve(0);
      }),
    };
    const reloj = new CompetenciaCronService(
      oportunidades as unknown as OportunidadesRepository,
      {} as never,
      {} as never,
      {} as never,
      mockPinoLogger() as unknown as PinoLogger,
      resultados as unknown as ResultadosDePostuladasService,
      undefined,
      undefined,
      cerradas as unknown as CerradasSinPostularService,
    );
    await reloj.resultadosDeLasPostuladas();
    expect(orden).toEqual([
      'cerradas 1',
      'resultados 1',
      'cerradas 7',
      'resultados 7',
    ]);
  });

  it('al encender el motor, en cualquier ambiente, sin frenar el encendido', async () => {
    const radar = {
      limpiarAlEncender: jest.fn().mockResolvedValue(undefined),
      iniciar: jest.fn(),
      correr: jest.fn(),
    };
    const cerradas = {
      enTodas: jest.fn().mockRejectedValue(new Error('la base no responde')),
    };
    const cron = new OportunidadesCronService(
      radar as unknown as RadarService,
      mockPinoLogger() as unknown as PinoLogger,
      cerradas as unknown as CerradasSinPostularService,
    );
    expect(() => cron.onApplicationBootstrap()).not.toThrow();
    await Promise.resolve();
    expect(cerradas.enTodas).toHaveBeenCalledTimes(1);
  });
});
