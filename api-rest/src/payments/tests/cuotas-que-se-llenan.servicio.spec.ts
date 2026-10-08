import { BadRequestException } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { EmailService } from 'src/email/email.service';
import { QuotationsRepository } from 'src/quotations/quotations.repository';
import { QuotationsService } from 'src/quotations/quotations.service';
import { mockPinoLogger } from '../../testing/mocks';
import { PaymentsRepository } from '../payments.repository';
import { PaymentsService } from '../payments.service';

/**
 * CUOTAS QUE SE LLENAN — DE PUNTA A PUNTA (doc 14, Felipe 07-10-2026).
 *
 * El servicio real contra una base simulada en memoria: registrar un
 * pago, cambiar el total, corregir y borrar un pago, y mirar cómo queda
 * el plan. Los números son los de Linde (cotización 456 del laboratorio,
 * 07-10-2026): 4 cuotas de $1.590.750, un abono de $1.000.000 y el total
 * baja a $3.801.000.
 */

type Cuota = {
  id: string;
  quotation_id: string;
  payment_number: number;
  amount: number;
  due_date: string;
  status: string;
  paid_date: string | null;
};
type Pieza = {
  id: number;
  payment_id: string;
  quotation_id: string;
  amount: number;
  payment_method: string;
  transaction_date: string;
  notes?: string;
  receipt_photo_url?: string;
  created_at: string;
  pago_grupo: string;
};

class BaseSimulada {
  cuotas: Cuota[] = [];
  piezas: Pieza[] = [];
  private siguiente = 100;

  private conPiezas = (c: Cuota) => ({
    ...c,
    payment_transactions: this.piezas
      .filter((p) => p.payment_id === c.id)
      .map((p) => ({ ...p })),
  });

  /** Respuesta de Supabase ya resuelta. */
  private ok = <T>(data: T) => Promise.resolve({ data, error: null });

  repo = {
    findAllPaymentsFromQuotation: jest.fn((ids: string[]) =>
      this.ok(
        this.cuotas
          .filter((c) => ids.includes(c.quotation_id))
          .sort((a, b) => a.payment_number - b.payment_number)
          .map(this.conPiezas),
      ),
    ),
    findPaymentById: jest.fn((id: string) =>
      this.ok(this.cuotas.find((c) => c.id === id) ?? null),
    ),
    findPaymentTransactionById: jest.fn((id: number) =>
      this.ok(this.piezas.find((p) => p.id === Number(id)) ?? null),
    ),
    findTransactionsByGroup: jest.fn((g: string) =>
      this.ok(this.piezas.filter((p) => p.pago_grupo === g)),
    ),
    updatePayment: jest.fn((id: string, cambio: Partial<Cuota>) => {
      Object.assign(this.cuotas.find((c) => c.id === id)!, cambio);
      return this.ok(null);
    }),
    removePayment: jest.fn((id: string) => {
      if (this.piezas.some((p) => p.payment_id === id))
        return Promise.reject(new Error('FK: la cuota tiene pagos colgando'));
      this.cuotas = this.cuotas.filter((c) => c.id !== id);
      return this.ok(null);
    }),
    createPaymentTransaction: jest.fn((p: Partial<Pieza>) => {
      this.piezas.push({
        created_at: `2026-10-07T12:00:${String(this.siguiente).slice(-2)}Z`,
        pago_grupo: `grupo-${this.siguiente}`,
        ...p,
        id: this.siguiente++,
      } as Pieza);
      return this.ok(null);
    }),
    moverPieza: jest.fn(
      (id: number, c: { payment_id: string; amount: number }) => {
        Object.assign(this.piezas.find((p) => p.id === id)!, c);
        return this.ok(null);
      },
    ),
    updatePaymentTransaction: jest.fn((id: number, c: Partial<Pieza>) => {
      Object.assign(this.piezas.find((p) => p.id === Number(id))!, c);
      return this.ok(null);
    }),
    removeTransactionsByIds: jest.fn((ids: number[]) => {
      this.piezas = this.piezas.filter((p) => !ids.includes(p.id));
      return this.ok(null);
    }),
  };

  servicio() {
    return new PaymentsService(
      this.repo as unknown as PaymentsRepository,
      {} as QuotationsRepository,
      {
        findOne: jest.fn().mockResolvedValue({ data: null }),
      } as unknown as QuotationsService,
      { sendEmail: jest.fn() } as unknown as EmailService,
      mockPinoLogger() as unknown as PinoLogger,
    );
  }

  /** Cómo se ve el plan: monto, lo cubierto y el estado de cada cuota. */
  plan() {
    return [...this.cuotas]
      .sort((a, b) => a.payment_number - b.payment_number)
      .map((c) => ({
        n: c.payment_number,
        monto: c.amount,
        cubierto: this.piezas
          .filter((p) => p.payment_id === c.id)
          .reduce((s, p) => s + Number(p.amount), 0),
        estado: c.status,
      }));
  }
}

const Q = 'q456';
const FUTURO = '2099-12-01';

const linde = () => {
  const base = new BaseSimulada();
  base.cuotas = [1, 2, 3, 4].map((n) => ({
    id: `c${n}`,
    quotation_id: Q,
    payment_number: n,
    amount: 1590750,
    due_date: FUTURO,
    status: 'pendiente',
    paid_date: null,
  }));
  return base;
};

const pagar = (base: BaseSimulada, amount: number, fecha = '2026-10-07') =>
  base.servicio().createOverflowPaymentTransaction(
    {
      quotation_id: Q,
      amount,
      payment_method: 'Transferencia',
      transaction_date: fecha,
      notes: 'Primer abono',
      receipt_photo_url: 'comprobante.pdf',
    },
    1,
  );

