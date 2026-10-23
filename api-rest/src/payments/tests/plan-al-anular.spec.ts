import { planAlAnular } from '../plan-al-anular';

// AL ANULAR, LO PAGADO ES EL 100% (Felipe, 22-10-2026; doc 14 §Anular).
// Datos de prueba con la forma de la #465 y de la #520.
describe('planAlAnular', () => {
  it('pagada queda igual, a medio pagar queda en lo abonado y sin abonos se borra', () => {
    const plan = planAlAnular(
      [
        { id: 'c1', amount: '250000', status: 'pagado' },
        { id: 'c2', amount: 250000, status: 'vencido' },
        { id: 'c3', amount: '95000', status: 'pendiente' },
      ],
      [
        { payment_id: 'c1', amount: '250000' },
        { payment_id: 'c2', amount: '200000' },
      ],
    );
    expect(plan.cerrar).toEqual([{ id: 'c2', amount: 200000 }]);
    expect(plan.borrar).toEqual(['c3']);
  });

  it('un abono partido en varias piezas se suma', () => {
    const plan = planAlAnular(
      [{ id: 'c1', amount: 1394000, status: 'pendiente' }],
      [
        { payment_id: 'c1', amount: '250000' },
        { payment_id: 'c1', amount: '1144000' },
      ],
    );
    // Cubierta entera pero sin marcar: se marca pagada, con su monto.
    expect(plan.cerrar).toEqual([{ id: 'c1', amount: 1394000 }]);
    expect(plan.borrar).toEqual([]);
  });

  it('sin ningún abono, el plan entero se va', () => {
    const plan = planAlAnular(
      [
        { id: 'c1', amount: 440000, status: 'pendiente' },
        { id: 'c2', amount: 440000, status: 'pendiente' },
      ],
      [],
    );
    expect(plan.cerrar).toEqual([]);
    expect(plan.borrar).toEqual(['c1', 'c2']);
  });

  it('una cuota pagada por fuera (sin registros) no se toca', () => {
    const plan = planAlAnular(
      [{ id: 'c1', amount: 500000, status: 'pagado', pagadaPorFuera: true }],
      [],
    );
    expect(plan.cerrar).toEqual([]);
    expect(plan.borrar).toEqual([]);
  });
});
