import { planEditado, tienePlata } from '../plan-editado';

/**
 * EDITAR EL PLAN DE PAGOS (Felipe, 28-10-2026; doc 14 §Editar el plan).
 * Caso 703: $2.821.000, aceptada con una sola cuota del 100% y sin ningún
 * pago. Felipe la dejó en 30% ($846.300) y saldo ($1.974.700).
 */
const HOY = '2026-10-28';

const cuota = (
  id: string,
  payment_number: number,
  amount: number | string,
  status = 'pendiente',
  extra: { pagadaPorFuera?: boolean; due_date?: string } = {},
) => ({
  id,
  payment_number,
  amount,
  status,
  due_date: extra.due_date ?? '2026-11-30',
  pagadaPorFuera: extra.pagadaPorFuera,
});

describe('planEditado', () => {
  it('la 703: una cuota del 100% sin pagos se reemplaza por 30% y saldo', () => {
    const plan = planEditado(
      [cuota('c1', 1, 2821000, 'vencido', { due_date: '2026-10-27' })],
      [],
      [
        { payment_type: 'Cuota 1', due_date: HOY, amount: 846300 },
        { payment_type: 'Cuota 2', due_date: '2026-12-02', amount: 1974700 },
      ],
      2821000,
      HOY,
    );
    expect(plan).toEqual({
      ok: true,
      fijas: [],
      borrar: ['c1'],
      crear: [
        {
          payment_number: 1,
          payment_type: 'Cuota 1',
          due_date: HOY,
          amount: 846300,
          notes: '',
          status: 'pendiente',
        },
        {
          payment_number: 2,
          payment_type: 'Cuota 2',
          due_date: '2026-12-02',
          amount: 1974700,
          notes: '',
          status: 'pendiente',
        },
      ],
    });
  });

  it('las cuotas con pagos quedan y las nuevas van después', () => {
    const plan = planEditado(
      [
        cuota('c1', 1, 846300, 'pagado'),
        cuota('c2', 2, 1974700),
        cuota('c3', 3, 0),
      ],
      [{ payment_id: 'c1' }],
      [
        { payment_type: 'Cuota 2', due_date: '2026-11-15', amount: 974700 },
        { payment_type: 'Cuota 3', due_date: '2026-12-02', amount: 1000000 },
      ],
      2821000,
      HOY,
    );
    if (!plan.ok) throw new Error(plan.motivo);
    expect(plan.fijas.map((c) => c.id)).toEqual(['c1']);
    expect(plan.borrar).toEqual(['c2', 'c3']);
    expect(plan.crear.map((c) => [c.payment_number, c.amount])).toEqual([
      [2, 974700],
      [3, 1000000],
    ]);
  });

  it('una cuota a medio pagar también queda fija, con su monto', () => {
    const plan = planEditado(
      [cuota('c1', 1, 846300), cuota('c2', 2, 1974700)],
      [{ payment_id: 'c1' }],
      [{ payment_type: 'Saldo', due_date: '2026-12-02', amount: 1974700 }],
      2821000,
      HOY,
    );
    if (!plan.ok) throw new Error(plan.motivo);
    expect(plan.fijas.map((c) => c.id)).toEqual(['c1']);
    expect(plan.borrar).toEqual(['c2']);
  });

  it('las «pagadas por fuera» y las marcadas pagadas no se borran nunca', () => {
    const porFuera = cuota('f', 1, 100, 'pagado', { pagadaPorFuera: true });
    expect(tienePlata(porFuera, [])).toBe(true);
    expect(tienePlata(cuota('p', 1, 100, 'pagado'), [])).toBe(true);
    expect(tienePlata(cuota('v', 1, 100, 'vencido'), [])).toBe(false);
    // Un pago de $0 también cuelga de la cuota: la base no la deja borrar.
    expect(tienePlata(cuota('z', 1, 100), [{ payment_id: 'z' }])).toBe(true);
  });

  it('el portero: entre todas deben sumar el total, al peso', () => {
    const sinPlata = planEditado(
      [],
      [],
      [{ payment_type: 'Cuota 1', due_date: HOY, amount: 2820999 }],
      2821000,
      HOY,
    );
    expect(sinPlata.ok).toBe(false);
    if (!sinPlata.ok) expect(sinPlata.motivo).toContain('recarga la página');

    const conPlata = planEditado(
      [cuota('c1', 1, 846300, 'pagado')],
      [{ payment_id: 'c1' }],
      [{ payment_type: 'Saldo', due_date: HOY, amount: 2821000 }],
      2821000,
      HOY,
    );
    expect(conPlata.ok).toBe(false);
    if (!conPlata.ok) {
      expect(conPlata.motivo).toContain('Las cuotas con pagos suman $846.300');
    }
  });

  it('montos como texto (Supabase entrega numeric como texto)', () => {
    const plan = planEditado(
      [cuota('c1', 1, '846300', 'pagado')],
      [{ payment_id: 'c1' }],
      [{ payment_type: 'Saldo', due_date: '2026-12-02', amount: '1974700' }],
      '2821000',
      HOY,
    );
    expect(plan.ok).toBe(true);
  });

  it('una cuota con fecha pasada nace vencida; la de hoy, pendiente', () => {
    const plan = planEditado(
      [],
      [],
      [
        { payment_type: 'Cuota 1', due_date: '2026-10-27', amount: 1 },
        { payment_type: 'Cuota 2', due_date: HOY, amount: 1 },
      ],
      2,
      HOY,
    );
    if (!plan.ok) throw new Error(plan.motivo);
    expect(plan.crear.map((c) => c.status)).toEqual(['vencido', 'pendiente']);
  });

  it('la fecha que llega con hora (el editor viejo) se lee como su día', () => {
    const plan = planEditado(
      [],
      [],
      [
        {
          payment_type: 'Cuota 1',
          due_date: '2026-12-02T00:00:00.000Z',
          amount: 5,
        },
      ],
      5,
      HOY,
    );
    if (!plan.ok) throw new Error(plan.motivo);
    expect(plan.crear[0].due_date).toBe('2026-12-02');
  });

  it('sin comentario, sin fecha o con monto cero no pasa', () => {
    const una = (p: object) =>
      planEditado([], [], [{ ...p }], 10, HOY) as {
        ok: boolean;
        motivo?: string;
      };
    expect(una({ due_date: HOY, amount: 10 }).motivo).toContain(
      'no tiene comentario',
    );
    expect(una({ payment_type: 'C', amount: 10 }).motivo).toContain(
      'fecha de vencimiento',
    );
    // Una cuota en $0 con la suma cuadrada: el portero ya pasó.
    const conCero = planEditado(
      [],
      [],
      [
        { payment_type: 'C', due_date: HOY, amount: 10 },
        { payment_type: 'D', due_date: HOY, amount: 0 },
      ],
      10,
      HOY,
    ) as { ok: boolean; motivo?: string };
    expect(conCero.motivo).toBe(
      'La cuota 2 debe tener un monto mayor que cero.',
    );
  });
});
