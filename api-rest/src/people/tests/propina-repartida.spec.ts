// La base en memoria imita al repositorio: sus funciones son async sin await.
/* eslint-disable @typescript-eslint/require-await */
import { BadRequestException, ConflictException } from '@nestjs/common';
import type { PeopleRepository } from '../people.repository';
import { PeopleService } from '../people.service';
import type { PropinaRepartidaRepository } from '../propina-repartida.repository';
import { PropinaRepartidaService } from '../propina-repartida.service';
import {
  pesos,
  resumirRepartido,
  totalTrasCambio,
} from '../utils/propina-repartida';

/**
 * LA PROPINA NO SE DESHACE A MEDIAS (doc 10 §14, 19-11-2026).
 *
 * El 19-11 quedó un día «sin propina» con pozo $0 y $20.000 repartidos
 * adentro, rumbo a la nómina. Este archivo fija que ya no pueda pasar:
 * bajar el pozo a $0 y «sin propina» borran lo repartido, reabrir avisa,
 * y lo que está en una nómina no se toca.
 *
 * Una base en memoria (dos empresas) con lo justo: pozos, filas y fichas.
 */
interface Pozo {
  id: number;
  company_id: number;
  quotation_id: string | null;
  day: string | null;
  first_amount: number | string;
  second_amount: number | string;
  distributed_at: string | null;
}
interface Fila {
  id: number;
  company_id: number;
  quotation_id: string | null;
  day: string;
  person_id: number;
  tip_amount: number | string | null;
  tip_pool_id: number | null;
  payroll_id: number | null;
  tip_payroll_id: number | null;
}

const EVENTO_478 = '11111111-1111-1111-1111-111111111111';
const DIA = '2026-11-14';

function base() {
  const pozos: Pozo[] = [];
  const filas: Fila[] = [];
  const fichas = new Map<string, string>(); // quotation_id → status

  const people = {
    findPool: jest.fn(async (id: number, companyId: number) => {
      const p = pozos.find((x) => x.id === id && x.company_id === companyId);
      if (!p) throw new Error('No existe ese pozo');
      return { ...p };
    }),
    findPoolDe: jest.fn(
      async (
        companyId: number,
        de: { quotation_id?: string | null; day?: string | null },
      ) =>
        pozos.find(
          (p) =>
            p.company_id === companyId &&
            (de.quotation_id
              ? p.quotation_id === de.quotation_id
              : p.quotation_id === null && p.day === de.day),
        ) ?? null,
    ),
    updatePool: jest.fn(
      async (id: number, cambios: Partial<Pozo>, companyId: number) => {
        const p = pozos.find((x) => x.id === id && x.company_id === companyId);
        if (!p) throw new Error('No existe ese pozo');
        Object.assign(p, cambios);
        return { ...p };
      },
    ),
    clearTips: jest.fn(async (poolId: number, companyId: number) => {
      for (const f of filas) {
        if (f.company_id === companyId && f.tip_pool_id === poolId) {
          f.tip_amount = null;
          f.tip_pool_id = null;
        }
      }
    }),
    findSheetByQuotation: jest.fn(async (_c: number, q: string) =>
      fichas.has(q) ? { status: fichas.get(q) } : null,
    ),
    // Lo que usa PeopleService.reabrirLiquidacion.
    esCotizacionDeLaEmpresa: jest.fn().mockResolvedValue(true),
    hayPagosEn: jest.fn(
      async (companyId: number, o: { quotation_id?: string; day?: string }) =>
        filas.some(
          (f) =>
            f.company_id === companyId &&
            (o.quotation_id
              ? f.quotation_id === o.quotation_id
              : f.quotation_id === null && f.day === o.day) &&
            (f.payroll_id != null || f.tip_payroll_id != null),
        ),
    ),
    upsertSheet: jest.fn(
      async (_c: number, q: string, v: { status: string }) => {
        fichas.set(q, v.status);
      },
    ),
    desrepartirPozoDelDia: jest.fn(async (companyId: number, day: string) => {
      for (const p of pozos) {
        if (p.company_id === companyId && !p.quotation_id && p.day === day) {
          p.distributed_at = null;
        }
      }
    }),
  };
  const repo = {
    filasDelPozo: jest.fn(async (companyId: number, poolId: number) =>
      filas
        .filter((f) => f.company_id === companyId && f.tip_pool_id === poolId)
        .map((f) => ({
          person_id: f.person_id,
          tip_amount: f.tip_amount,
          tip_payroll_id: f.tip_payroll_id,
        })),
    ),
  };
  const logger = { setContext: jest.fn(), info: jest.fn(), warn: jest.fn() };
  const servicio = new PropinaRepartidaService(
    people as unknown as PeopleRepository,
    repo as unknown as PropinaRepartidaRepository,
    logger as never,
  );
  const personas = new PeopleService(
    people as unknown as PeopleRepository,
    logger as never,
  );
  /** Lo que hace el controlador en POST /payrolls/reabrir. */
  const reabrir = async (dto: {
    quotation_id?: string;
    day?: string;
    confirmado?: boolean;
  }) => {
    await servicio.exigirConfirmacionAlReabrir(1, dto);
    return personas.reabrirLiquidacion(dto, 1);
  };
  return { pozos, filas, fichas, servicio, reabrir, people };
}

