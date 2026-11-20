import { BadRequestException } from '@nestjs/common';
import { CandadoDeNominaRepository } from '../candado-de-nomina.repository';
import { PeopleRepository } from '../people.repository';
import type { PropinaRepartidaRepository } from '../propina-repartida.repository';
import { PropinaRepartidaService } from '../propina-repartida.service';
import {
  claveDe,
  grupoDe,
  mensajeDelCandado,
} from '../utils/candado-de-nomina';

/**
 * EL CANDADO A LO PAGADO (doc 10 §15, 20-11-2026). Felipe: «Una vez que
 * el día se paga y se liquida, ya no se puede editar, ni sumar, ni nada».
 *
 * Corre el código de verdad de PeopleRepository y del candado contra una
 * base en memoria (dos empresas, una nómina). Todas las escrituras de
 * jornadas pasan por ahí: agregar, cambiar y borrar, de a una o en lote.
 */

type Fila = Record<string, unknown> & { id: number; company_id: number };

/** Lo justo de supabase-js para estas pruebas: from → filtros → await. */
function baseEnMemoria(tablas: Record<string, Fila[]>) {
  let siguienteId = 9000;
  const consulta = (tabla: string) => {
    const filtros: ((f: Fila) => boolean)[] = [];
    let op: 'select' | 'insert' | 'update' | 'delete' = 'select';
    let valores: Record<string, unknown> | Record<string, unknown>[] = {};
    let una: 'single' | 'maybe' | null = null;
    const filas = () => tablas[tabla] ?? (tablas[tabla] = []);
    const correr = () => {
      if (op === 'insert') {
        const nuevas = (valores as Record<string, unknown>[]).map(
          (v) => ({ id: siguienteId++, ...v }) as Fila,
        );
        filas().push(...nuevas);
        return una ? nuevas[0] : nuevas;
      }
      const elegidas = filas().filter((f) => filtros.every((p) => p(f)));
      if (op === 'update') {
        for (const f of elegidas) Object.assign(f, valores);
      }
      if (op === 'delete') {
        tablas[tabla] = filas().filter((f) => !elegidas.includes(f));
      }
      if (una) return elegidas[0] ?? null;
      return elegidas;
    };
    const q = {
      select: () => q,
      insert: (v: Record<string, unknown>[]) => (
        (op = 'insert'),
        (valores = v),
        q
      ),
      update: (v: Record<string, unknown>) => (
        (op = 'update'),
        (valores = v),
        q
      ),
      delete: () => ((op = 'delete'), q),
      eq: (c: string, v: unknown) => (filtros.push((f) => f[c] === v), q),
      in: (c: string, vs: unknown[]) => (
        filtros.push((f) => vs.includes(f[c])),
        q
      ),
      is: (c: string, v: unknown) => (
        filtros.push((f) => (f[c] ?? null) === v),
        q
      ),
      or: (expr: string) => {
        const cols = expr.split(',').map((p) => p.split('.')[0]);
        filtros.push((f) => cols.some((c) => f[c] != null));
        return q;
      },
      single: () => ((una = 'single'), q),
      maybeSingle: () => ((una = 'maybe'), q),
      then: (ok: (r: { data: unknown; error: null }) => unknown) =>
        Promise.resolve({ data: correr(), error: null }).then(ok),
    };
    return q;
  };
  return { client: { from: consulta } };
}

const DIA_PAGADO = '2026-11-09';
const DIA_ABIERTO = '2026-11-10';
const EVENTO_PAGADO = '11111111-1111-1111-1111-111111111111';

/** El día 09-11 tal como estaba: dos filas pagadas en la nómina 11
 *  («Nómina 10-11-2026»), y la planta del día sin plata. */
