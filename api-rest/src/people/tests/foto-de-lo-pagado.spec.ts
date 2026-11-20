import { CandadoDeNominaRepository } from '../candado-de-nomina.repository';
import { PeopleRepository } from '../people.repository';
import { PeopleService } from '../people.service';
import { conFoto } from '../utils/foto-de-lo-pagado';
import { baseEnMemoria, type Fila } from './base-en-memoria';

/**
 * LA FOTO DE LO PAGADO (doc 10 §15, migración 213).
 *
 * La nómina 11 sumaba el monto de HOY de cada fila: cuando la fila 2912
 * bajó de $25.000 a $20.000 el 19-11, la nómina pasó a decir $20.000
 * aunque el banco pagó $25.000. Con la foto, la nómina muestra y suma lo
 * que se pagó, cambie lo que cambie después.
 */
function armar() {
  const tablas: Record<string, Fila[]> = {
    payrolls: [
      {
        id: 11,
        company_id: 1,
        label: 'Nómina 10-11-2026',
        created_at: '2026-11-11T02:11:02Z',
      },
      {
        id: 50,
        company_id: 2,
        label: 'Ajena',
        created_at: '2026-11-11T02:11:02Z',
      },
    ],
    payroll_people: [
      {
        id: 139,
        company_id: 1,
        payroll_id: 11,
        person_id: 20,
        jornada_paid: true,
        propina_paid: true,
      },
      {
        id: 140,
        company_id: 1,
        payroll_id: 11,
        person_id: 1,
        jornada_paid: true,
        propina_paid: true,
      },
    ],
    event_staff: [
      // Pagadas en la nómina 11, con su foto.
      {
        id: 2911,
        company_id: 1,
        quotation_id: null,
        day: '2026-11-09',
        person_id: 1,
        amount: 30000,
        payroll_id: 11,
        tip_payroll_id: null,
        monto_pagado: 30000,
      },
      {
        id: 2912,
        company_id: 1,
        quotation_id: null,
        day: '2026-11-09',
        person_id: 20,
        amount: 25000,
        payroll_id: 11,
        tip_payroll_id: 11,
        tip_amount: 1500,
        monto_pagado: 25000,
        propina_pagada: 1500,
      },
      // Por pagar (sin sello): la nómina que se genere la sella con foto.
      {
        id: 3154,
        company_id: 1,
        quotation_id: null,
        day: '2026-11-10',
        person_id: 35,
        amount: 25000,
        payroll_id: null,
        tip_payroll_id: null,
        tip_amount: 800,
      },
      // Otra empresa, en su nómina.
      {
        id: 5001,
        company_id: 2,
        quotation_id: null,
        day: '2026-11-09',
        person_id: 70,
        amount: 10000,
        payroll_id: 50,
        tip_payroll_id: null,
        monto_pagado: 10000,
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
  const service = new PeopleService(repo, logger as never);
  const fila = (id: number) => tablas.event_staff.find((f) => f.id === id)!;
  return { tablas, repo, service, fila };
}

const totalDe11 = async (service: PeopleService) =>
  (await service.findPayrolls(1)).find((n) => n.id === 11)?.total;

describe('conFoto', () => {
  it('lo sellado se lee de la foto; lo demás, como está', () => {
    expect(
      conFoto({
        payroll_id: 11,
        amount: 20000,
        monto_pagado: 25000,
        tip_payroll_id: null,
        tip_amount: 900,
        propina_pagada: 700,
      }),
    ).toMatchObject({ amount: 25000, tip_amount: 900 });
    expect(
      conFoto({ payroll_id: null, amount: 20000, monto_pagado: 25000 }),
    ).toMatchObject({ amount: 20000 });
    // Sellada sin foto (no debería pasar después del relleno): el valor de hoy.
    expect(
      conFoto({ payroll_id: 11, amount: 20000, monto_pagado: null }),
    ).toMatchObject({ amount: 20000 });
  });
});

describe('la nómina no cambia su total cuando cambia el valor de hoy', () => {
  it('la nómina 11 suma $56.500 aunque la fila 2912 diga $20.000 hoy', async () => {
    const { service, fila } = armar();
    expect(await totalDe11(service)).toBe(56500);
    // Lo que pasó el 19-11, saltándose el candado (como un arreglo a mano).
    fila(2912).amount = 20000;
    fila(2912).tip_amount = 0;
    expect(await totalDe11(service)).toBe(56500);
  });

  it('el detalle de la nómina muestra lo que se pagó', async () => {
    const { service, fila } = armar();
    fila(2912).amount = 20000;
    const n = await service.getPayroll(11, 1);
    expect(n.jornadas.find((j) => j.id === 2912)?.amount).toBe(25000);
    expect(n.propinas.find((j) => j.id === 2912)?.tip_amount).toBe(1500);
  });

  it('el historial de la persona también', async () => {
    const { repo, fila } = armar();
    fila(2912).amount = 20000;
    const h = await repo.findHistorialDePersona(1, 20);
    expect(h.find((f) => f.id === 2912)?.amount).toBe(25000);
  });
});

describe('al sellar se toma la foto', () => {
  it('sellarConFoto guarda el monto y la propina con que se armó la nómina', async () => {
    const { repo, fila } = armar();
    await repo.sellarConFoto(
      [{ id: 3154, amount: '25000' }],
      [{ id: 3154, tip_amount: 800 }],
      11,
      1,
    );
    expect(fila(3154)).toMatchObject({
      payroll_id: 11,
      tip_payroll_id: 11,
      monto_pagado: 25000,
      propina_pagada: 800,
    });
  });

  it('no sella filas de otra empresa', async () => {
    const { repo, fila } = armar();
    await repo.sellarConFoto([{ id: 5001, amount: 1 }], [], 11, 1);
    expect(fila(5001)).toMatchObject({ payroll_id: 50, monto_pagado: 10000 });
  });
});
