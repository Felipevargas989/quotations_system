import { Test, TestingModule } from '@nestjs/testing';
import { PinoLogger } from 'nestjs-pino';
import { ClientsService } from 'src/clients/clients.service';
import { EmailService } from 'src/email/email.service';
import { CreatePaymentDto } from 'src/payments/dto/create-payment.dto';
import { PaymentsService } from 'src/payments/payments.service';
import { QuotationStatus } from 'src/quotations/constants/constants';
import { UpdateQuotationDto } from 'src/quotations/dto/update-quotation.dto';
import { QuotationsRepository } from 'src/quotations/quotations.repository';
import { RefundsService } from 'src/refunds/refunds.service';
import { StorageService } from 'src/storage/storage.service';
import { UsersService } from 'src/users/users.service';
import { PortalReceiptsRepository } from '../../portal-receipts.controller';
import { QuotationsService } from '../../quotations.service';

describe('QuotationsService', () => {
  // service to test
  let service: QuotationsService;

  // mock dependencies
  let quotationsRepositoryMock: jest.Mocked<QuotationsRepository>;
  let refundsServiceMock: jest.Mocked<RefundsService>;
  let paymentsServiceMock: jest.Mocked<PaymentsService>;
  let clientsServiceMock: jest.Mocked<ClientsService>;
  let emailServiceMock: jest.Mocked<EmailService>;
  let usersServiceMock: jest.Mocked<UsersService>;
  let loggerMock: jest.Mocked<PinoLogger>;

  beforeEach(async () => {
    // Create mock objects
    quotationsRepositoryMock = {
      findOne: jest.fn(),
      // findAll: jest.fn(),
      // create: jest.fn(),
      update: jest.fn(),
      // delete: jest.fn(),
    } as any;

    refundsServiceMock = {
      create: jest.fn(),
      // Tarea #42 (compensación): update() consulta los reembolsos
      // pendientes antes de crear deuda nueva. Sin reembolsos (lista
      // vacía), el comportamiento es el de siempre — que es justo lo
      // que estas pruebas verifican.
      findPendingByQuotation: jest.fn().mockResolvedValue([]),
      // findAll: jest.fn(),
      // findOne: jest.fn(),
      // update: jest.fn(),
    } as any;

    paymentsServiceMock = {
      findAllPaymentsFromQuotation: jest.fn(),
      createPayment: jest.fn(),
      update: jest.fn(),
      // findAll: jest.fn(),
      // findOne: jest.fn(),
      // update: jest.fn(),
    } as any;

    clientsServiceMock = {
      // findOne: jest.fn(),
      // create: jest.fn(),
      // update: jest.fn(),
      // findAll: jest.fn(),
    } as any;

    emailServiceMock = {
      // sendEmail: jest.fn(),
    } as any;

    usersServiceMock = {
      // findOne: jest.fn(),
      // findAll: jest.fn(),
      // create: jest.fn(),
      // update: jest.fn(),
    } as any;

    loggerMock = {
      // info: jest.fn(),
      error: jest.fn(),
      // warn: jest.fn(),
      // debug: jest.fn(),
      setContext: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QuotationsService,
        {
          provide: QuotationsRepository,
          useValue: quotationsRepositoryMock,
        },
        {
          provide: RefundsService,
          useValue: refundsServiceMock,
        },
        {
          provide: PaymentsService,
          useValue: paymentsServiceMock,
        },
        {
          provide: ClientsService,
          useValue: clientsServiceMock,
        },
        {
          provide: EmailService,
          useValue: emailServiceMock,
        },
        {
          provide: UsersService,
          useValue: usersServiceMock,
        },
        {
          provide: StorageService,
          useValue: { upload: jest.fn() } as any,
        },
        {
          provide: PortalReceiptsRepository,
          useValue: {
            insert: jest.fn(),
            pendingPaymentIds: jest.fn().mockResolvedValue(new Set()),
          } as any,
        },
        {
          provide: PinoLogger,
          useValue: loggerMock,
        },
      ],
    }).compile();

    service = module.get<QuotationsService>(QuotationsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('update()', () => {
    it('when quotation query thorugh an error, it should throw an error', async () => {
      quotationsRepositoryMock.findOne.mockResolvedValue({
        error: new Error(),
      });

      // await service.update('1', {}, 1);
      await expect(service.update('1', {}, 1)).rejects.toThrow();
    });

    it('when quotation is null, it should throw an error', async () => {
      quotationsRepositoryMock.findOne.mockResolvedValue({
        data: null,
        error: null,
      });

      await expect(service.update('1', {}, 1)).rejects.toThrow(
        'Quotation not found',
      );
    });

    it('when quotation status is differente from ACEPTADA and ENVIADA, it should execute the repo.update function', async () => {
      quotationsRepositoryMock.findOne.mockResolvedValue({
        data: {
          quotation_status: QuotationStatus.EN_NEGOCIACION,
        },
        error: null,
      });

      const params: UpdateQuotationDto = {
        quotation_status: QuotationStatus.EN_NEGOCIACION,
      };

      const quotation_id = '1';
      const company_id = 1;

      await service.update(quotation_id, params, company_id);

      // service.update.
      expect(quotationsRepositoryMock.update).toHaveBeenCalledWith(
        quotation_id,
        params,
        company_id,
      );
    });

    describe('if quotation_status is ACEPTADA', () => {
      it('whenn findAllPaymentsFromQuotation through error, it should throw error', async () => {
        quotationsRepositoryMock.findOne.mockResolvedValue({
          data: {
            quotation_status: QuotationStatus.ACEPTADA,
          },
          error: null,
        });

        paymentsServiceMock.findAllPaymentsFromQuotation.mockReturnValue({
          data: null,
          error: new Error(),
        });

        await expect(service.update('1', {}, 1)).rejects.toThrow();
      });

      it('when quotation total_amount is the same as original, it should update the quotation', async () => {
        const quotation_id = '1';
        const company_id = 1;

        const params: UpdateQuotationDto = {
          total_amount: 100,
        };

        quotationsRepositoryMock.findOne.mockResolvedValue({
          data: {
            quotation_status: QuotationStatus.ACEPTADA,
            total_amount: 100,
            subtotal_amount: 100,
            fixed_value: 100,
            items: { fixed_services: [{ precio: 100, quantity: 1 }] },
          },
          error: null,
        });

        paymentsServiceMock.findAllPaymentsFromQuotation.mockReturnValue({
          data: null,
          error: null,
        });

        // await expect(service.update('1', params, 1)).rejects.toThrow();
        await service.update(quotation_id, params, 1);

        expect(quotationsRepositoryMock.update).toHaveBeenCalledWith(
          quotation_id,
          params,
          company_id,
        );
      });

      it('when new quotation total_amount is smaller than the original and not payments are created, it should create a refund and update the quotation', async () => {
        const quotation_id = '1';
        const company_id = 1;

        const originalAmount = 100;
        const newTotalAmount = 90;

        const params: UpdateQuotationDto = {
          total_amount: newTotalAmount,
          discount_amount: 10,
        };

        quotationsRepositoryMock.findOne.mockResolvedValue({
          data: {
            quotation_status: QuotationStatus.ACEPTADA,
            total_amount: originalAmount,
            subtotal_amount: 100,
            fixed_value: 100,
            items: { fixed_services: [{ precio: 100, quantity: 1 }] },
          },
          error: null,
        });

        paymentsServiceMock.findAllPaymentsFromQuotation.mockReturnValue({
          data: [],
          error: null,
        });

        // act
        await service.update(quotation_id, params, 1);

        // assert refund creation was called
        expect(refundsServiceMock.create).toHaveBeenCalledWith({
          amount: originalAmount - newTotalAmount,
          quotation_id: quotation_id,
        });

        // assert quotation update was called
        expect(quotationsRepositoryMock.update).toHaveBeenCalledWith(
          quotation_id,
          params,
          company_id,
        );
      });

      it('when new quotation total_amount is greather than the original and not payments are created, it should creates a new payment and update the quotation', async () => {
        const quotation_id = '1';
        const company_id = 1;

        const originalAmount = 90;
        const newTotalAmount = 100;

        const params: UpdateQuotationDto = {
          total_amount: newTotalAmount,
          subtotal_amount: 100,
          fixed_value: 100,
          items: { fixed_services: [], variable_services: [] } as never,
        };
        params.items = {
          fixed_services: [{ precio: 100, quantity: 1 }],
          variable_services: [],
        } as never;

        quotationsRepositoryMock.findOne.mockResolvedValue({
          data: {
            quotation_status: QuotationStatus.ACEPTADA,
            total_amount: originalAmount,
          },
          error: null,
        });

        paymentsServiceMock.findAllPaymentsFromQuotation.mockReturnValue({
          data: [],
          error: null,
        });

        // act
        await service.update(quotation_id, params, 1);

        // assert refund creation was not called
        expect(refundsServiceMock.create).toHaveBeenCalledTimes(0);

        // assert new payment was created
        const newPaymentPayload: Omit<CreatePaymentDto, 'notes'> = {
          quotation_id: quotation_id,
          amount: newTotalAmount - originalAmount,
        };
        expect(paymentsServiceMock.createPayment).toHaveBeenCalledWith(
          {
            ...newPaymentPayload,
            notes: 'Pago creado por diferencia de total_amount',
          },
          company_id,
        );

        // assert quotation update was called
        expect(quotationsRepositoryMock.update).toHaveBeenCalledWith(
          quotation_id,
          params,
          company_id,
        );
      });

      it('when new quotation total_amount is greather than the original and payments are already created, it should update the amoun of the last payment and update the quotation', async () => {
        const quotation_id = '1';
        const company_id = 1;

        const originalAmount = 90;
        const newTotalAmount = 100;

        const params: UpdateQuotationDto = {
          total_amount: newTotalAmount,
          subtotal_amount: 100,
          fixed_value: 100,
          items: { fixed_services: [], variable_services: [] } as never,
        };
        params.items = {
          fixed_services: [{ precio: 100, quantity: 1 }],
          variable_services: [],
        } as never;

        quotationsRepositoryMock.findOne.mockResolvedValue({
          data: {
            quotation_status: QuotationStatus.ACEPTADA,
            total_amount: originalAmount,
          },
          error: null,
        });

        const payments = [
          {
            id: 1,
            amount: 10,
          },
          {
            id: 2,
            amount: 20,
          },
        ];

        paymentsServiceMock.findAllPaymentsFromQuotation.mockReturnValue({
          data: payments,
          error: null,
        });

        // act
        await service.update(quotation_id, params, 1);

        // assert refund creation was not called
        expect(refundsServiceMock.create).toHaveBeenCalledTimes(0);

        // assert new payment was not created
        expect(paymentsServiceMock.createPayment).toHaveBeenCalledTimes(0);

        // assert update payment was called
        // get last payment
        const lastPayment = payments[payments.length - 1];
        expect(paymentsServiceMock.update).toHaveBeenCalledWith(
          lastPayment.id,
          {
            amount: lastPayment.amount + (newTotalAmount - originalAmount),
          },
        );

        // assert quotation update was called
        expect(quotationsRepositoryMock.update).toHaveBeenCalledWith(
          quotation_id,
          params,
          company_id,
        );
      });
    });
  });
});
