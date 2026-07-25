import { Test, TestingModule } from '@nestjs/testing';
import { PinoLogger } from 'nestjs-pino';
import { EmailService } from 'src/email/email.service';
import { EmailStructure } from 'src/email/types';
import { UserRole } from 'src/users/entities/user.entity';
import { UsersService } from 'src/users/users.service';
import { QuotationStatus, RequestType } from '../constants/constants';
import { QuotationsCronService } from '../quotations-cron.service';
import { QuotationsRepository } from '../quotations.repository';

describe('QuotationsCronService', () => {
  let service: QuotationsCronService;
  let quotationsRepositoryMock: jest.Mocked<QuotationsRepository>;
  let usersServiceMock: jest.Mocked<UsersService>;
  let emailServiceMock: jest.Mocked<EmailService>;
  let loggerMock: jest.Mocked<PinoLogger>;

  beforeEach(async () => {
    quotationsRepositoryMock = {
      findAll: jest.fn().mockResolvedValue([]),
    } as any;

    usersServiceMock = {
      findAll: jest.fn().mockResolvedValue([]),
    } as any;

    emailServiceMock = {
      sendEmail: jest.fn().mockResolvedValue(undefined),
    } as any;

    loggerMock = {
      info: jest.fn(),
      error: jest.fn(),
      setContext: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QuotationsCronService,
        { provide: QuotationsRepository, useValue: quotationsRepositoryMock },
        { provide: UsersService, useValue: usersServiceMock },
        { provide: EmailService, useValue: emailServiceMock },
        { provide: PinoLogger, useValue: loggerMock },
      ],
    }).compile();

    service = module.get<QuotationsCronService>(QuotationsCronService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('checkSoonEvents()', () => {
    it('queries accepted cotizacion quotations across all companies (no company filter)', async () => {
      await service.checkSoonEvents();

      expect(quotationsRepositoryMock.findAll).toHaveBeenCalledTimes(1);
      const args = quotationsRepositoryMock.findAll.mock.calls[0][0];
      expect(args.company_id).toBeUndefined();
      expect(args.statuses).toEqual([QuotationStatus.ACEPTADA]);
      expect(args.request_type).toBe(RequestType.COTIZACION);
      expect(args.event_date).toBeInstanceOf(Date);
    });

    it('groups events by company and emails that company admins', async () => {
      quotationsRepositoryMock.findAll.mockResolvedValue([
        { id: 'q1', company_id: 5, event_date: 'd', event_type: 't' },
        { id: 'q2', company_id: 5, event_date: 'd', event_type: 't' },
        { id: 'q3', company_id: 6, event_date: 'd', event_type: 't' },
      ] as any);
      usersServiceMock.findAll.mockResolvedValue([
        { email: 'admin@x.com' },
      ] as any);

      await service.checkSoonEvents();

      expect(usersServiceMock.findAll).toHaveBeenCalledWith(
        5,
        UserRole.ADMINISTRADOR,
      );
      expect(usersServiceMock.findAll).toHaveBeenCalledWith(
        6,
        UserRole.ADMINISTRADOR,
      );
      expect(emailServiceMock.sendEmail).toHaveBeenCalledTimes(2);
      expect(emailServiceMock.sendEmail).toHaveBeenCalledWith(
        ['admin@x.com'],
        EmailStructure.SOON_EVENTS,
        expect.objectContaining({
          events: [
            { id: 'q1', event_date: 'd', event_type: 't' },
            { id: 'q2', event_date: 'd', event_type: 't' },
          ],
        }),
      );
    });

    it('does not send an email when a company has no admins', async () => {
      quotationsRepositoryMock.findAll.mockResolvedValue([
        { id: 'q1', company_id: 5, event_date: 'd', event_type: 't' },
      ] as any);
      usersServiceMock.findAll.mockResolvedValue([]);

      await service.checkSoonEvents();

      expect(emailServiceMock.sendEmail).not.toHaveBeenCalled();
    });

    it('rethrows and logs when the repository fails', async () => {
      quotationsRepositoryMock.findAll.mockRejectedValue(new Error('db down'));
      await expect(service.checkSoonEvents()).rejects.toThrow('db down');
      expect(loggerMock.error).toHaveBeenCalled();
    });
  });

  describe('checkEventsForSurvey()', () => {
    it('sends the satisfaction survey email to each client', async () => {
      quotationsRepositoryMock.findAll.mockResolvedValue([
        {
          id: 'q1',
          company_id: 5,
          clients: { name: 'Ana', email: 'ana@x.com' },
          companies: { name: 'Acme' },
        },
      ] as any);

      await service.checkEventsForSurvey();

      expect(quotationsRepositoryMock.findAll).toHaveBeenCalledTimes(1);
      expect(emailServiceMock.sendEmail).toHaveBeenCalledWith(
        'ana@x.com',
        EmailStructure.CUSTOMER_SATISFACTION_SURVEY,
        {
          clientName: 'Ana',
          companyName: 'Acme',
          companyId: 5,
          quotationId: 'q1',
        },
        5,
      );
    });

    it('rethrows and logs when the repository fails', async () => {
      quotationsRepositoryMock.findAll.mockRejectedValue(new Error('boom'));
      await expect(service.checkEventsForSurvey()).rejects.toThrow('boom');
      expect(loggerMock.error).toHaveBeenCalled();
    });
  });

  describe('checkQuotationStatuses()', () => {
    it('queries the open statuses across all companies', async () => {
      await service.checkQuotationStatuses();

      const args = quotationsRepositoryMock.findAll.mock.calls[0][0];
      expect(args.company_id).toBeUndefined();
      expect(args.statuses).toEqual([
        QuotationStatus.SOLICITADA,
        QuotationStatus.ENVIADA,
        QuotationStatus.EN_NEGOCIACION,
      ]);
    });

    it('summarizes per company and emails the admins the status counts', async () => {
      quotationsRepositoryMock.findAll.mockResolvedValue([
        {
          company_id: 5,
          quotation_status: QuotationStatus.SOLICITADA,
          companies: { name: 'Acme' },
        },
        {
          company_id: 5,
          quotation_status: QuotationStatus.SOLICITADA,
          companies: { name: 'Acme' },
        },
        {
          company_id: 5,
          quotation_status: QuotationStatus.ENVIADA,
          companies: { name: 'Acme' },
        },
      ] as any);
      usersServiceMock.findAll.mockResolvedValue([
        { email: 'admin@acme.com' },
      ] as any);

      await service.checkQuotationStatuses();

      expect(usersServiceMock.findAll).toHaveBeenCalledWith(
        5,
        UserRole.ADMINISTRADOR,
      );
      expect(emailServiceMock.sendEmail).toHaveBeenCalledWith(
        ['admin@acme.com'],
        EmailStructure.QUOTATION_STATUS_CHECK,
        {
          companyId: 5,
          companyName: 'Acme',
          statusCounts: {
            [QuotationStatus.SOLICITADA]: 2,
            [QuotationStatus.ENVIADA]: 1,
          },
          totalQuotations: 3,
        },
      );
    });

    it('does not email a company without admins', async () => {
      quotationsRepositoryMock.findAll.mockResolvedValue([
        {
          company_id: 5,
          quotation_status: QuotationStatus.SOLICITADA,
          companies: { name: 'Acme' },
        },
      ] as any);
      usersServiceMock.findAll.mockResolvedValue([]);

      await service.checkQuotationStatuses();

      expect(emailServiceMock.sendEmail).not.toHaveBeenCalled();
    });

    it('rethrows and logs when the repository fails', async () => {
      quotationsRepositoryMock.findAll.mockRejectedValue(new Error('nope'));
      await expect(service.checkQuotationStatuses()).rejects.toThrow('nope');
      expect(loggerMock.error).toHaveBeenCalled();
    });
  });
});