function armar() {
  const tablas: Record<string, Fila[]> = {
    payrolls: [
      { id: 11, company_id: 1, label: 'Nómina 10-11-2026' },
      { id: 50, company_id: 2, label: 'Nómina ajena' },
    ],
    event_staff: [
      // Día 09-11 (pagado): dos filas en la nómina 11 y una de planta sin plata.
      {
        id: 2911,
        company_id: 1,
        quotation_id: null,
        day: DIA_PAGADO,
        person_id: 1,
        amount: 30000,
        payroll_id: 11,
        tip_payroll_id: null,
      },
      {
        id: 2912,
        company_id: 1,
        quotation_id: null,
        day: DIA_PAGADO,
        person_id: 20,
        amount: 25000,
        payroll_id: 11,
        tip_payroll_id: null,
      },
      {
        id: 1151,
        company_id: 1,
        quotation_id: null,
        day: DIA_PAGADO,
        person_id: 8,
        amount: null,
        payroll_id: null,
        tip_payroll_id: null,
      },
      // Día 10-11 (abierto).
      {
        id: 3001,
        company_id: 1,
        quotation_id: null,
        day: DIA_ABIERTO,
        person_id: 8,
        amount: null,
        payroll_id: null,
        tip_payroll_id: null,
      },
      // Un evento pagado (solo la propina de una fila) y otra fila suya sin sello.
      {
        id: 4001,
        company_id: 1,
        quotation_id: EVENTO_PAGADO,
        day: '2026-11-14',
        person_id: 36,
        amount: 25000,
        payroll_id: null,
        tip_payroll_id: 11,
      },
      {
        id: 4002,
        company_id: 1,
        quotation_id: EVENTO_PAGADO,
        day: '2026-11-15',
        person_id: 9,
        amount: null,
        payroll_id: null,
        tip_payroll_id: null,
      },
      // Otra empresa: su 09-11 SÍ está pagado, y eso no debe frenar a la 1.
      {
        id: 5001,
        company_id: 2,
        quotation_id: null,
        day: DIA_ABIERTO,
        person_id: 70,
        amount: 10000,
        payroll_id: 50,
        tip_payroll_id: null,
      },
    ],
    tip_pools: [
      {
        id: 101,
        company_id: 1,
        quotation_id: null,
        day: DIA_PAGADO,
        first_amount: 0,
        second_amount: 0,
      },
      {
        id: 102,
        company_id: 1,
        quotation_id: null,
        day: DIA_ABIERTO,
        first_amount: 0,
        second_amount: 0,
      },
    ],
  };
  const supabase = baseEnMemoria(tablas);
  const logger = { setContext: jest.fn(), info: jest.fn(), warn: jest.fn() };
  const candado = new CandadoDeNominaRepository(
    supabase as never,
    logger as never,
  );
  const repo = new PeopleRepository(
    supabase as never,
    logger as never,
    candado,
  );
  const fila = (id: number) => tablas.event_staff.find((f) => f.id === id);
  return { tablas, candado, repo, fila, logger };
}

const MENSAJE =
  'Este día ya se pagó en la Nómina 10-11-2026: no se puede agregar, cambiar ni borrar nada. Si falta pagar algo, anótalo como ajuste en un día abierto.';

describe('utils: el grupo y el mensaje', () => {
  it('el grupo es el evento, o el día si no hay evento', () => {
    expect(grupoDe({ quotation_id: 'q', day: '2026-11-09' })).toEqual({
      quotation_id: 'q',
    });
    expect(
      grupoDe({ quotation_id: null, day: '2026-11-09T00:00:00Z' }),
    ).toEqual({ day: '2026-11-09' });
    expect(claveDe({ day: '2026-11-09' })).toBe('dia:2026-11-09');
  });

  it('el mensaje dice qué se pagó, dónde y qué hacer', () => {
    expect(
      mensajeDelCandado(
        { day: DIA_PAGADO },
        { payroll_id: 11, label: 'Nómina 10-11-2026' },
      ),
    ).toBe(MENSAJE);
    expect(
      mensajeDelCandado({ quotation_id: 'q' }, { payroll_id: 7, label: null }),
    ).toContain('Este evento ya se pagó en la nómina N° 7');
  });
});

