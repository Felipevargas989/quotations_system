import {
  CuotaDelPlan,
  PiezaDePago,
  escalarEnProporcion,
  estaVencida,
  hoyEnChile,
  planDeLlenado,
  repartirAlza,
  repartirRebaja,
} from '../cuotas-que-se-llenan';

// Los casos borde aprobados por Felipe el 07-10-2026
// (docs/arquitectura/14_CUOTAS_QUE_SE_LLENAN.md). El número de cada
// prueba es el del caso en ese documento.
const HOY = '2026-10-07';
const FUTURO = '2026-12-01';
const PASADO = '2026-09-01';

const cuota = (
  id: string,
  n: number,
  amount: number | string,
  due_date = FUTURO,
  pagadaPorFuera = false,
): CuotaDelPlan => ({
  id,
  payment_number: n,
  amount,
  due_date,
  pagadaPorFuera,
});

let siguienteId = 1;
const pieza = (
  payment_id: string,
  amount: number,
  pago_grupo: string,
  transaction_date = '2026-10-01',
): PiezaDePago => ({
  id: siguienteId++,
  payment_id,
  amount,
  pago_grupo,
  transaction_date,
  created_at: `${transaction_date}T12:00:00Z`,
});

const montos = (r: ReturnType<typeof repartirRebaja>) =>
  Object.fromEntries(r.cambios.map((c) => [c.id, c.amount]));

/** Aplica un cambio de montos a la lista de cuotas (como el servicio). */
const aplicar = (
  cuotas: CuotaDelPlan[],
  r: ReturnType<typeof repartirRebaja>,
): CuotaDelPlan[] =>
  cuotas
    .filter((c) => !r.borrar.includes(c.id))
    .map((c) => ({
      ...c,
      amount: r.cambios.find((x) => x.id === c.id)?.amount ?? c.amount,
    }));

const linde = () => [
  cuota('c1', 1, 1590750),
  cuota('c2', 2, 1590750),
  cuota('c3', 3, 1590750),
  cuota('c4', 4, 1590750),
];

describe('BAJA el total: el plan mantiene su forma', () => {
  it('1 · Linde: todas quedan en $950.250; la 1 pagada y la 2 con $49.750', () => {
    const r = repartirRebaja(linde(), 1000000, 2562000);
    expect(montos(r)).toEqual({
      c1: 950250,
      c2: 950250,
      c3: 950250,
      c4: 950250,
    });
    expect(r.reembolso).toBe(0);

    const abono = pieza('c1', 1000000, 'g1');
    const llenado = planDeLlenado(aplicar(linde(), r), [abono], HOY);
    expect(llenado.actualizar).toEqual([
      { id: abono.id, payment_id: 'c1', amount: 950250 },
    ]);
    // El mismo pago (mismo grupo) sigue en la cuota 2.
    expect(llenado.insertar).toEqual([
      { copiaDe: abono.id, payment_id: 'c2', amount: 49750 },
    ]);
    expect(llenado.estados.map((e) => e.status)).toEqual([
      'pagado',
      'pendiente',
      'pendiente',
      'pendiente',
    ]);
  });

  it('2 · forma completa: la cuota pagada también baja y lo que le sobra pasa a la siguiente', () => {
    const plan = [
      cuota('abono', 1, 1200000, PASADO),
      cuota('c2', 2, 1400000),
      cuota('c3', 3, 1400000),
    ];
    const r = repartirRebaja(plan, 1200000, 1000000);
    expect(montos(r)).toEqual({ abono: 900000, c2: 1050000, c3: 1050000 });

    const abono = pieza('abono', 1200000, 'g1');
    const llenado = planDeLlenado(aplicar(plan, r), [abono], HOY);
    expect(llenado.actualizar).toEqual([
      { id: abono.id, payment_id: 'abono', amount: 900000 },
    ]);
    expect(llenado.insertar).toEqual([
      { copiaDe: abono.id, payment_id: 'c2', amount: 300000 },
    ]);
  });

  it('3 · las vencidas también bajan (favorece al cliente)', () => {
    const r = repartirRebaja(
      [cuota('v', 1, 100000, PASADO), cuota('f', 2, 100000)],
      0,
      20000,
    );
    expect(montos(r)).toEqual({ v: 90000, f: 90000 });
  });

  it('4 · baja por debajo de lo pagado: todas pagadas, el resto es reembolso, ninguna en $0', () => {
    const plan = [
      cuota('c1', 1, 1000000),
      cuota('c2', 2, 1000000),
      cuota('c3', 3, 1000000),
      cuota('c4', 4, 1000000),
    ];
    const r = repartirRebaja(plan, 1000000, 3500000);
    expect(r.reembolso).toBe(500000);
    expect(r.borrar).toEqual([]);
    expect(montos(r)).toEqual({
      c1: 250000,
      c2: 250000,
      c3: 250000,
      c4: 250000,
    });
    const llenado = planDeLlenado(
      aplicar(plan, r),
      [pieza('c1', 1000000, 'g1')],
      HOY,
    );
    expect(llenado.estados.every((e) => e.status === 'pagado')).toBe(true);
  });

  it('montos como texto (Supabase) se tratan como número', () => {
    const r = repartirRebaja([cuota('t', 1, '20800')], 0, 800);
    expect(montos(r)).toEqual({ t: 20000 });
  });
});