describe('cuotas que se llenan, de punta a punta', () => {
  it('Linde: abono de $1.000.000 y el total baja a $3.801.000 → todas en $950.250, la 1 pagada y la 2 con $49.750', async () => {
    const base = linde();
    await pagar(base, 1000000);
    expect(base.plan()[0]).toEqual({
      n: 1,
      monto: 1590750,
      cubierto: 1000000,
      estado: 'pendiente',
    });

    const r = await base.servicio().cambiarTotalDelPlan(Q, -2562000, 1);
    expect(r).toEqual({ reembolso: 0, cuotaNueva: 0 });
    expect(base.plan()).toEqual([
      { n: 1, monto: 950250, cubierto: 950250, estado: 'pagado' },
      { n: 2, monto: 950250, cubierto: 49750, estado: 'pendiente' },
      { n: 3, monto: 950250, cubierto: 0, estado: 'pendiente' },
      { n: 4, monto: 950250, cubierto: 0, estado: 'pendiente' },
    ]);
    // Las dos piezas son el MISMO pago: mismo grupo, fecha y comprobante.
    const [a, b] = base.piezas;
    expect(a.pago_grupo).toBe(b.pago_grupo);
    expect(b.receipt_photo_url).toBe('comprobante.pdf');
    expect(b.transaction_date).toBe(a.transaction_date);
  });

  it('un pago nunca divide la cuota: queda entera y a medio pagar', async () => {
    const base = linde();
    await pagar(base, 500000);
    expect(base.cuotas).toHaveLength(4);
    expect(base.plan()[0].cubierto).toBe(500000);
  });

  it('un pago grande se reparte en orden y queda como UN solo pago (un grupo)', async () => {
    const base = linde();
    const r = await pagar(base, 2000000);
    expect(r.distribution.map((d) => d.amount)).toEqual([1590750, 409250]);
    expect(base.plan().map((c) => c.cubierto)).toEqual([1590750, 409250, 0, 0]);
    expect(new Set(base.piezas.map((p) => p.pago_grupo)).size).toBe(1);
  });

  it('no se puede pagar más que el saldo total', async () => {
    const base = linde();
    await expect(pagar(base, 7000000)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(base.piezas).toHaveLength(0);
  });

  it('borrar un pago repartido en dos cuotas lo borra ENTERO y vuelve a llenar desde la primera', async () => {
    const base = linde();
    await pagar(base, 1000000, '2026-10-01');
    await base.servicio().cambiarTotalDelPlan(Q, -2562000, 1);
    await pagar(base, 300000, '2026-10-05');
    expect(base.plan().map((c) => c.cubierto)).toEqual([950250, 349750, 0, 0]);

    // Se borra el PRIMER pago (el que está repartido en las cuotas 1 y 2).
    const pieza = base.piezas.find((p) => p.notes === 'Primer abono')!;
    await base.servicio().removePaymentTransaction(pieza.id, 1);
    expect(base.plan()).toEqual([
      { n: 1, monto: 950250, cubierto: 300000, estado: 'pendiente' },
      { n: 2, monto: 950250, cubierto: 0, estado: 'pendiente' },
      { n: 3, monto: 950250, cubierto: 0, estado: 'pendiente' },
      { n: 4, monto: 950250, cubierto: 0, estado: 'pendiente' },
    ]);
  });

  it('corregir un pago a más se reparte solo (ya no hay que borrarlo y registrarlo de nuevo)', async () => {
    const base = linde();
    await pagar(base, 1000000);
    const pieza = base.piezas[0];
    await base
      .servicio()
      .updatePaymentTransaction(
        pieza.id,
        { amount: 2000000, notes: 'Corregido' },
        1,
      );
    expect(base.plan().map((c) => c.cubierto)).toEqual([1590750, 409250, 0, 0]);
    expect(base.piezas.every((p) => p.notes === 'Corregido')).toBe(true);
  });

  it('corregir un pago por encima de lo que falta pagar se rechaza', async () => {
    const base = linde();
    await pagar(base, 1000000);
    await expect(
      base
        .servicio()
        .updatePaymentTransaction(base.piezas[0].id, { amount: 7000000 }, 1),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('suben las personas: crecen solo las cuotas por pagar que no han vencido (opción B)', async () => {
    const base = linde();
    base.cuotas[1].due_date = '2026-01-01'; // la 2 ya venció
    await pagar(base, 1590750); // la 1 queda pagada
    await base.servicio().cambiarTotalDelPlan(Q, 600000, 1);
    expect(base.plan().map((c) => c.monto)).toEqual([
      1590750, 1590750, 1890750, 1890750,
    ]);
  });

  it('el total baja por debajo de lo pagado: todas pagadas y el resto es reembolso', async () => {
    const base = linde();
    await pagar(base, 1000000);
    const r = await base.servicio().cambiarTotalDelPlan(Q, -6000000, 1);
    // Saldo antes: 6.363.000 − 1.000.000 = 5.363.000; sobran 637.000.
    expect(r.reembolso).toBe(637000);
    expect(base.plan().every((c) => c.estado === 'pagado')).toBe(true);
    expect(base.plan().reduce((s, c) => s + c.monto, 0)).toBe(1000000);
  });

  it('las cuotas pagadas por fuera (sistema viejo) no se tocan', async () => {
    const base = linde();
    Object.assign(base.cuotas[0], {
      status: 'pagado',
      paid_date: '2025-12-01',
    });
    await pagar(base, 100000);
    expect(base.plan()[0]).toEqual({
      n: 1,
      monto: 1590750,
      cubierto: 0,
      estado: 'pagado',
    });
    expect(base.plan()[1].cubierto).toBe(100000);
  });
});