/** El día 14-11 tal como quedó a las 22:18 del 19-11: $20.000 repartidos
 *  entre cinco (Soledad, Alejandra, Caroline, Matías y Paulo). */
function diaRepartido(b: ReturnType<typeof base>, empresa = 1) {
  b.pozos.push({
    id: 101,
    company_id: empresa,
    quotation_id: null,
    day: DIA,
    first_amount: '20000',
    second_amount: '0',
    distributed_at: '2026-11-20T01:18:28Z',
  });
  const montos = [3334, 3750, 3750, 4583, 4583];
  montos.forEach((m, i) =>
    b.filas.push({
      id: 1000 + i,
      company_id: empresa,
      quotation_id: null,
      day: DIA,
      person_id: 10 + i,
      tip_amount: String(m),
      tip_pool_id: 101,
      payroll_id: null,
      tip_payroll_id: null,
    }),
  );
}

const repartidoEn = (b: ReturnType<typeof base>, poolId: number) =>
  b.filas.filter((f) => f.tip_pool_id === poolId && f.tip_amount != null);

describe('utils: cuánto hay repartido', () => {
  it('suma texto como número y cuenta personas distintas', () => {
    expect(
      resumirRepartido([
        { person_id: 1, tip_amount: '3334', tip_payroll_id: null },
        { person_id: 1, tip_amount: '100', tip_payroll_id: null },
        { person_id: 2, tip_amount: null, tip_payroll_id: null },
      ]),
    ).toEqual({ monto: 3434, personas: 1, filas: 3, enNomina: false });
  });

  it('el total tras el cambio toma del pozo lo que el cambio no trae', () => {
    const pozo = { first_amount: '20000', second_amount: '5000' };
    expect(totalTrasCambio(pozo, { first_amount: 0 })).toBe(5000);
    expect(totalTrasCambio(pozo, { first_amount: 0, second_amount: 0 })).toBe(
      0,
    );
    expect(totalTrasCambio(pozo, {})).toBeNull();
  });

  it('pesos con punto de miles', () => {
    expect(pesos(20000)).toBe('$20.000');
    expect(pesos(1234567)).toBe('$1.234.567');
    expect(pesos(0)).toBe('$0');
  });
});

describe('bajar el pozo a $0', () => {
  it('borra lo repartido y el pozo vuelve a «sin repartir»', async () => {
    const b = base();
    diaRepartido(b);
    await b.servicio.cambiarPozo(101, { first_amount: 0 }, 1);
    expect(repartidoEn(b, 101)).toHaveLength(0);
    expect(b.pozos[0]).toMatchObject({
      first_amount: 0,
      distributed_at: null,
    });
  });

  it('un monto distinto de cero no borra nada (solo cambia el monto)', async () => {
    const b = base();
    diaRepartido(b);
    await b.servicio.cambiarPozo(101, { first_amount: 15000 }, 1);
    expect(repartidoEn(b, 101)).toHaveLength(5);
    expect(b.people.clearTips).not.toHaveBeenCalled();
  });

  it('un pozo en $0 sin reparto queda como está', async () => {
    const b = base();
    b.pozos.push({
      id: 7,
      company_id: 1,
      quotation_id: null,
      day: DIA,
      first_amount: 0,
      second_amount: 0,
      distributed_at: '2026-11-19T03:14:08Z',
    });
    await b.servicio.cambiarPozo(7, { first_amount: 0 }, 1);
    expect(b.pozos[0].distributed_at).toBe('2026-11-19T03:14:08Z');
    expect(b.people.clearTips).not.toHaveBeenCalled();
  });

  it('en un evento con la ficha cerrada se rechaza', async () => {
    const b = base();
    b.pozos.push({
      id: 96,
      company_id: 1,
      quotation_id: EVENTO_478,
      day: null,
      first_amount: 12000,
      second_amount: 0,
      distributed_at: '2026-11-20T01:23:20Z',
    });
    b.filas.push({
      id: 1,
      company_id: 1,
      quotation_id: EVENTO_478,
      day: DIA,
      person_id: 1,
      tip_amount: 12000,
      tip_pool_id: 96,
      payroll_id: null,
      tip_payroll_id: null,
    });
    b.fichas.set(EVENTO_478, 'cerrada');
    await expect(
      b.servicio.cambiarPozo(96, { first_amount: 0 }, 1),
    ).rejects.toThrow('La ficha ya está cerrada');
    expect(repartidoEn(b, 96)).toHaveLength(1);
  });
});

