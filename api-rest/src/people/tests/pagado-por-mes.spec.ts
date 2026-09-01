import {
  pagadoDePersonalPorMes,
  PagoDeNomina,
  SillaDeNomina,
} from '../utils/pagado-por-mes';

describe('pagadoDePersonalPorMes — la plata que sale hacia el equipo', () => {
  const silla = (s: Partial<SillaDeNomina>): SillaDeNomina => ({
    person_id: 1,
    payroll_id: null,
    tip_payroll_id: null,
    amount: null,
    tip_amount: null,
    ...s,
  });
  const pago = (p: Partial<PagoDeNomina>): PagoDeNomina => ({
    payroll_id: 10,
    person_id: 1,
    jornada_paid: false,
    propina_paid: false,
    paid_at: null,
    ...p,
  });

  it('manda la fecha del PAGO, no la del evento', () => {
    const r = pagadoDePersonalPorMes(
      [pago({ jornada_paid: true, paid_at: '2026-08-25T12:00:00Z' })],
      [silla({ payroll_id: 10, amount: 30000 })],
    );
    // agosto es el mes 7 en base 0
    expect(r['2026-7']).toEqual({
      jornadas: 30000,
      propinas: 0,
      personas: [{ nombre: 'Persona 1', monto: 30000 }],
    });
  });

  it('jornada y propina se pagan por separado', () => {
    const sillas = [
      silla({ payroll_id: 10, amount: 30000 }),
      silla({ tip_payroll_id: 10, tip_amount: 5000 }),
    ];
    const soloJornada = pagadoDePersonalPorMes(
      [pago({ jornada_paid: true, paid_at: '2026-08-25T12:00:00Z' })],
      sillas,
    );
    expect(soloJornada['2026-7']).toMatchObject({
      jornadas: 30000,
      propinas: 0,
    });

    const ambas = pagadoDePersonalPorMes(
      [
        pago({
          jornada_paid: true,
          propina_paid: true,
          paid_at: '2026-08-25T12:00:00Z',
        }),
      ],
      sillas,
    );
    expect(ambas['2026-7']).toMatchObject({ jornadas: 30000, propinas: 5000 });
    expect(ambas['2026-7'].personas).toEqual([
      { nombre: 'Persona 1', monto: 35000 },
    ]);
  });

  it('suma TODAS las sillas de la persona en esa nómina', () => {
    const r = pagadoDePersonalPorMes(
      [pago({ jornada_paid: true, paid_at: '2026-08-25T12:00:00Z' })],
      [
        silla({ payroll_id: 10, amount: 30000 }),
        silla({ payroll_id: 10, amount: 20000 }),
      ],
    );
    expect(r['2026-7'].jornadas).toBe(50000);
  });

  it('sin fecha de pago no hay salida de caja', () => {
    const r = pagadoDePersonalPorMes(
      [pago({ jornada_paid: true, paid_at: null })],
      [silla({ payroll_id: 10, amount: 30000 })],
    );
    expect(Object.keys(r)).toHaveLength(0);
  });

  it('no le paga a la persona equivocada de la misma nómina', () => {
    const r = pagadoDePersonalPorMes(
      [
        pago({
          person_id: 1,
          jornada_paid: true,
          paid_at: '2026-08-25T12:00:00Z',
        }),
      ],
      [
        silla({ person_id: 1, payroll_id: 10, amount: 30000 }),
        silla({ person_id: 2, payroll_id: 10, amount: 99000 }),
      ],
    );
    expect(r['2026-7'].jornadas).toBe(30000);
  });

  it('el desglose usa el nombre real y junta las nóminas del mes', () => {
    const r = pagadoDePersonalPorMes(
      [
        pago({ jornada_paid: true, paid_at: '2026-08-25T12:00:00Z' }),
        pago({
          payroll_id: 11,
          jornada_paid: true,
          paid_at: '2026-08-28T12:00:00Z',
        }),
      ],
      [
        silla({ payroll_id: 10, amount: 30000 }),
        silla({ payroll_id: 11, amount: 20000 }),
      ],
      new Map([[1, 'María Garzón']]),
    );
    // una sola línea con las dos nóminas del mes sumadas
    expect(r['2026-7'].personas).toEqual([
      { nombre: 'María Garzón', monto: 50000 },
    ]);
  });

  it('cada pago cae en SU mes', () => {
    const r = pagadoDePersonalPorMes(
      [
        pago({ jornada_paid: true, paid_at: '2026-07-10T12:00:00Z' }),
        pago({
          payroll_id: 11,
          jornada_paid: true,
          paid_at: '2026-08-25T12:00:00Z',
        }),
      ],
      [
        silla({ payroll_id: 10, amount: 30000 }),
        silla({ payroll_id: 11, amount: 40000 }),
      ],
    );
    expect(r['2026-6'].jornadas).toBe(30000);
    expect(r['2026-7'].jornadas).toBe(40000);
  });
});
