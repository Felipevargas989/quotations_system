import {
  CuotaParaRepartir,
  repartirAlza,
  repartirRebaja,
} from '../reparto-del-cambio-de-total';

// Los ejemplos que se le mostraron a Felipe el 07-10-2026 (doc 14):
// plan de $1.000.000 en 4 cuotas de $250.000; la 1 pagada (no entra),
// la 2 con $100.000 abonados, la 3 y la 4 sin abonos. Saldo: $650.000.
const HOY = '2026-10-07';
const cuota = (
  id: string,
  n: number,
  amount: number | string,
  abonado: number,
  due_date = '2026-12-01',
): CuotaParaRepartir => ({ id, payment_number: n, amount, abonado, due_date });

const plan = () => [
  cuota('c2', 2, 250000, 100000),
  cuota('c3', 3, 250000, 0),
  cuota('c4', 4, 250000, 0),
];

const montos = (r: ReturnType<typeof repartirRebaja>) =>
  Object.fromEntries(r.cambios.map((c) => [c.id, c.amount]));

describe('repartirRebaja (bajan las personas)', () => {
  it('reparte en proporción al saldo; la parcial participa solo con lo que le falta', () => {
    const r = repartirRebaja(plan(), 130000);
    expect(montos(r)).toEqual({ c2: 220000, c3: 200000, c4: 200000 });
    expect(r.borrar).toEqual([]);
    expect(r.reembolso).toBe(0);
  });

  it('si la rebaja iguala el saldo, la parcial queda pagada por lo abonado y las sin abonos se borran', () => {
    const r = repartirRebaja(plan(), 650000);
    expect(r.cambios).toEqual([{ id: 'c2', amount: 100000, pagada: true }]);
    expect(r.borrar.sort()).toEqual(['c3', 'c4']);
    expect(r.reembolso).toBe(0);
  });

  it('lo que supera el saldo es reembolso', () => {
    const r = repartirRebaja(plan(), 700000);
    expect(r.reembolso).toBe(50000);
    expect(r.borrar.sort()).toEqual(['c3', 'c4']);
  });

  it('las vencidas también bajan (favorece al cliente)', () => {
    const r = repartirRebaja(
      [cuota('v', 1, 100000, 0, '2026-09-01'), cuota('f', 2, 100000, 0)],
      20000,
    );
    expect(montos(r)).toEqual({ v: 90000, f: 90000 });
  });

  it('al peso: el redondeo nunca deja cuotas descuadradas ni bajo lo abonado', () => {
    const cuotas = [
      cuota('a', 1, 333334, 333333), // saldo 1
      cuota('b', 2, 333333, 0),
      cuota('c', 3, 333333, 0),
    ];
    const r = repartirRebaja(cuotas, 100001);
    const despues = cuotas.reduce(
      (s, c) =>
        s + (r.cambios.find((x) => x.id === c.id)?.amount ?? Number(c.amount)),
      0,
    );
    expect(despues).toBe(1000000 - 100001);
    r.cambios.forEach((c) => {
      const original = cuotas.find((x) => x.id === c.id)!;
      expect(c.amount).toBeGreaterThanOrEqual(original.abonado);
    });
  });

  it('montos como texto (Supabase) se suman como número', () => {
    const r = repartirRebaja([cuota('t', 1, '20800', 0)], 800);
    expect(montos(r)).toEqual({ t: 20000 });
  });

  it('limpia cuotas que ya venían en $0 sin abonos (como la 6 de la 506)', () => {
    const r = repartirRebaja([...plan(), cuota('cero', 5, 0, 0)], 1000);
    expect(r.borrar).toContain('cero');
  });
});

describe('repartirAlza (suben las personas)', () => {
  it('reparte en proporción al saldo entre las que no han vencido', () => {
    const r = repartirAlza(plan(), 130000, HOY);
    expect(montos(r)).toEqual({ c2: 280000, c3: 300000, c4: 300000 });
    expect(r.cuotaNueva).toBe(0);
  });

  it('una cuota vencida NO sube (opción B)', () => {
    const r = repartirAlza(
      [cuota('v', 1, 100000, 40000, '2026-09-01'), cuota('f', 2, 100000, 0)],
      50000,
      HOY,
    );
    expect(montos(r)).toEqual({ f: 150000 });
  });

  it('una cuota que vence hoy todavía no ha vencido', () => {
    const r = repartirAlza([cuota('h', 1, 100000, 0, HOY)], 10000, HOY);
    expect(montos(r)).toEqual({ h: 110000 });
  });

  it('si todas vencieron, el alza va a una cuota nueva', () => {
    const r = repartirAlza(
      [cuota('v', 1, 100000, 0, '2026-09-01')],
      30000,
      HOY,
    );
    expect(r.cambios).toEqual([]);
    expect(r.cuotaNueva).toBe(30000);
  });

  it('al peso: el resto del redondeo va a la última', () => {
    const r = repartirAlza(
      [
        cuota('a', 1, 100000, 0),
        cuota('b', 2, 100000, 0),
        cuota('c', 3, 100000, 0),
      ],
      100,
      HOY,
    );
    expect(montos(r)).toEqual({ a: 100033, b: 100033, c: 100034 });
  });
});