describe('SUBE el total: opción B', () => {
  const plan = () => [
    cuota('c1', 1, 1000000, PASADO),
    cuota('c2', 2, 1000000, PASADO),
    cuota('c3', 3, 1000000),
    cuota('c4', 4, 1000000),
  ];

  it('5 · crecen solo las por pagar que no han vencido, parejas entre ellas', () => {
    // La 1 está pagada; la 2 vencida sin pagar; la 3 y la 4 vienen.
    const r = repartirAlza(plan(), 1000000, 600000, HOY);
    expect(montos(r)).toEqual({ c3: 1300000, c4: 1300000 });
    expect(r.cuotaNueva).toBe(0);
  });

  it('5 · una cuota a medio pagar que no ha vencido crece por su monto', () => {
    const r = repartirAlza(
      [cuota('p', 1, 1000000), cuota('f', 2, 1000000)],
      400000,
      200000,
      HOY,
    );
    expect(montos(r)).toEqual({ p: 1100000, f: 1100000 });
  });

  it('6 · si ya no queda ninguna cuota que venga, el alza va a una cuota nueva', () => {
    const r = repartirAlza([cuota('v', 1, 100000, PASADO)], 0, 30000, HOY);
    expect(r.cambios).toEqual([]);
    expect(r.cuotaNueva).toBe(30000);
  });

  it('8 · una cuota pagada nunca vuelve a deber, aunque su fecha sea futura', () => {
    const r = repartirAlza(
      [cuota('c1', 1, 1000000), cuota('c2', 2, 1000000)],
      1000000,
      500000,
      HOY,
    );
    expect(montos(r)).toEqual({ c2: 1500000 });
  });

  it('14 · la que vence hoy todavía no ha vencido: sí crece', () => {
    const r = repartirAlza([cuota('h', 1, 100000, HOY)], 0, 10000, HOY);
    expect(montos(r)).toEqual({ h: 110000 });
  });
});