describe('cada puerta rechaza en un día pagado y deja pasar en uno abierto', () => {
  it('agregar a alguien', async () => {
    const { repo, tablas } = armar();
    await expect(
      repo.addStaff({
        company_id: 1,
        quotation_id: null,
        day: DIA_PAGADO,
        person_id: 35,
        amount: null,
      }),
    ).rejects.toThrow(MENSAJE);
    await expect(
      repo.addStaff({
        company_id: 1,
        quotation_id: null,
        day: DIA_ABIERTO,
        person_id: 35,
        amount: null,
      }),
    ).resolves.toBeTruthy();
    expect(tablas.event_staff.filter((f) => f.person_id === 35)).toHaveLength(
      1,
    );
  });

  it('cambiar monto, horas, cargo, tipo, estado o ajuste de cualquier fila del día', async () => {
    const { repo, fila } = armar();
    for (const cambio of [
      { amount: 20000 },
      { starts_at: '10:00' },
      { break_minutes: 30 },
      { role_id: 9 },
      { kind: 'planta' },
      { status: 'por_confirmar' },
      { ajuste: 'descansa' },
      { tip_amount: 1000 },
    ]) {
      await expect(repo.updateStaff(2912, cambio, 1)).rejects.toThrow(MENSAJE);
    }
    // También la planta sin plata del mismo día: el día entero está cerrado.
    await expect(
      repo.updateStaff(1151, { starts_at: '09:00' }, 1),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(fila(2912)?.amount).toBe(25000);
    await expect(
      repo.updateStaff(3001, { starts_at: '09:00' }, 1),
    ).resolves.toBeTruthy();
    expect(fila(3001)?.starts_at).toBe('09:00');
  });

  it('mover una fila abierta a un día pagado tampoco', async () => {
    const { repo, fila } = armar();
    await expect(
      repo.updateStaff(3001, { day: DIA_PAGADO }, 1),
    ).rejects.toThrow(MENSAJE);
    expect(fila(3001)?.day).toBe(DIA_ABIERTO);
  });

  it('borrar', async () => {
    const { repo, fila } = armar();
    await expect(repo.removeStaff(1151, 1)).rejects.toThrow(MENSAJE);
    expect(fila(1151)).toBeDefined();
    await expect(repo.removeStaff(3001, 1)).resolves.toBeTruthy();
    expect(fila(3001)).toBeUndefined();
  });

  it('un evento con una sola propina pagada queda entero cerrado', async () => {
    const { repo } = armar();
    await expect(repo.updateStaff(4002, { amount: 1 }, 1)).rejects.toThrow(
      'Este evento ya se pagó en la Nómina 10-11-2026',
    );
    await expect(
      repo.addStaff({
        company_id: 1,
        quotation_id: EVENTO_PAGADO,
        day: '2026-11-16',
        person_id: 2,
      }),
    ).rejects.toThrow('Este evento ya se pagó');
  });
});

describe('un recálculo (en lote) nunca toca lo pagado', () => {
  it('crear en lote deja fuera lo que cae en un día o evento pagado', async () => {
    const { repo, tablas } = armar();
    const n = await repo.addStaffEnLote([
      { company_id: 1, quotation_id: null, day: DIA_PAGADO, person_id: 40 },
      {
        company_id: 1,
        quotation_id: EVENTO_PAGADO,
        day: '2026-11-14',
        person_id: 41,
      },
      { company_id: 1, quotation_id: null, day: DIA_ABIERTO, person_id: 42 },
    ]);
    expect(n).toBe(1);
    const nuevas = tablas.event_staff.filter((f) =>
      [40, 41, 42].includes(f.person_id as number),
    );
    expect(nuevas.map((f) => f.person_id)).toEqual([42]);
  });

  it('borrar en lote deja lo de un día pagado', async () => {
    const { repo, fila } = armar();
    const n = await repo.removeStaffEnLote([1151, 3001], 1);
    expect(n).toBe(1);
    expect(fila(1151)).toBeDefined();
    expect(fila(3001)).toBeUndefined();
  });
});

describe('la propina de un día pagado tampoco se toca', () => {
  it('cambiar el pozo, «sin propina» y repartir se rechazan', async () => {
    const { repo, candado } = armar();
    const servicio = new PropinaRepartidaService(
      repo,
      {
        filasDelPozo: jest.fn().mockResolvedValue([]),
      } as unknown as PropinaRepartidaRepository,
      { setContext: jest.fn(), info: jest.fn() } as never,
      candado,
    );
    await expect(
      servicio.cambiarPozo(101, { first_amount: 5000 }, 1),
    ).rejects.toThrow(MENSAJE);
    await expect(servicio.marcarSinPropina(101, 1)).rejects.toThrow(MENSAJE);
    await expect(servicio.exigirPozoAbierto(101, 1)).rejects.toThrow(MENSAJE);
    await expect(servicio.exigirPozoAbierto(102, 1)).resolves.toMatchObject({
      id: 102,
    });
  });

  it('el invitado del evento no entra a un día pagado', async () => {
    const { candado } = armar();
    // La jornada de evento 4001 es del 14-11 (abierto como día de staff).
    await expect(
      candado.exigirDiaDeLaJornadaAbierto(1, 4001),
    ).resolves.toBeUndefined();
    // Una jornada de evento el 09-11 lleva al día pagado.
    const otra = armar();
    otra.tablas.event_staff.push({
      id: 4100,
      company_id: 1,
      quotation_id: 'otro',
      day: DIA_PAGADO,
      person_id: 3,
      payroll_id: null,
      tip_payroll_id: null,
    });
    await expect(
      otra.candado.exigirDiaDeLaJornadaAbierto(1, 4100),
    ).rejects.toThrow(MENSAJE);
  });
});

describe('otra empresa no toca lo ajeno', () => {
  it('el 10-11 pagado de la empresa 2 no cierra el 10-11 de la empresa 1', async () => {
    const { repo } = armar();
    await expect(
      repo.updateStaff(3001, { starts_at: '08:00' }, 1),
    ).resolves.toBeTruthy();
  });

  it('una fila ajena no se encuentra ni se borra', async () => {
    const { repo, fila } = armar();
    await expect(repo.removeStaff(5001, 1)).rejects.toThrow(
      'No existe esa asignación',
    );
    expect(fila(5001)).toBeDefined();
  });
});

describe('la secuencia real del día 9', () => {
  it('anotar a alguien el 11-11 en el 09-11 pagado el 10-11, y bajar un monto pagado de $25.000 a $20.000: los dos se rechazan', async () => {
    const { repo, fila, tablas } = armar();
    // 11-11 18:55: la sábana anota a una persona más (la 35) en Staff del 09-11.
    await expect(
      repo.addStaff({
        company_id: 1,
        quotation_id: null,
        person_id: 35,
        day: DIA_PAGADO,
        role_id: 32,
        amount: null,
      }),
    ).rejects.toThrow(MENSAJE);
    // 19-11 23:19: la fila 2912, ya pagada, a $20.000.
    await expect(repo.updateStaff(2912, { amount: 20000 }, 1)).rejects.toThrow(
      MENSAJE,
    );
    expect(fila(2912)?.amount).toBe(25000);
    expect(tablas.event_staff.some((f) => f.person_id === 35)).toBe(false);
  });
});
