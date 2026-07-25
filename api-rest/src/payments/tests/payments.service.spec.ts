import { Test, TestingModule } from '@nestjs/testing';
import { PinoLogger } from 'nestjs-pino';
import { EmailService } from 'src/email/email.service';
import { EmailStructure } from 'src/email/types';
import { QuotationStatus } from 'src/quotations/constants/constants';
import { QuotationsRepository } from 'src/quotations/quotations.repository';
import { QuotationsService } from 'src/quotations/quotations.service';
import { PaymentStatus } from '../constants';
import { PaymentsRepository } from '../payments.repository';
import { PaymentsService } from '../payments.service';

describe('PaymentsService', () => {
  let service: PaymentsService;
  let paymentsRepositoryMock: jest.Mocked<PaymentsRepository>;
  let quotationsRepositoryMock: jest.Mocked<QuotationsRepository>;
  let quotationsServiceMock: jest.Mocked<QuotationsService>;
  let emailServiceMock: jest.Mocked<EmailService>;
  let loggerMock: jest.Mocked<PinoLogger>;

  const companyId = 1;

  beforeEach(async () => {
    paymentsRepositoryMock = {
      deletePaymentsByQuotationId: jest.fn(),
      createPaymentPlan: jest.fn(),
      createPayment: jest.fn(),
      findAllPaymentsFromQuotation: jest.fn(),
      findAllPaymentsWithTransactions: jest.fn(),
      findPaymentById: jest.fn(),
      findAllTransactionsByPaymentId: jest.fn(),
      createPaymentTransaction: jest.fn(),
      updatePaymentTransaction: jest.fn(),
      findPaymentTransactionById: jest.fn(),
      updatePayment: jest.fn(),
      removePaymentTransaction: jest.fn(),
      removePayment: jest.fn(),
      removePaymentTransactionsByPaymentId: jest.fn(),
      updateOverduePayments: jest.fn(),
    } as any;

    quotationsRepositoryMock = {
      findOne: jest.fn(),
      update: jest.fn(),
    } as any;

    quotationsServiceMock = {
      findOne: jest.fn(),
    } as any;

    emailServiceMock = {
      sendEmail: jest.fn(),
    } as any;

    loggerMock = {
      info: jest.fn(),
      error: jest.fn(),
      setContext: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: PaymentsRepository, useValue: paymentsRepositoryMock },
        { provide: QuotationsRepository, useValue: quotationsRepositoryMock },
        { provide: QuotationsService, useValue: quotationsServiceMock },
        { provide: EmailService, useValue: emailServiceMock },
        { provide: PinoLogger, useValue: loggerMock },
      ],
    }).compile();

    service = module.get<PaymentsService>(PaymentsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createPaymentPlan()', () => {
    const dto = {
      quotation_id: 55,
      payments: [
        { payment_number: 1, amount: 100, due_date: new Date('2026-01-01') },
      ],
    } as any;

    it('deletes existing payments, creates new ones and accepts the quotation scoped to the company', async () => {
      quotationsServiceMock.findOne.mockResolvedValue({
        data: {
          quotation_status: QuotationStatus.PENDIENTE,
          quotation_number: 7,
          clients: { name: 'Ana', email: 'ana@test.com' },
          companies: { name: 'Acme' },
        },
      } as any);

      await service.createPaymentPlan(dto, companyId);

      expect(
        paymentsRepositoryMock.deletePaymentsByQuotationId,
      ).toHaveBeenCalledWith(dto.quotation_id, companyId);
      expect(paymentsRepositoryMock.createPaymentPlan).toHaveBeenCalledWith(
        dto.payments,
      );
      expect(quotationsServiceMock.findOne).toHaveBeenCalledWith(
        dto.quotation_id,
      );
      expect(emailServiceMock.sendEmail).toHaveBeenCalledWith(
        'ana@test.com',
        EmailStructure.PAYMENT_PLAN_CREATED,
        expect.objectContaining({ clientName: 'Ana', companyName: 'Acme' }),
        companyId,
      );
      expect(quotationsRepositoryMock.update).toHaveBeenCalledWith(
        dto.quotation_id,
        { quotation_status: QuotationStatus.ACEPTADA },
        companyId,
      );
    });

    it('does not send an email when the quotation is already accepted, but still updates the status', async () => {
      quotationsServiceMock.findOne.mockResolvedValue({
        data: {
          quotation_status: QuotationStatus.ACEPTADA,
          quotation_number: 7,
          clients: { name: 'Ana', email: 'ana@test.com' },
          companies: { name: 'Acme' },
        },
      } as any);

      await service.createPaymentPlan(dto, companyId);

      expect(emailServiceMock.sendEmail).not.toHaveBeenCalled();
      expect(quotationsRepositoryMock.update).toHaveBeenCalledWith(
        dto.quotation_id,
        { quotation_status: QuotationStatus.ACEPTADA },
        companyId,
      );
    });
  });

  describe('createPayment()', () => {
    const dto = { quotation_id: 55, amount: 200, notes: 'first' } as any;

    it('computes the next payment number from existing payments and a due date 7 days after the event', async () => {
      paymentsRepositoryMock.findAllPaymentsFromQuotation.mockResolvedValue({
        data: [{ payment_number: 2 } as any, { payment_number: 3 } as any],
        error: null,
      } as any);
      quotationsRepositoryMock.findOne.mockResolvedValue({
        data: { event_date: '2026-05-10' },
        error: null,
      } as any);
      paymentsRepositoryMock.createPayment.mockResolvedValue({
        data: { id: 'p1' },
      } as any);

      await service.createPayment(dto, companyId);

      const expectedDue = new Date(
        new Date('2026-05-10').getTime() + 7 * 24 * 60 * 60 * 1000,
      );
      expect(paymentsRepositoryMock.createPayment).toHaveBeenCalledWith({
        quotation_id: 55,
        amount: 200,
        notes: 'first',
        status: PaymentStatus.PENDIENTE,
        payment_number: 4,
        due_date: expectedDue,
      });
    });

    it('defaults to payment number 1 when there are no existing payments', async () => {
      paymentsRepositoryMock.findAllPaymentsFromQuotation.mockResolvedValue({
        data: [],
        error: null,
      } as any);
      quotationsRepositoryMock.findOne.mockResolvedValue({
        data: { event_date: null },
        error: null,
      } as any);
      paymentsRepositoryMock.createPayment.mockResolvedValue({
        data: {},
      } as any);

      await service.createPayment(dto, companyId);

      expect(paymentsRepositoryMock.createPayment).toHaveBeenCalledWith(
        expect.objectContaining({ payment_number: 1 }),
      );
    });

    it('throws when the payments lookup returns an error', async () => {
      paymentsRepositoryMock.findAllPaymentsFromQuotation.mockResolvedValue({
        data: null,
        error: { message: 'boom' } as any,
      } as any);

      await expect(service.createPayment(dto, companyId)).rejects.toEqual({
        message: 'boom',
      });
      expect(paymentsRepositoryMock.createPayment).not.toHaveBeenCalled();
    });

    it('throws when the quotation does not exist', async () => {
      paymentsRepositoryMock.findAllPaymentsFromQuotation.mockResolvedValue({
        data: [],
        error: null,
      } as any);
      quotationsRepositoryMock.findOne.mockResolvedValue({
        data: null,
        error: null,
      } as any);

      await expect(service.createPayment(dto, companyId)).rejects.toThrow(
        'Quotation not found',
      );
    });
  });

  describe('findAllPaymentsFromQuotation()', () => {
    it('delegates to the repository forwarding ids, company and status filter', () => {
      paymentsRepositoryMock.findAllPaymentsFromQuotation.mockResolvedValue({
        data: [],
        error: null,
      } as any);

      service.findAllPaymentsFromQuotation([1, 2], companyId, [
        PaymentStatus.PENDIENTE,
      ]);

      expect(
        paymentsRepositoryMock.findAllPaymentsFromQuotation,
      ).toHaveBeenCalledWith([1, 2], companyId, [PaymentStatus.PENDIENTE]);
    });
  });

  describe('findAllPaymentsWithTransactions()', () => {
    it('aggregates paid amount, transaction count and last payment date per payment', async () => {
      paymentsRepositoryMock.findAllPaymentsWithTransactions.mockResolvedValue({
        data: [
          {
            id: 'p1',
            amount: 100,
            payment_transactions: [
              { amount: 30, transaction_date: '2026-01-05' },
              { amount: 20, transaction_date: '2026-01-02' },
            ],
          },
        ],
        error: null,
      } as any);

      const result = await service.findAllPaymentsWithTransactions(companyId);

      expect(result[0]).toEqual(
        expect.objectContaining({
          id: 'p1',
          paid_amount: 50,
          payment_count: 2,
          last_payment_date: '2026-01-05',
        }),
      );
      expect(result[0]).not.toHaveProperty('payment_transactions');
    });

    it('throws when the repository returns an error', async () => {
      paymentsRepositoryMock.findAllPaymentsWithTransactions.mockResolvedValue({
        data: [],
        error: { message: 'db down' } as any,
      } as any);

      await expect(
        service.findAllPaymentsWithTransactions(companyId),
      ).rejects.toThrow('db down');
    });
  });

  describe('createPaymentTransaction()', () => {
    const payload = {
      payment_id: 'p1',
      quotation_id: 55,
      amount: 40,
      payment_method: 'cash',
      transaction_date: new Date('2026-02-01'),
    } as any;

    it('creates the transaction, marks the payment PAGADO when fully paid and emails the client', async () => {
      paymentsRepositoryMock.findPaymentById.mockResolvedValue({
        data: { id: 'p1', amount: 40, due_date: new Date('2030-01-01') },
        error: null,
      } as any);
      paymentsRepositoryMock.findAllTransactionsByPaymentId.mockResolvedValue({
        data: [],
        error: null,
      } as any);
      paymentsRepositoryMock.createPaymentTransaction.mockResolvedValue({
        data: { id: 't1' },
        error: null,
      } as any);
      paymentsRepositoryMock.updatePayment.mockResolvedValue({
        error: null,
      } as any);
      quotationsServiceMock.findOne.mockResolvedValue({
        data: {
          clients: { name: 'Ana', email: 'ana@test.com' },
          companies: { name: 'Acme' },
        },
      } as any);

      const result = await service.createPaymentTransaction(payload, companyId);

      expect(result).toEqual({ id: 't1' });
      expect(
        paymentsRepositoryMock.createPaymentTransaction,
      ).toHaveBeenCalledWith(payload);
      expect(paymentsRepositoryMock.updatePayment).toHaveBeenCalledWith('p1', {
        status: PaymentStatus.PAGADO,
      });
      expect(emailServiceMock.sendEmail).toHaveBeenCalledWith(
        'ana@test.com',
        EmailStructure.PAYMENT_RECEIVED,
        expect.objectContaining({ amount: 40, paymentMethod: 'cash' }),
        companyId,
      );
    });

    it('leaves the payment PENDIENTE when partially paid and not overdue', async () => {
      paymentsRepositoryMock.findPaymentById.mockResolvedValue({
        data: { id: 'p1', amount: 100, due_date: new Date('2030-01-01') },
        error: null,
      } as any);
      paymentsRepositoryMock.findAllTransactionsByPaymentId.mockResolvedValue({
        data: [],
        error: null,
      } as any);
      paymentsRepositoryMock.createPaymentTransaction.mockResolvedValue({
        data: { id: 't1' },
        error: null,
      } as any);
      paymentsRepositoryMock.updatePayment.mockResolvedValue({
        error: null,
      } as any);
      quotationsServiceMock.findOne.mockResolvedValue({ data: null } as any);

      await service.createPaymentTransaction(payload, companyId);

      expect(paymentsRepositoryMock.updatePayment).toHaveBeenCalledWith('p1', {
        status: PaymentStatus.PENDIENTE,
      });
    });

    it('throws when the new total exceeds the payment amount', async () => {
      paymentsRepositoryMock.findPaymentById.mockResolvedValue({
        data: { id: 'p1', amount: 50, due_date: new Date('2030-01-01') },
        error: null,
      } as any);
      paymentsRepositoryMock.findAllTransactionsByPaymentId.mockResolvedValue({
        data: [{ amount: 30 }],
        error: null,
      } as any);

      await expect(
        service.createPaymentTransaction(payload, companyId),
      ).rejects.toThrow();
      expect(
        paymentsRepositoryMock.createPaymentTransaction,
      ).not.toHaveBeenCalled();
    });

    it('throws when the payment is not found', async () => {
      paymentsRepositoryMock.findPaymentById.mockResolvedValue({
        data: null,
        error: null,
      } as any);

      await expect(
        service.createPaymentTransaction(payload, companyId),
      ).rejects.toThrow();
    });
  });

  describe('updatePaymentTransaction()', () => {
    it('resolves the payment from the existing transaction and updates it', async () => {
      const dto = { amount: 25 } as any;
      paymentsRepositoryMock.findPaymentTransactionById.mockResolvedValue({
        data: { id: 't1', payment_id: 'p1', amount: 10 },
        error: null,
      } as any);
      paymentsRepositoryMock.findPaymentById.mockResolvedValue({
        data: { id: 'p1', amount: 100, due_date: new Date('2030-01-01') },
        error: null,
      } as any);
      paymentsRepositoryMock.findAllTransactionsByPaymentId.mockResolvedValue({
        data: [{ amount: 10 }],
        error: null,
      } as any);
      paymentsRepositoryMock.updatePaymentTransaction.mockResolvedValue({
        data: { id: 't1', amount: 25 },
        error: null,
      } as any);
      paymentsRepositoryMock.updatePayment.mockResolvedValue({
        error: null,
      } as any);

      const result = await service.updatePaymentTransaction(
        't1',
        dto,
        companyId,
      );

      expect(result).toEqual({ id: 't1', amount: 25 });
      expect(
        paymentsRepositoryMock.updatePaymentTransaction,
      ).toHaveBeenCalledWith('t1', { amount: 25 });
      // no email is sent on updates
      expect(emailServiceMock.sendEmail).not.toHaveBeenCalled();
    });

    it('throws when the transaction to update does not exist', async () => {
      paymentsRepositoryMock.findPaymentTransactionById.mockResolvedValue({
        data: null,
        error: null,
      } as any);

      await expect(
        service.updatePaymentTransaction('t1', { amount: 5 } as any, companyId),
      ).rejects.toThrow();
    });
  });

  describe('update()', () => {
    it('delegates to the repository updatePayment', () => {
      const dto = { status: PaymentStatus.PAGADO } as any;
      service.update('p1', dto);
      expect(paymentsRepositoryMock.updatePayment).toHaveBeenCalledWith(
        'p1',
        dto,
      );
    });
  });

  describe('removePaymentTransaction()', () => {
    it('delegates to the repository', () => {
      service.removePaymentTransaction(9);
      expect(
        paymentsRepositoryMock.removePaymentTransaction,
      ).toHaveBeenCalledWith(9);
    });
  });

  describe('removePayment()', () => {
    it('removes the related transactions first then the payment', async () => {
      paymentsRepositoryMock.removePaymentTransactionsByPaymentId.mockResolvedValue(
        { error: null } as any,
      );
      paymentsRepositoryMock.removePayment.mockResolvedValue({} as any);

      await service.removePayment('p1');

      expect(
        paymentsRepositoryMock.removePaymentTransactionsByPaymentId,
      ).toHaveBeenCalledWith('p1');
      expect(paymentsRepositoryMock.removePayment).toHaveBeenCalledWith('p1');
    });

    it('throws and does not remove the payment when transaction removal fails', async () => {
      paymentsRepositoryMock.removePaymentTransactionsByPaymentId.mockResolvedValue(
        { error: { message: 'fail' } } as any,
      );

      await expect(service.removePayment('p1')).rejects.toEqual({
        message: 'fail',
      });
      expect(paymentsRepositoryMock.removePayment).not.toHaveBeenCalled();
    });
  });

  describe('updateOverduePayments()', () => {
    it('updates overdue payments and logs the affected ids', async () => {
      paymentsRepositoryMock.updateOverduePayments.mockResolvedValue({
        data: [{ id: 'p1' }, { id: 'p2' }],
        error: null,
        status: 200,
      } as any);

      await service.updateOverduePayments();

      expect(paymentsRepositoryMock.updateOverduePayments).toHaveBeenCalled();
    });

    it('throws when the repository returns an error', async () => {
      paymentsRepositoryMock.updateOverduePayments.mockResolvedValue({
        data: null,
        error: { message: 'boom' } as any,
        status: 500,
      } as any);

      await expect(service.updateOverduePayments()).rejects.toEqual({
        message: 'boom',
      });
    });
  });

  describe('createOverflowPaymentTransaction()', () => {
    const baseDto = {
      quotation_id: 'q1',
      amount: 150,
      payment_method: 'transferencia',
      transaction_date: '2026-01-01',
      notes: 'nota',
      receipt_photo_url: 'http://receipt',
    } as any;

    const quotationWithEmail = {
      data: {
        clients: { email: 'client@x.com', name: 'Cliente' },
        companies: { name: 'Empresa' },
      },
    } as any;

    it('cascades the amount across installments, marking filled ones as PAGADO', async () => {
      // two pending installments of 100 each, nothing paid yet
      paymentsRepositoryMock.findAllPaymentsFromQuotation.mockResolvedValue({
        data: [
          {
            id: 'p1',
            payment_number: 1,
            amount: 100,
            payment_transactions: [],
          },
          {
            id: 'p2',
            payment_number: 2,
            amount: 100,
            payment_transactions: [],
          },
        ],
      } as any);
      paymentsRepositoryMock.createPaymentTransaction.mockResolvedValue({
        error: null,
      } as any);
      paymentsRepositoryMock.updatePayment.mockResolvedValue({
        error: null,
      } as any);
      quotationsServiceMock.findOne.mockResolvedValue(quotationWithEmail);

      const result = await service.createOverflowPaymentTransaction(
        baseDto,
        companyId,
      );

      // queried the pending/overdue installments for this quotation + company
      expect(
        paymentsRepositoryMock.findAllPaymentsFromQuotation,
      ).toHaveBeenCalledWith(['q1'], companyId, [
        PaymentStatus.PENDIENTE,
        PaymentStatus.VENCIDO,
      ]);

      // first installment fully covered (100), second partially (50)
      expect(
        paymentsRepositoryMock.createPaymentTransaction,
      ).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ payment_id: 'p1', amount: 100 }),
      );
      expect(
        paymentsRepositoryMock.createPaymentTransaction,
      ).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ payment_id: 'p2', amount: 50 }),
      );
      // only the fully-covered installment is marked PAGADO
      expect(paymentsRepositoryMock.updatePayment).toHaveBeenCalledTimes(1);
      expect(paymentsRepositoryMock.updatePayment).toHaveBeenCalledWith('p1', {
        status: PaymentStatus.PAGADO,
      });

      expect(result).toEqual({
        total: 150,
        distribution: [
          {
            payment_id: 'p1',
            payment_number: 1,
            amount: 100,
            fully_paid: true,
          },
          {
            payment_id: 'p2',
            payment_number: 2,
            amount: 50,
            fully_paid: false,
          },
        ],
      });
    });

    it('accounts for amounts already paid on an installment (remaining balance)', async () => {
      // installment of 100 with 30 already paid -> remaining 70
      paymentsRepositoryMock.findAllPaymentsFromQuotation.mockResolvedValue({
        data: [
          {
            id: 'p1',
            payment_number: 1,
            amount: 100,
            payment_transactions: [{ amount: 30 }],
          },
        ],
      } as any);
      paymentsRepositoryMock.createPaymentTransaction.mockResolvedValue({
        error: null,
      } as any);
      paymentsRepositoryMock.updatePayment.mockResolvedValue({
        error: null,
      } as any);
      quotationsServiceMock.findOne.mockResolvedValue({ data: null } as any);

      const result = await service.createOverflowPaymentTransaction(
        { ...baseDto, amount: 70 },
        companyId,
      );

      expect(
        paymentsRepositoryMock.createPaymentTransaction,
      ).toHaveBeenCalledWith(expect.objectContaining({ amount: 70 }));
      expect(paymentsRepositoryMock.updatePayment).toHaveBeenCalledWith('p1', {
        status: PaymentStatus.PAGADO,
      });
      expect(result.distribution[0].fully_paid).toBe(true);
    });

    it('sends a single email to the client with the total amount', async () => {
      paymentsRepositoryMock.findAllPaymentsFromQuotation.mockResolvedValue({
        data: [
          {
            id: 'p1',
            payment_number: 1,
            amount: 200,
            payment_transactions: [],
          },
        ],
      } as any);
      paymentsRepositoryMock.createPaymentTransaction.mockResolvedValue({
        error: null,
      } as any);
      quotationsServiceMock.findOne.mockResolvedValue(quotationWithEmail);

      await service.createOverflowPaymentTransaction(baseDto, companyId);

      expect(emailServiceMock.sendEmail).toHaveBeenCalledTimes(1);
      expect(emailServiceMock.sendEmail).toHaveBeenCalledWith(
        'client@x.com',
        EmailStructure.PAYMENT_RECEIVED,
        expect.objectContaining({ amount: 150 }),
        companyId,
      );
    });

    it('throws when the amount exceeds the total remaining balance', async () => {
      paymentsRepositoryMock.findAllPaymentsFromQuotation.mockResolvedValue({
        data: [
          {
            id: 'p1',
            payment_number: 1,
            amount: 100,
            payment_transactions: [],
          },
        ],
      } as any);

      await expect(
        service.createOverflowPaymentTransaction(
          { ...baseDto, amount: 150 },
          companyId,
        ),
      ).rejects.toThrow();
      expect(
        paymentsRepositoryMock.createPaymentTransaction,
      ).not.toHaveBeenCalled();
    });

    it('throws when there are no pending installments', async () => {
      paymentsRepositoryMock.findAllPaymentsFromQuotation.mockResolvedValue({
        data: [],
      } as any);

      await expect(
        service.createOverflowPaymentTransaction(baseDto, companyId),
      ).rejects.toThrow();
    });

    it('propagates a repository lookup error', async () => {
      paymentsRepositoryMock.findAllPaymentsFromQuotation.mockResolvedValue({
        data: null,
        error: new Error('db down'),
      } as any);

      await expect(
        service.createOverflowPaymentTransaction(baseDto, companyId),
      ).rejects.toThrow();
    });

    it('still succeeds when sending the confirmation email fails', async () => {
      paymentsRepositoryMock.findAllPaymentsFromQuotation.mockResolvedValue({
        data: [
          {
            id: 'p1',
            payment_number: 1,
            amount: 200,
            payment_transactions: [],
          },
        ],
      } as any);
      paymentsRepositoryMock.createPaymentTransaction.mockResolvedValue({
        error: null,
      } as any);
      // email lookup throws -> caught, must not fail the payment
      quotationsServiceMock.findOne.mockRejectedValue(new Error('email boom'));

      const result = await service.createOverflowPaymentTransaction(
        baseDto,
        companyId,
      );

      expect(result.total).toBe(150);
      expect(
        paymentsRepositoryMock.createPaymentTransaction,
      ).toHaveBeenCalled();
    });
  });
});
