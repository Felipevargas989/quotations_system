import { armarGraficosHistorico, mesesAtras } from '../people.service';

/** Los tres gráficos del Histórico de pagos (Felipe, 24-08). */
describe('armarGraficosHistorico', () => {
  const HOY = '2026-08-24';

  it('mesesAtras cruza el año sin perderse', () => {
    expect(mesesAtras('2026-08-24', 0)).toBe('2026-08');
    expect(mesesAtras('2026-08-24', 11)).toBe('2025-09');
    expect(mesesAtras('2026-01-05', 1)).toBe('2025-12');
  });

  it('el mensual separa jornadas de propinas y solo cuenta lo YA en nómina', () => {
    const filas = [
      {
        day: '2026-08-10',
        amount: 30000,
        tip_amount: 5000,
        payroll_id: 1,
        tip_payroll_id: 1,
        person_id: 1,
        people: { name: 'Ana' },
      },
      // jornada en nómina, propina todavía no: solo cuenta la jornada
      {
        day: '2026-08-11',
        amount: 20000,
        tip_amount: 4000,
        payroll_id: 1,
        tip_payroll_id: null,
        person_id: 2,
        people: { name: 'Luis' },
      },
      {
        day: '2026-07-01',
        amount: null,
        tip_amount: 8000,
        payroll_id: null,
        tip_payroll_id: 2,
        person_id: 1,
        people: { name: 'Ana' },
      },
    ];
    const g = armarGraficosHistorico(filas, [], HOY);
    const agosto = g.porMes.find((m) => m.mes === '2026-08');
    const julio = g.porMes.find((m) => m.mes === '2026-07');
    expect(agosto).toEqual({ mes: '2026-08', jornadas: 50000, propinas: 5000 });
    expect(julio).toEqual({ mes: '2026-07', jornadas: 0, propinas: 8000 });
    expect(g.porMes).toHaveLength(12);
  });

  it('el top suma jornadas y propinas por persona y corta en 5', () => {
    const filas = Array.from({ length: 7 }, (_, i) => ({
      day: '2026-08-01',
      amount: (i + 1) * 1000,
      tip_amount: null,
      payroll_id: 1,
      tip_payroll_id: null,
      person_id: i + 1,
      people: { name: `P${String(i + 1)}` },
    }));
    const g = armarGraficosHistorico(filas, [], HOY);
    expect(g.top).toHaveLength(5);
    expect(g.top[0]).toEqual({ nombre: 'P7', total: 7000 });
  });

  it('el promedio por día cuenta SOLO los días de restaurante con propina', () => {
    const pozos = [
      {
        day: '2026-08-14',
        quotation_id: null,
        first_amount: 60000,
        second_amount: 0,
        distributed_at: 'x',
      },
      {
        day: '2026-08-15',
        quotation_id: null,
        first_amount: 40000,
        second_amount: 0,
        distributed_at: 'x',
      },
      // sin propina: NO entra al promedio
      {
        day: '2026-08-16',
        quotation_id: null,
        first_amount: 0,
        second_amount: 0,
        distributed_at: 'x',
      },
      // de un EVENTO: no es día de restaurante
      {
        day: null,
        quotation_id: 'ev',
        first_amount: 99000,
        second_amount: 0,
        distributed_at: 'x',
      },
      // sin repartir todavía: tampoco
      {
        day: '2026-08-17',
        quotation_id: null,
        first_amount: 70000,
        second_amount: 0,
        distributed_at: null,
      },
    ];
    const g = armarGraficosHistorico([], pozos, HOY);
    const agosto = g.promedioDia.find((m) => m.mes === '2026-08');
    expect(agosto).toEqual({ mes: '2026-08', dias: 2, promedio: 50000 });
  });
});
