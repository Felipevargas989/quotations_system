import { Test, TestingModule } from '@nestjs/testing';
import { PinoLogger } from 'nestjs-pino';
import { PaymentsController } from '../payments.controller';
import { PaymentsService } from '../payments.service';

describe('PaymentsController', () => {
  let controller: PaymentsController;
  let serviceMock: jest.Mocked<PaymentsService>;
  let loggerMock: jest.Mocked<PinoLogger>;

  const user = { id: 10, company_id: 1 } as any;

  beforeEach(async () => {
    serviceMock = {
      createPaymentPlan: jest.fn(),
      findAllPaymentsFromQuotation: jest.fn(),
      findAllPaymentsWithTransactions: jest.fn(),
      createPaymentTransaction: jest.fn(),
      createOverflowPaymentTransaction: jest.fn(),
      updatePaymentTransaction: jest.fn(),
      removePayment: jest.fn(),
      removePaymentTransaction: jest.fn(),
    } as any;

    loggerMock = {
      info: jest.fn(),
      error: jest.fn(),
      setContext: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PaymentsController],
      providers: [
        { provide: PaymentsService, useValue: serviceMock },
        { provide: PinoLogger, useValue: loggerMock },
      ],
    }).compile();

    controller = module.get<PaymentsController>(PaymentsController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('createPaymentPlan forwards the dto and the user company id', () => {
    const dto = { quotation_id: 5, payments: [] } as any;
    controller.createPaymentPlan(dto, user);
    expect(serviceMock.createPaymentPlan).toHaveBeenCalledWith(
      dto,
      user.company_id,
    );
  });

  it('findAllPaymensFromQuotation wraps the quotation id and forwards the company id', () => {
    controller.findAllPaymensFromQuotation(7 as any, user);
    expect(serviceMock.findAllPaymentsFromQuotation).toHaveBeenCalledWith(
      [7],
      user.company_id,
    );
  });

  it('findAllPaymentsWithTransactions forwards the user company id', () => {
    controller.findAllPaymentsWithTransactions(user);
    expect(serviceMock.findAllPaymentsWithTransactions).toHaveBeenCalledWith(
      user.company_id,
    );
  });

  it('createPaymentTransaction forwards the dto and the user company id', () => {
    const dto = { payment_id: 'p1', amount: 10 } as any;
    controller.createPaymentTransaction(dto, user);
    expect(serviceMock.createPaymentTransaction).toHaveBeenCalledWith(
      dto,
      user.company_id,
    );
  });

  it('createOverflowPaymentTransaction forwards the dto and the user company id', () => {
    const dto = {
      quotation_id: 'q1',
      amount: 100,
      payment_method: 'transferencia',
      transaction_date: '2026-01-01',
    } as any;
    controller.createOverflowPaymentTransaction(dto, user);
    expect(serviceMock.createOverflowPaymentTransaction).toHaveBeenCalledWith(
      dto,
      user.company_id,
    );
  });

  it('updatePaymentTransaction forwards the id, dto and company id', () => {
    const dto = { amount: 20 } as any;
    controller.updatePaymentTransaction('t1', dto, user);
    expect(serviceMock.updatePaymentTransaction).toHaveBeenCalledWith(
      't1',
      dto,
      user.company_id,
    );
  });

  it('removePayment forwards the payment id', () => {
    controller.removePayment('p1' as any);
    expect(serviceMock.removePayment).toHaveBeenCalledWith('p1');
  });

  it('removePaymentTransaction coerces the id to a number', () => {
    controller.removePaymentTransaction('8' as any);
    expect(serviceMock.removePaymentTransaction).toHaveBeenCalledWith(8);
  });
});