describe('«sin propina»', () => {
  it('con reparto (y pozo ya en $0) borra lo repartido y marca el día', async () => {
    const b = base();
    diaRepartido(b);
    b.pozos[0].first_amount = 0; // como si el monto se hubiera bajado por fuera
    await b.servicio.marcarSinPropina(101, 1);
    expect(repartidoEn(b, 101)).toHaveLength(0);
    expect(b.pozos[0].distributed_at).not.toBeNull();
  });

  it('con plata en el pozo se sigue rechazando (repártelo, no lo saltes)', async () => {
    const b = base();
    diaRepartido(b);
    await expect(b.servicio.marcarSinPropina(101, 1)).rejects.toThrow(
      'Ese día tiene pozo',
    );
    expect(repartidoEn(b, 101)).toHaveLength(5);
  });
});

describe('lo que ya está en una nómina no se toca', () => {
  it('bajar a $0 y «sin propina» se rechazan y nada se borra', async () => {
    const b = base();
    diaRepartido(b);
    b.filas[2].tip_payroll_id = 9;
    await expect(
      b.servicio.cambiarPozo(101, { first_amount: 0 }, 1),
    ).rejects.toBeInstanceOf(BadRequestException);
    b.pozos[0].first_amount = 0;
    await expect(b.servicio.marcarSinPropina(101, 1)).rejects.toThrow(
      'ya entró a una nómina',
    );
    expect(repartidoEn(b, 101)).toHaveLength(5);
    expect(b.people.clearTips).not.toHaveBeenCalled();
  });
});

describe('reabrir avisa', () => {
  it('sin confirmar: 409 con cuánto hay y entre cuántos; no reabre', async () => {
    const b = base();
    diaRepartido(b);
    const intento = b.reabrir({ day: DIA });
    await expect(intento).rejects.toBeInstanceOf(ConflictException);
    await intento.catch((e: ConflictException) => {
      expect(e.getResponse()).toMatchObject({ monto: 20000, personas: 5 });
      expect(
        String((e.getResponse() as { message: string }).message),
      ).toContain('$20.000 de propina repartida entre 5 personas');
    });
    expect(b.pozos[0].distributed_at).not.toBeNull();
  });

  it('confirmado: reabre y no borra nada (doc 10, 18-08)', async () => {
    const b = base();
    diaRepartido(b);
    await b.reabrir({ day: DIA, confirmado: true });
    expect(b.pozos[0].distributed_at).toBeNull();
    expect(repartidoEn(b, 101)).toHaveLength(5);
  });

  it('sin propina adentro no pide confirmar', async () => {
    const b = base();
    await expect(b.reabrir({ day: DIA })).resolves.toEqual({
      reabierto: 'dia',
      day: DIA,
    });
  });

  it('con algo en nómina manda la regla de fierro, no el aviso', async () => {
    const b = base();
    diaRepartido(b);
    b.filas[0].tip_payroll_id = 9;
    await expect(b.reabrir({ day: DIA })).rejects.toThrow(
      'Ya hay pagos de esta liquidación',
    );
  });

  it('el aviso dice cuánto hay', async () => {
    const b = base();
    diaRepartido(b);
    await expect(b.servicio.avisoDeReabrir(1, { day: DIA })).resolves.toEqual({
      monto: 20000,
      personas: 5,
      en_nomina: false,
    });
  });
});

describe('otra empresa no toca lo ajeno', () => {
  it('el pozo de la empresa 2 no se lee ni se borra desde la 1', async () => {
    const b = base();
    diaRepartido(b, 2);
    await expect(
      b.servicio.cambiarPozo(101, { first_amount: 0 }, 1),
    ).rejects.toThrow('No existe ese pozo');
    await expect(b.servicio.avisoDeReabrir(1, { day: DIA })).resolves.toEqual({
      monto: 0,
      personas: 0,
      en_nomina: false,
    });
    expect(repartidoEn(b, 101)).toHaveLength(5);
  });
});

describe('la secuencia exacta del 19-11 (22:18 a 22:25)', () => {
  it('termina sin reparto guardado en un día «sin propina»', async () => {
    const b = base();
    // 22:18: el día 14 repartido en $20.000 entre cinco.
    diaRepartido(b);
    // 22:24: «Reabrir para corregir» el día 14. Ahora avisa primero…
    await expect(b.reabrir({ day: DIA })).rejects.toBeInstanceOf(
      ConflictException,
    );
    // …y la persona confirma.
    await b.reabrir({ day: DIA, confirmado: true });
    // 22:25: en el modal del día, el pozo a $0 (PATCH) y «Sin propina
    // este día», en ese orden, como lo hace la pantalla.
    await b.servicio.cambiarPozo(101, { first_amount: 0 }, 1);
    await b.servicio.marcarSinPropina(101, 1);

    const pozo = b.pozos[0];
    expect(Number(pozo.first_amount) + Number(pozo.second_amount)).toBe(0);
    expect(pozo.distributed_at).not.toBeNull();
    // Ningún peso repartido queda apuntando a un pozo «sin propina».
    expect(repartidoEn(b, 101)).toHaveLength(0);
    expect(b.filas.every((f) => f.tip_amount == null)).toBe(true);
  });
});
