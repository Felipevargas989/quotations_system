import { PinoLogger } from 'nestjs-pino';
import { EmailService } from 'src/email/email.service';
import { QuotationsRepository } from 'src/quotations/quotations.repository';
import { QuotationsService } from 'src/quotations/quotations.service';
import { mockPinoLogger } from '../../testing/mocks';
import { PaymentsRepository } from '../payments.repository';
import { PaymentsService } from '../payments.service';
import { PLAN_CON_PAGOS_NO_SE_EDITA } from '../plan-editado';

/**
 * EDITAR EL PLAN DE PAGOS — DE PUNTA A PUNTA (Felipe, 28-10-2026; doc 14
 * §Editar el plan). El servicio real contra una base en memoria que, como la
 * de verdad, no deja borrar una cuota con pagos colgando.
 */

type Cuota = {
  id: string;
  quotation_id: string;
  payment_number: number;
  amount: number;
  due_date: string;
  status: string;
  paid_date: string | null;
  payment_type?: string;
};
type Pieza = {
  id: number;
  payment_id: string;
  quotation_id: string;
  amount: number;
  transaction_date: string;
  created_at: string;
  pago_grupo: string;
};

class Base {
  cuotas: Cuota[] = [];
  piezas: Pieza[] = [];
  private siguiente = 1;
  private ok = <T>(data: T) => Promise.resolve({ data, error: null });

  repo = {
    findAllPaymentsFromQuotation: jest.fn((ids: string[]) =>
      this.ok(
        this.cuotas
          .filter((c) => ids.includes(c.quotation_id))
          .sort((a, b) => a.payment_number - b.payment_number)
          .map((c) => ({
            ...c,
            payment_transactions: this.piezas.filter(
              (p) => p.payment_id === c.id,
            ),
          })),
      ),
    ),
    removePayment: jest.fn((id: string) => {
      if (this.piezas.some((p) => p.payment_id === id))
        return Promise.reject(new Error('FK: la cuota tiene pagos colgando'));
      this.cuotas = this.cuotas.filter((c) => c.id !== id);
      return this.ok(null);
    }),
    createPaymentPlan: jest.fn((nuevas: Omit<Cuota, 'id' | 'paid_date'>[]) => {
      for (const n of nuevas)
        this.cuotas.push({ ...n, id: `n${this.siguiente++}`, paid_date: null });
      return this.ok(null);
    }),
    updatePayment: jest.fn((id: string, cambio: Partial<Cuota>) => {
      Object.assign(this.cuotas.find((c) => c.id === id)!, cambio);
      return this.ok(null);
    }),
    moverPieza: jest.fn(
      (id: number, c: { payment_id: string; amount: number }) => {
        Object.assign(this.piezas.find((p) => p.id === id)!, c);
        return this.ok(null);
      },
    ),
    createPaymentTransaction: jest.fn(),
    removeTransactionsByIds: jest.fn(),
    findEventosSinPlan: jest.fn(),
  };

  aceptarRepo = { update: jest.fn().mockResolvedValue({}) };
  correo = { sendEmail: jest.fn<void, unknown[]>() };

  servicio(estado: string, total = 2821000) {
    return new PaymentsService(
      this.repo as unknown as PaymentsRepository,
      this.aceptarRepo as unknown as QuotationsRepository,
      {
        findOne: jest.fn().mockResolvedValue({
          data: {
            id: 'q703',
            company_id: 1,
            quotation_number: 703,
            total_amount: total,
            quotation_status: estado,
            client_contact_id: 7,
            companies: { name: 'Valle del Sol' },
          },
        }),
        mandanteOf: jest
          .fn()
          .mockResolvedValue({ email: 'cliente@ejemplo.cl', name: 'Cliente' }),
      } as unknown as QuotationsService,
      this.correo as unknown as EmailService,
      mockPinoLogger() as unknown as PinoLogger,
    );
  }

  plan() {
    return this.cuotas
      .slice()
      .sort((a, b) => a.payment_number - b.payment_number)
      .map((c) => [c.payment_number, c.amount, c.status, c.id]);
  }
}

