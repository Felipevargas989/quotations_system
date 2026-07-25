import { Test, TestingModule } from '@nestjs/testing';
import { PinoLogger } from 'nestjs-pino';
import { SupabaseService } from 'src/supabase/supabase.service';
import { PaymentStatus } from '../constants';
import { PaymentsRepository } from '../payments.repository';

/**
 * Builds a chainable Supabase query-builder mock. Every builder method returns
 * the same object so calls like `.from().select().eq().in()` work, and each
 * method is a jest.fn so the exact table/columns/filters can be asserted. The
 * builder is also awaitable (thenable) so `await query` resolves to a result.
 */
const createQueryBuilder = (result: any = { data: [], error: null }) => {
  const builder: any = {};
  for (const method of [
    'select',
    'insert',
    'update',
    'delete',
    'eq',
    'in',
    'lte',
    'order',
    'single',
  ]) {
    builder[method] = jest.fn(() => builder);
  }
  builder.then = (resolve: any) => resolve(result);
  return builder;
};

describe('PaymentsRepository', () => {
  let repository: PaymentsRepository;
  let builder: ReturnType<typeof createQueryBuilder>;
  let fromMock: jest.Mock;

  const companyId = 1;

  beforeEach(async () => {
    builder = createQueryBuilder();
    fromMock = jest.fn(() => builder);

    const supabaseMock = { client: { from: fromMock } } as any;
    const loggerMock = {
      info: jest.fn(),
      error: jest.fn(),
      setContext: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsRepository,
        { provide: SupabaseService, useValue: supabaseMock },
        { provide: PinoLogger, useValue: loggerMock },
      ],
    }).compile();

    repository = module.get<PaymentsRepository>(PaymentsRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(repository).toBeDefined();
  });

  describe('findAllPaymentsFromQuotation()', () => {
    it('scopes by nested company_id, filters by quotation ids and orders by payment number', async () => {
      await repository.findAllPaymentsFromQuotation([10, 11], companyId);

      expect(fromMock).toHaveBeenCalledWith('payments');
      expect(builder.eq).toHaveBeenCalledWith(
        'quotations.company_id',
        companyId,
      );
      expect(builder.in).toHaveBeenCalledWith('quotation_id', [10, 11]);
      expect(builder.order).toHaveBeenCalledWith('payment_number', {
        ascending: true,
      });
    });

    it('applies the status filter when provided', async () => {
      await repository.findAllPaymentsFromQuotation([10], companyId, [
        PaymentStatus.PENDIENTE,
      ]);

      expect(builder.in).toHaveBeenCalledWith('status', [
        PaymentStatus.PENDIENTE,
      ]);
    });
  });

  describe('findAllPaymentsWithTransactions()', () => {
    it('scopes by company and orders by created_at descending', async () => {
      await repository.findAllPaymentsWithTransactions(companyId);

      expect(fromMock).toHaveBeenCalledWith('payments');
      expect(builder.eq).toHaveBeenCalledWith(
        'quotations.company_id',
        companyId,
      );
      expect(builder.order).toHaveBeenCalledWith('created_at', {
        ascending: false,
      });
    });

    it('filters by status and a single due date', async () => {
      const due = new Date('2026-03-01');
      await repository.findAllPaymentsWithTransactions(
        companyId,
        [PaymentStatus.VENCIDO],
        due,
      );

      expect(builder.in).toHaveBeenCalledWith('status', [
        PaymentStatus.VENCIDO,
      ]);
      expect(builder.eq).toHaveBeenCalledWith('due_date', due.toISOString());
    });

    it('filters by multiple due dates using in', async () => {
      const dueDates = [new Date('2026-03-01'), new Date('2026-03-05')];
      await repository.findAllPaymentsWithTransactions(
        companyId,
        undefined,
        dueDates,
      );

      expect(builder.in).toHaveBeenCalledWith(
        'due_date',
        dueDates.map((d) => d.toISOString()),
      );
    });

    it('returns the error and an empty array when the query fails', async () => {
      builder = createQueryBuilder({
        data: null,
        error: { message: 'boom' },
      });
      fromMock.mockReturnValue(builder);

      const result =
        await repository.findAllPaymentsWithTransactions(companyId);

      expect(result).toEqual({ data: [], error: { message: 'boom' } });
    });
  });

  describe('write helpers', () => {
    it('createPaymentPlan inserts payments into the payments table', async () => {
      const payments = [{ id: 'p1' }] as any;
      await repository.createPaymentPlan(payments);

      expect(fromMock).toHaveBeenCalledWith('payments');
      expect(builder.insert).toHaveBeenCalledWith(payments);
    });

    it('createPayment inserts a single payment', async () => {
      const payment = { quotation_id: 1 } as any;
      await repository.createPayment(payment);

      expect(fromMock).toHaveBeenCalledWith('payments');
      expect(builder.insert).toHaveBeenCalledWith(payment);
    });

    it('deletePaymentsByQuotationId deletes rows matching the quotation id', async () => {
      await repository.deletePaymentsByQuotationId(5, companyId);

      expect(fromMock).toHaveBeenCalledWith('payments');
      expect(builder.delete).toHaveBeenCalled();
      expect(builder.eq).toHaveBeenCalledWith('quotation_id', 5);
    });

    it('createPaymentTransaction inserts into payment_transactions', async () => {
      const tx = { payment_id: 'p1', amount: 10 } as any;
      await repository.createPaymentTransaction(tx);

      expect(fromMock).toHaveBeenCalledWith('payment_transactions');
      expect(builder.insert).toHaveBeenCalledWith(tx);
    });

    it('updatePayment updates the row matching the id', async () => {
      await repository.updatePayment('p1', { status: PaymentStatus.PAGADO });

      expect(fromMock).toHaveBeenCalledWith('payments');
      expect(builder.update).toHaveBeenCalledWith({
        status: PaymentStatus.PAGADO,
      });
      expect(builder.eq).toHaveBeenCalledWith('id', 'p1');
    });

    it('updatePaymentTransaction updates the transaction matching the id', async () => {
      const dto = { amount: 15 } as any;
      await repository.updatePaymentTransaction('t1', dto);

      expect(fromMock).toHaveBeenCalledWith('payment_transactions');
      expect(builder.update).toHaveBeenCalledWith(dto);
      expect(builder.eq).toHaveBeenCalledWith('id', 't1');
    });
  });

  describe('read helpers', () => {
    it('findPaymentById scopes by id and nested company_id and returns a single row', async () => {
      await repository.findPaymentById('p1', companyId);

      expect(fromMock).toHaveBeenCalledWith('payments');
      expect(builder.eq).toHaveBeenCalledWith('id', 'p1');
      expect(builder.eq).toHaveBeenCalledWith(
        'quotations.company_id',
        companyId,
      );
      expect(builder.single).toHaveBeenCalled();
    });

    it('findAllTransactionsByPaymentId filters by payment_id', async () => {
      await repository.findAllTransactionsByPaymentId('p1');

      expect(fromMock).toHaveBeenCalledWith('payment_transactions');
      expect(builder.eq).toHaveBeenCalledWith('payment_id', 'p1');
    });

    it('findPaymentTransactionById filters by id and returns a single row', async () => {
      await repository.findPaymentTransactionById('t1');

      expect(fromMock).toHaveBeenCalledWith('payment_transactions');
      expect(builder.eq).toHaveBeenCalledWith('id', 't1');
      expect(builder.single).toHaveBeenCalled();
    });
  });

  describe('remove helpers', () => {
    it('removePaymentTransaction deletes the transaction matching the id', async () => {
      await repository.removePaymentTransaction('t1');

      expect(fromMock).toHaveBeenCalledWith('payment_transactions');
      expect(builder.delete).toHaveBeenCalled();
      expect(builder.eq).toHaveBeenCalledWith('id', 't1');
    });

    it('removePayment deletes the payment matching the id', async () => {
      await repository.removePayment('p1');

      expect(fromMock).toHaveBeenCalledWith('payments');
      expect(builder.delete).toHaveBeenCalled();
      expect(builder.eq).toHaveBeenCalledWith('id', 'p1');
    });

    it('removePaymentTransactionsByPaymentId deletes all transactions of a payment', async () => {
      await repository.removePaymentTransactionsByPaymentId('p1');

      expect(fromMock).toHaveBeenCalledWith('payment_transactions');
      expect(builder.delete).toHaveBeenCalled();
      expect(builder.eq).toHaveBeenCalledWith('payment_id', 'p1');
    });
  });

  describe('updateOverduePayments()', () => {
    it('marks pending payments past their due date as vencido', async () => {
      await repository.updateOverduePayments();

      expect(fromMock).toHaveBeenCalledWith('payments');
      expect(builder.update).toHaveBeenCalledWith({
        status: PaymentStatus.VENCIDO,
      });
      expect(builder.eq).toHaveBeenCalledWith(
        'status',
        PaymentStatus.PENDIENTE,
      );
      expect(builder.lte).toHaveBeenCalledWith('due_date', expect.any(String));
      expect(builder.select).toHaveBeenCalled();
    });
  });
});
