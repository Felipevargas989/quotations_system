import { sumarPorCobrar } from '../hoy.controller';

// Es PLATA: el error que originó esta cuenta —sumar la cuota entera sin
// mirar los abonos— mostró el doble de deuda durante meses sin que nadie
// lo notara, hasta que Felipe abrió la cotización #332 (07-08-2026).
describe('sumarPorCobrar', () => {
  const HOY = '2026-08-07';

  it('descuenta los abonos de cada cuota', () => {
    // El caso real: cuota de $1.623.600 con $800.000 ya pagados. Antes
    // se contaban los $1.623.600 completos.
    const r = sumarPorCobrar(
      [
        {
          id: 'c1',
          amount: 1623600,
          status: 'vencido',
          due_date: '2026-02-22',
        },
      ],
      new Map([['c1', 800000]]),
      HOY,
    );
    expect(r).toEqual({ pendiente: 0, vencido: 823600 });
  });

  it('la cuota totalmente abonada deja de contarse', () => {
    // Aunque su estado siga diciendo "pendiente": el cron marca por
    // fecha, no por saldo.
    const r = sumarPorCobrar(
      [
        {
          id: 'c1',
          amount: 500000,
          status: 'pendiente',
          due_date: '2026-12-01',
        },
      ],
      new Map([['c1', 500000]]),
      HOY,
    );
    expect(r).toEqual({ pendiente: 0, vencido: 0 });
  });

  it('un abono de más no descuenta de otra cuota', () => {
    const r = sumarPorCobrar(
      [
        {
          id: 'c1',
          amount: 100000,
          status: 'pendiente',
          due_date: '2026-12-01',
        },
        {
          id: 'c2',
          amount: 300000,
          status: 'pendiente',
          due_date: '2026-12-15',
        },
      ],
      new Map([['c1', 250000]]),
      HOY,
    );
    // c1 queda en 0 (no en -150.000) y c2 se cuenta entera.
    expect(r).toEqual({ pendiente: 300000, vencido: 0 });
  });

  it('separa vencido de pendiente por estado Y por fecha', () => {
    const r = sumarPorCobrar(
      [
        // vencida por su estado, aunque la fecha aún no llegue
        { id: 'a', amount: 1000, status: 'vencido', due_date: '2026-12-01' },
        // vencida por fecha, aunque el cron no la haya marcado
        { id: 'b', amount: 2000, status: 'pendiente', due_date: '2026-08-06' },
        // el día de hoy NO está vencido todavía
        { id: 'c', amount: 4000, status: 'pendiente', due_date: HOY },
        // sin fecha: nunca vencida
        { id: 'd', amount: 8000, status: 'pendiente', due_date: null },
      ],
      new Map(),
      HOY,
    );
    expect(r).toEqual({ pendiente: 12000, vencido: 3000 });
  });

  it('los montos que llegan como texto desde la base se suman igual', () => {
    const r = sumarPorCobrar(
      [
        {
          id: 'c1',
          amount: '150000' as unknown as number,
          status: 'pendiente',
          due_date: null,
        },
      ],
      new Map(),
      HOY,
    );
    expect(r).toEqual({ pendiente: 150000, vencido: 0 });
  });
});