describe('Editar el plan de pagos', () => {
  it('la 703: la cuota del 100% sin pagos pasa a 30% y saldo, sin correo', async () => {
    const base = new Base();
    base.cuotas = [
      {
        id: 'c1',
        quotation_id: 'q703',
        payment_number: 1,
        amount: 2821000,
        due_date: '2020-10-27',
        status: 'vencido',
        paid_date: null,
      },
    ];
    await base.servicio('aceptada').editarPlan(
      {
        quotation_id: 'q703',
        cuotas: [
          { payment_type: 'Cuota 1', due_date: '2099-10-28', amount: 846300 },
          { payment_type: 'Cuota 2', due_date: '2099-12-02', amount: 1974700 },
        ],
      },
      1,
    );
    expect(base.plan()).toEqual([
      [1, 846300, 'pendiente', 'n1'],
      [2, 1974700, 'pendiente', 'n2'],
    ]);
    expect(base.correo.sendEmail).not.toHaveBeenCalled();
    expect(base.aceptarRepo.update).not.toHaveBeenCalled();
  });

  it('con un pago registrado, el plan ya no se edita y no se toca nada', async () => {
    // Felipe, 28-10-2026: "no creo que se deba poder editar después de
    // cargar la primera cuota".
    const base = new Base();
    base.cuotas = [
      {
        id: 'c1',
        quotation_id: 'q703',
        payment_number: 1,
        amount: 846300,
        due_date: '2026-10-28',
        status: 'pagado',
        paid_date: null,
      },
      {
        id: 'c2',
        quotation_id: 'q703',
        payment_number: 2,
        amount: 1974700,
        due_date: '2099-12-02',
        status: 'pendiente',
        paid_date: null,
      },
    ];
    base.piezas = [
      {
        id: 50,
        payment_id: 'c1',
        quotation_id: 'q703',
        amount: 846300,
        transaction_date: '2026-10-28',
        created_at: '2026-10-28T12:00:00Z',
        pago_grupo: 'g1',
      },
    ];
    await expect(
      base.servicio('aceptada').editarPlan(
        {
          quotation_id: 'q703',
          cuotas: [
            { payment_type: 'Cuota 2', due_date: '2099-11-15', amount: 974700 },
            {
              payment_type: 'Cuota 3',
              due_date: '2099-12-02',
              amount: 1000000,
            },
          ],
        },
        1,
      ),
    ).rejects.toThrow(PLAN_CON_PAGOS_NO_SE_EDITA);
    expect(base.repo.removePayment).not.toHaveBeenCalled();
    expect(base.repo.createPaymentPlan).not.toHaveBeenCalled();
    expect(base.plan()).toEqual([
      [1, 846300, 'pagado', 'c1'],
      [2, 1974700, 'pendiente', 'c2'],
    ]);
  });

  it('un anulado no se edita: su plan quedó cerrado en lo pagado', async () => {
    const base = new Base();
    await expect(
      base.servicio('cancelada').editarPlan(
        {
          quotation_id: 'q703',
          cuotas: [
            {
              payment_type: 'Cuota 1',
              due_date: '2099-10-28',
              amount: 2821000,
            },
          ],
        },
        1,
      ),
    ).rejects.toThrow('anulado');
    expect(base.repo.createPaymentPlan).not.toHaveBeenCalled();
  });

  it('un realizado sí se edita: la cobranza sigue viva', async () => {
    const base = new Base();
    await base.servicio('realizada', 100).editarPlan(
      {
        quotation_id: 'q703',
        cuotas: [
          { payment_type: 'Saldo', due_date: '2099-01-01', amount: 100 },
        ],
      },
      1,
    );
    expect(base.plan()).toEqual([[1, 100, 'pendiente', 'n1']]);
  });

  it('la cotización de otra empresa es un 404 sin pistas', async () => {
    const base = new Base();
    await expect(
      base
        .servicio('aceptada')
        .editarPlan({ quotation_id: 'q703', cuotas: [] }, 9),
    ).rejects.toThrow('no encontrada');
  });
});

describe('Armar el plan al aceptar, con abonos encima', () => {
  it('volver a aceptar un anulado con una cuota pagada: no duplica el plan', async () => {
    // Antes del 28-10-2026: el borrado fallaba por los pagos colgando y el
    // plan nuevo se insertaba igual, encima del viejo.
    const base = new Base();
    base.cuotas = [
      {
        id: 'c1',
        quotation_id: 'q703',
        payment_number: 1,
        amount: 846300,
        due_date: '2026-10-28',
        status: 'pagado',
        paid_date: null,
      },
    ];
    base.piezas = [
      {
        id: 50,
        payment_id: 'c1',
        quotation_id: 'q703',
        amount: 846300,
        transaction_date: '2026-10-28',
        created_at: '2026-10-28T12:00:00Z',
        pago_grupo: 'g1',
      },
    ];
    await base.servicio('cancelada').createPaymentPlan(
      {
        quotation_id: 'q703',
        payments: [
          {
            payment_type: 'Saldo',
            due_date: '2099-12-02T00:00:00.000Z',
            amount: 1974700,
          },
        ] as never,
      },
      1,
    );
    expect(base.plan()).toEqual([
      [1, 846300, 'pagado', 'c1'],
      [2, 1974700, 'pendiente', 'n1'],
    ]);
    expect(base.aceptarRepo.update).toHaveBeenCalledWith(
      'q703',
      { quotation_status: 'aceptada' },
      1,
    );
    // El correo lleva el plan como quedó, con la fecha que sabe leer.
    const datos = base.correo.sendEmail.mock.calls[0][2] as {
      payments: unknown[];
    };
    expect(datos.payments).toEqual([
      { payment_number: 1, amount: 846300, due_date: '2026-10-28' },
      { payment_number: 2, amount: 1974700, due_date: '2099-12-02' },
    ]);
  });
});

describe('Los eventos sin plan de pagos', () => {
  it('solo trae las cotizaciones de post-venta que no tienen ninguna cuota', async () => {
    const base = new Base();
    base.repo.findEventosSinPlan.mockResolvedValue({
      data: [
        { id: 'a', quotation_number: 703, payments: [] },
        { id: 'b', quotation_number: 704, payments: [{ id: 'x' }] },
        { id: 'c', quotation_number: 386, payments: null },
      ],
      error: null,
    });
    const { data } = await base.servicio('aceptada').findEventosSinPlan(1);
    const numeros = (data as { quotation_number: number }[]).map(
      (q) => q.quotation_number,
    );
    expect(numeros).toEqual([703, 386]);
    expect(base.repo.findEventosSinPlan).toHaveBeenCalledWith(1);
  });
});