describe('pagos: lo pagado llena desde la primera', () => {
  it('10 · un pago grande llena la cuota y el resto pasa a la siguiente', () => {
    const p = pieza('c1', 1500000, 'g1');
    const llenado = planDeLlenado(
      [cuota('c1', 1, 1000000), cuota('c2', 2, 1000000)],
      [p],
      HOY,
    );
    expect(llenado.actualizar).toEqual([
      { id: p.id, payment_id: 'c1', amount: 1000000 },
    ]);
    expect(llenado.insertar).toEqual([
      { copiaDe: p.id, payment_id: 'c2', amount: 500000 },
    ]);
  });

  it('11 · un pago ya repartido que vuelve a caber en una cuota se junta (sobra una pieza)', () => {
    const a = pieza('c1', 950250, 'g1');
    const b = pieza('c2', 49750, 'g1');
    const llenado = planDeLlenado(
      [cuota('c1', 1, 1590750), cuota('c2', 2, 1590750)],
      [a, b],
      HOY,
    );
    expect(llenado.actualizar).toEqual([
      { id: a.id, payment_id: 'c1', amount: 1000000 },
    ]);
    expect(llenado.borrar).toEqual([b.id]);
    expect(llenado.insertar).toEqual([]);
  });

  it('12 · borrar un pago reabre la ÚLTIMA cuota cubierta, no la del pago borrado', () => {
    // Pagaste la 1 (septiembre) y la 2 (octubre); se borra el primero.
    const segundo = pieza('c2', 100, 'g2', '2026-10-01');
    const llenado = planDeLlenado(
      [
        cuota('c1', 1, 100, PASADO),
        cuota('c2', 2, 100, PASADO),
        cuota('c3', 3, 100),
      ],
      [segundo],
      HOY,
    );
    expect(llenado.actualizar).toEqual([
      { id: segundo.id, payment_id: 'c1', amount: 100 },
    ]);
    expect(llenado.estados.map((e) => e.status)).toEqual([
      'pagado',
      'vencido',
      'pendiente',
    ]);
  });

  it('13 · un pago con fecha atrasada no cambia qué cuotas quedan pagadas', () => {
    const tarde = pieza('c1', 100, 'g1', '2026-10-05');
    const atrasado = pieza('c2', 100, 'g2', '2026-09-01');
    const llenado = planDeLlenado(
      [cuota('c1', 1, 100), cuota('c2', 2, 100), cuota('c3', 3, 100)],
      [tarde, atrasado],
      HOY,
    );
    expect(llenado.estados.map((e) => e.status)).toEqual([
      'pagado',
      'pagado',
      'pendiente',
    ]);
  });

  it('las cuotas pagadas por fuera (sistema viejo) no se tocan ni reciben pagos', () => {
    const p = pieza('c2', 50, 'g1');
    const llenado = planDeLlenado(
      [cuota('vieja', 1, 100, PASADO, true), cuota('c2', 2, 100)],
      [p],
      HOY,
    );
    expect(llenado.actualizar).toEqual([]);
    expect(llenado.estados).toEqual([
      { id: 'c2', status: 'pendiente', cubierto: 50 },
    ]);
    expect(
      repartirRebaja(
        [cuota('vieja', 1, 100, PASADO, true), cuota('c2', 2, 100)],
        0,
        50,
      ).cambios,
    ).toEqual([{ id: 'c2', amount: 50 }]);
  });

  it('si lo pagado supera las cuotas (datos viejos), el sobrante queda en la última: la plata no se pierde', () => {
    const p = pieza('c1', 250, 'g1');
    const llenado = planDeLlenado(
      [cuota('c1', 1, 100), cuota('c2', 2, 100)],
      [p],
      HOY,
    );
    expect(llenado.actualizar).toEqual([
      { id: p.id, payment_id: 'c1', amount: 100 },
    ]);
    expect(llenado.insertar).toEqual([
      { copiaDe: p.id, payment_id: 'c2', amount: 150 },
    ]);
  });

  it('sin cuotas donde repartir no se toca ningún pago', () => {
    const llenado = planDeLlenado([], [pieza('x', 100, 'g1')], HOY);
    expect(llenado.borrar).toEqual([]);
    expect(llenado.actualizar).toEqual([]);
  });

  it('un registro de $0 se deja donde está', () => {
    const cero = pieza('c2', 0, 'g0');
    const llenado = planDeLlenado(
      [cuota('c1', 1, 100), cuota('c2', 2, 100)],
      [cero],
      HOY,
    );
    expect(llenado.borrar).toEqual([]);
    expect(llenado.actualizar).toEqual([]);
  });
});

describe('fechas y redondeo', () => {
  it('14 · vence hoy = pendiente; desde mañana, vencida', () => {
    expect(estaVencida('2026-10-07', '2026-10-07')).toBe(false);
    expect(estaVencida('2026-10-06', '2026-10-07')).toBe(true);
  });

  it('14 · hoy en Chile, no en Greenwich: las 21:30 del 7 en Santiago siguen siendo el 7', () => {
    // 00:30 del 8 en UTC = 21:30 del 7 en Chile (horario de verano, -3).
    expect(hoyEnChile(new Date('2026-10-08T00:30:00Z'))).toBe('2026-10-07');
  });

  it('17 · lo que sobra del redondeo va a la primera cuota (igual que el editor del plan)', () => {
    expect(escalarEnProporcion([1, 1, 1], 100)).toEqual([34, 33, 33]);
  });
});
