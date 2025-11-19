import { Test, TestingModule } from '@nestjs/testing';
import { PinoLogger } from 'nestjs-pino';
import { ClientsService } from 'src/clients/clients.service';
import { EmailService } from 'src/email/email.service';
import { PaymentsService } from 'src/payments/payments.service';
import { QuotationStatus } from 'src/quotations/constants/constants';
import { UpdateQuotationDto } from 'src/quotations/dto/update-quotation.dto';
import { QuotationsRepository } from 'src/quotations/quotations.repository';
import { RefundsService } from 'src/refunds/refunds.service';
import { UsersService } from 'src/users/users.service';
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
      // create: jest.fn(),
      // findAll: jest.fn(),
      // findOne: jest.fn(),
      // update: jest.fn(),
    } as any;

    paymentsServiceMock = {
      // create: jest.fn(),
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
          provide: PinoLogger,
          useValue: loggerMock,
        },
      ],
    }).compile();

    service = module.get<QuotationsService>(QuotationsService);
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
  });
});
