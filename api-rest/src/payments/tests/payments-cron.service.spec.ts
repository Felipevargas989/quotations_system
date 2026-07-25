import { Test, TestingModule } from '@nestjs/testing';
import { PinoLogger } from 'nestjs-pino';
import { EmailService } from 'src/email/email.service';
import { EmailStructure } from 'src/email/types';
import { UserRole } from 'src/users/entities/user.entity';
import { UsersService } from 'src/users/users.service';
import {
  OVERDUE_PAYMENTS_DAYS_NOTIFICATION,
  PaymentStatus,
  UPCOMING_OVERDUE_PAYMENTS_DAYS_NOTIFICATION,
} from '../constants';
import { PaymentsCronService } from '../payments-cron.service';
import { PaymentsRepository } from '../payments.repository';

const buildPayment = (overrides: any = {}) => ({
  payment_number: 1,
  amount: 100,
  due_date: new Date('2026-05-01'),
  quotations: {
    company_id: 1,
    quotation_number: 42,
    clients: { name: 'Ana', email: 'ana@test.com' },
    companies: { name: 'Acme' },
  },
  ...overrides,
});

describe('PaymentsCronService', () => {
  let service: PaymentsCronService;
  let paymentsRepositoryMock: jest.Mocked<PaymentsRepository>;
  let emailServiceMock: jest.Mocked<EmailService>;
  let usersServiceMock: jest.Mocked<UsersService>;
  let loggerMock: jest.Mocked<PinoLogger>;

  beforeEach(async () => {
    paymentsRepositoryMock = {
      findAllPaymentsWithTransactions: jest.fn(),
    } as any;

    emailServiceMock = {
      sendEmail: jest.fn(),
    } as any;

    usersServiceMock = {
      findAll: jest.fn(),
    } as any;

    loggerMock = {
      info: jest.fn(),
      error: jest.fn(),
      setContext: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsCronService,
        { provide: PaymentsRepository, useValue: paymentsRepositoryMock },
        { provide: EmailService, useValue: emailServiceMock },
        { provide: UsersService, useValue: usersServiceMock },
        { provide: PinoLogger, useValue: loggerMock },
      ],
    }).compile();

    service = module.get<PaymentsCronService>(PaymentsCronService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('checkUpcomingOrOverduePayments()', () => {
    it('queries payments with the status and normalized due dates for the unique day offsets', async () => {
      paymentsRepositoryMock.findAllPaymentsWithTransactions.mockResolvedValue({
        data: [],
        error: null,
      } as any);

      await service.checkUpcomingOrOverduePayments(
        PaymentStatus.PENDIENTE,
        [7, 7, 3],
        EmailStructure.PAYMENT_REMINDER,
      );

      const call =
        paymentsRepositoryMock.findAllPaymentsWithTransactions.mock.calls[0];
      expect(call[0]).toBeUndefined();
      expect(call[1]).toEqual([PaymentStatus.PENDIENTE]);
      // duplicate offset 7 collapses to a single normalized date -> 2 dates
      expect(call[2]).toHaveLength(2);
    });

    it('does nothing else when no payments are found', async () => {
      paymentsRepositoryMock.findAllPaymentsWithTransactions.mockResolvedValue({
        data: [],
        error: null,
      } as any);

      await service.checkUpcomingOrOverduePayments(
        PaymentStatus.PENDIENTE,
        0,
        EmailStructure.PAYMENT_REMINDER,
      );

      expect(emailServiceMock.sendEmail).not.toHaveBeenCalled();
      expect(usersServiceMock.findAll).not.toHaveBeenCalled();
    });

    it('emails the client and the company administrators for each payment', async () => {
      paymentsRepositoryMock.findAllPaymentsWithTransactions.mockResolvedValue({
        data: [buildPayment()],
        error: null,
      } as any);
      usersServiceMock.findAll.mockResolvedValue([
        { email: 'admin@acme.com' },
      ] as any);

      await service.checkUpcomingOrOverduePayments(
        PaymentStatus.PENDIENTE,
        [0],
        EmailStructure.PAYMENT_REMINDER,
      );

      // client email
      expect(emailServiceMock.sendEmail).toHaveBeenCalledWith(
        'ana@test.com',
        EmailStructure.PAYMENT_REMINDER,
        expect.objectContaining({ clientName: 'Ana', companyName: 'Acme' }),
        1,
      );
      // admins lookup scoped to the company and the administrador role
      expect(usersServiceMock.findAll).toHaveBeenCalledWith(
        1,
        UserRole.ADMINISTRADOR,
      );
      // admin email uses the admin variant of the template
      expect(emailServiceMock.sendEmail).toHaveBeenCalledWith(
        ['admin@acme.com'],
        EmailStructure.PAYMENT_REMINDER_ADMIN,
        expect.any(Object),
        1,
      );
    });

    it('uses the overdue admin template when sending overdue reminders', async () => {
      paymentsRepositoryMock.findAllPaymentsWithTransactions.mockResolvedValue({
        data: [buildPayment()],
        error: null,
      } as any);
      usersServiceMock.findAll.mockResolvedValue([
        { email: 'admin@acme.com' },
      ] as any);

      await service.checkUpcomingOrOverduePayments(
        PaymentStatus.VENCIDO,
        [-3],
        EmailStructure.PAYMENT_OVERDUE,
      );

      expect(emailServiceMock.sendEmail).toHaveBeenCalledWith(
        ['admin@acme.com'],
        EmailStructure.PAYMENT_OVERDUE_ADMIN,
        expect.any(Object),
        1,
      );
    });

    it('skips the admin email when there are no administrators', async () => {
      paymentsRepositoryMock.findAllPaymentsWithTransactions.mockResolvedValue({
        data: [buildPayment()],
        error: null,
      } as any);
      usersServiceMock.findAll.mockResolvedValue([] as any);

      await service.checkUpcomingOrOverduePayments(
        PaymentStatus.PENDIENTE,
        [0],
        EmailStructure.PAYMENT_REMINDER,
      );

      // only the client email is sent
      expect(emailServiceMock.sendEmail).toHaveBeenCalledTimes(1);
    });

    it('logs and rethrows when the repository fails', async () => {
      paymentsRepositoryMock.findAllPaymentsWithTransactions.mockRejectedValue(
        new Error('db down'),
      );

      await expect(
        service.checkUpcomingOrOverduePayments(
          PaymentStatus.PENDIENTE,
          [0],
          EmailStructure.PAYMENT_REMINDER,
        ),
      ).rejects.toThrow('db down');
      expect(loggerMock.error).toHaveBeenCalled();
    });
  });

  describe('scheduled entrypoints', () => {
    it('checkUpcomingOverduePayments checks PENDIENTE payments with the upcoming offsets', async () => {
      const spy = jest
        .spyOn(service, 'checkUpcomingOrOverduePayments')
        .mockResolvedValue(undefined);

      await service.checkUpcomingOverduePayments();

      expect(spy).toHaveBeenCalledWith(
        PaymentStatus.PENDIENTE,
        UPCOMING_OVERDUE_PAYMENTS_DAYS_NOTIFICATION,
        EmailStructure.PAYMENT_REMINDER,
      );
    });

    it('checkOverduePayments checks VENCIDO payments with the overdue offsets', async () => {
      const spy = jest
        .spyOn(service, 'checkUpcomingOrOverduePayments')
        .mockResolvedValue(undefined);

      await service.checkOverduePayments();

      expect(spy).toHaveBeenCalledWith(
        PaymentStatus.VENCIDO,
        OVERDUE_PAYMENTS_DAYS_NOTIFICATION,
        EmailStructure.PAYMENT_OVERDUE,
      );
    });
  });
});
