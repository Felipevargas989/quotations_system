import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { PinoLogger } from 'nestjs-pino';
import { CompaniesRepository } from 'src/companies/companies.repository';
import { CustomerSatisfactionSurveyService } from 'src/customer_satisfaction_survey/service';
import { EmailService } from 'src/email/email.service';
import { EmailStructure } from 'src/email/types/index';
import { UserRole } from 'src/users/entities/user.entity';
import { UsersService } from 'src/users/users.service';
import { CreateSuscriptionDto } from '../dto/create-suscription.dto';
import { SuperAdminRepository } from '../super-admin.repository';
import { SuperAdminService } from '../super-admin.service';

describe('SuperAdminService', () => {
  let service: SuperAdminService;
  let loggerMock: jest.Mocked<PinoLogger>;
  let configServiceMock: jest.Mocked<ConfigService>;
  let usersServiceMock: jest.Mocked<UsersService>;
  let companiesRepositoryMock: jest.Mocked<CompaniesRepository>;
  let superAdminRepositoryMock: jest.Mocked<SuperAdminRepository>;
  let customerSatisfactionSurveyServiceMock: jest.Mocked<CustomerSatisfactionSurveyService>;
  let emailServiceMock: jest.Mocked<EmailService>;

  beforeEach(async () => {
    loggerMock = {
      info: jest.fn(),
      error: jest.fn(),
      setContext: jest.fn(),
    } as any;

    configServiceMock = { get: jest.fn() } as any;
    usersServiceMock = { create: jest.fn() } as any;
    companiesRepositoryMock = { create: jest.fn() } as any;
    superAdminRepositoryMock = {
      getStatsLastMonth: jest.fn(),
      getUsersLastSignIns: jest.fn(),
    } as any;
    customerSatisfactionSurveyServiceMock = {
      createTemplate: jest.fn(),
    } as any;
    emailServiceMock = { sendEmail: jest.fn() } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SuperAdminService,
        { provide: PinoLogger, useValue: loggerMock },
        { provide: ConfigService, useValue: configServiceMock },
        { provide: UsersService, useValue: usersServiceMock },
        { provide: CompaniesRepository, useValue: companiesRepositoryMock },
        { provide: SuperAdminRepository, useValue: superAdminRepositoryMock },
        {
          provide: CustomerSatisfactionSurveyService,
          useValue: customerSatisfactionSurveyServiceMock,
        },
        { provide: EmailService, useValue: emailServiceMock },
      ],
    }).compile();

    service = module.get<SuperAdminService>(SuperAdminService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createSuscription()', () => {
    const dto: CreateSuscriptionDto = {
      admin_email: 'admin@acme.com',
      admin_password: 'secret',
      admin_full_name: 'Admin User',
      company_name: 'Acme',
      currency: 'CLP',
    } as any;

    it('creates the company, user, survey template and sends the welcome email', async () => {
      companiesRepositoryMock.create.mockResolvedValue({
        data: { id: 5 },
        error: null,
      } as any);
      usersServiceMock.create.mockResolvedValue({
        data: { id: 9 },
        error: null,
      } as any);
      customerSatisfactionSurveyServiceMock.createTemplate.mockResolvedValue(
        undefined as any,
      );
      emailServiceMock.sendEmail.mockResolvedValue(undefined as any);

      const result = await service.createSuscription(dto);

      expect(companiesRepositoryMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Acme',
          currency: 'CLP',
          is_active: true,
          notifications: expect.objectContaining({
            emails: expect.any(Object),
          }),
        }),
      );
      expect(usersServiceMock.create).toHaveBeenCalledWith(
        {
          email: dto.admin_email,
          full_name: dto.admin_full_name,
          role: UserRole.ADMINISTRADOR,
          password: dto.admin_password,
        },
        5,
      );
      expect(
        customerSatisfactionSurveyServiceMock.createTemplate,
      ).toHaveBeenCalledWith(5);
      expect(emailServiceMock.sendEmail).toHaveBeenCalledWith(
        dto.admin_email,
        EmailStructure.NEW_ACCOUNT,
      );
      expect(result).toEqual({
        userData: { id: 9 },
        companyData: { id: 5 },
      });
    });

    it('enables every email notification by default when creating the company', async () => {
      companiesRepositoryMock.create.mockResolvedValue({
        data: { id: 5 },
        error: null,
      } as any);
      usersServiceMock.create.mockResolvedValue({
        data: { id: 9 },
        error: null,
      } as any);
      customerSatisfactionSurveyServiceMock.createTemplate.mockResolvedValue(
        undefined as any,
      );
      emailServiceMock.sendEmail.mockResolvedValue(undefined as any);

      await service.createSuscription(dto);

      const createdCompany = companiesRepositoryMock.create.mock.calls[0][0];
      expect(
        createdCompany.notifications.emails[EmailStructure.NEW_ACCOUNT],
      ).toBe(true);
    });

    it('throws and skips user creation when the company cannot be created', async () => {
      companiesRepositoryMock.create.mockResolvedValue({
        data: null,
        error: { message: 'company boom' },
      } as any);

      await expect(service.createSuscription(dto)).rejects.toThrow(
        'Failed to create company: company boom',
      );
      expect(usersServiceMock.create).not.toHaveBeenCalled();
    });

    it('throws when the repository returns no company data', async () => {
      companiesRepositoryMock.create.mockResolvedValue({
        data: null,
        error: null,
      } as any);

      await expect(service.createSuscription(dto)).rejects.toThrow(
        'Failed to create company',
      );
      expect(usersServiceMock.create).not.toHaveBeenCalled();
    });

    it('throws the user error when user creation fails', async () => {
      companiesRepositoryMock.create.mockResolvedValue({
        data: { id: 5 },
        error: null,
      } as any);
      usersServiceMock.create.mockResolvedValue({
        data: null,
        error: new Error('user boom'),
      } as any);

      await expect(service.createSuscription(dto)).rejects.toThrow('user boom');
      expect(
        customerSatisfactionSurveyServiceMock.createTemplate,
      ).not.toHaveBeenCalled();
    });
  });

  describe('notifySuperAdmins()', () => {
    it('sends the notification to every configured super admin email', async () => {
      configServiceMock.get.mockReturnValue('a@a.com, b@b.com');
      emailServiceMock.sendEmail.mockResolvedValue(undefined as any);

      const result = await service.notifySuperAdmins({ content: 'hello' });

      expect(configServiceMock.get).toHaveBeenCalledWith('SUPER_ADMIN_EMAILS');
      expect(emailServiceMock.sendEmail).toHaveBeenCalledWith(
        ['a@a.com', 'b@b.com'],
        EmailStructure.SUPER_ADMIN_NOTIFICATION,
        { content: 'hello' },
      );
      expect(result).toEqual({ success: true });
    });

    it('throws when the SUPER_ADMIN_EMAILS env variable is not configured', async () => {
      configServiceMock.get.mockReturnValue(undefined);

      await expect(
        service.notifySuperAdmins({ content: 'hello' }),
      ).rejects.toThrow('SUPER_ADMIN_EMAILS env variable is not configured');
      expect(emailServiceMock.sendEmail).not.toHaveBeenCalled();
    });

    it('throws when the allowlist contains no valid emails', async () => {
      configServiceMock.get.mockReturnValue('  ,  , ');

      await expect(
        service.notifySuperAdmins({ content: 'hello' }),
      ).rejects.toThrow('SUPER_ADMIN_EMAILS env variable has no valid emails');
      expect(emailServiceMock.sendEmail).not.toHaveBeenCalled();
    });

    it('rethrows when sending the email fails', async () => {
      configServiceMock.get.mockReturnValue('a@a.com');
      emailServiceMock.sendEmail.mockRejectedValue(new Error('email down'));

      await expect(
        service.notifySuperAdmins({ content: 'hello' }),
      ).rejects.toThrow('email down');
    });
  });

  describe('getStatsLastMonth()', () => {
    const companyStats = [
      {
        company_id: 1,
        company_name: 'A',
        stats: [{ date: '2026-07-01', count: 1, total_amount: 100 }],
        total_quotations: 2,
        total_amount: 100,
      },
      {
        company_id: 2,
        company_name: 'B',
        stats: [{ date: '2026-07-01', count: 2, total_amount: 200 }],
        total_quotations: 3,
        total_amount: 200,
      },
    ];

    it('aggregates company stats and user sign-in totals into a response', async () => {
      superAdminRepositoryMock.getStatsLastMonth.mockResolvedValue({
        data: companyStats,
        error: null,
      } as any);
      superAdminRepositoryMock.getUsersLastSignIns.mockResolvedValue({
        data: [{ id: 'u1', email: 'u1@a.com' }],
        error: null,
        totals: {
          total_users: 10,
          total_signed_in_in_period: 4,
          total_never_signed_in: 6,
        },
      } as any);

      const result = await service.getStatsLastMonth();

      expect(result.companies).toBe(companyStats);
      expect(result.total_quotations_all_companies).toBe(5);
      expect(result.total_amount_all_companies).toBe(300);
      // both companies contributed to the same day
      expect(result.total_quotations).toEqual([
        { date: '2026-07-01', count: 3, total_amount: 300 },
      ]);
      expect(result.user_sign_in_stats).toEqual(
        expect.objectContaining({
          total_users: 10,
          total_signed_in_in_period: 4,
          total_never_signed_in: 6,
          users: [{ id: 'u1', email: 'u1@a.com' }],
        }),
      );
      expect(result.period).toContain(' to ');
    });

    it('throws when the stats repository returns an error', async () => {
      superAdminRepositoryMock.getStatsLastMonth.mockResolvedValue({
        data: null,
        error: { message: 'stats boom' },
      } as any);

      await expect(service.getStatsLastMonth()).rejects.toThrow(
        'Failed to get quotation stats: stats boom',
      );
      expect(
        superAdminRepositoryMock.getUsersLastSignIns,
      ).not.toHaveBeenCalled();
    });

    it('throws when no stats data is returned', async () => {
      superAdminRepositoryMock.getStatsLastMonth.mockResolvedValue({
        data: null,
        error: null,
      } as any);

      await expect(service.getStatsLastMonth()).rejects.toThrow(
        'No data returned from repository',
      );
    });

    it('throws when the user sign-in lookup returns an error', async () => {
      superAdminRepositoryMock.getStatsLastMonth.mockResolvedValue({
        data: companyStats,
        error: null,
      } as any);
      superAdminRepositoryMock.getUsersLastSignIns.mockResolvedValue({
        data: null,
        error: { message: 'auth boom' },
        totals: {
          total_users: 0,
          total_signed_in_in_period: 0,
          total_never_signed_in: 0,
        },
      } as any);

      await expect(service.getStatsLastMonth()).rejects.toThrow(
        'Failed to get user stats: auth boom',
      );
    });
  });
});
