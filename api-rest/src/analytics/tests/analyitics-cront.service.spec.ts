import { Test, TestingModule } from '@nestjs/testing';
import { PinoLogger } from 'nestjs-pino';
import { EmailService } from 'src/email/email.service';
import { EmailStructure } from 'src/email/types';
import { UserRole } from 'src/users/entities/user.entity';
import { UsersService } from 'src/users/users.service';
import { AnalyticsCronService } from '../analyitics-cront.service';

describe('AnalyticsCronService', () => {
  let service: AnalyticsCronService;
  let usersServiceMock: jest.Mocked<UsersService>;
  let emailServiceMock: jest.Mocked<EmailService>;
  let loggerMock: jest.Mocked<PinoLogger>;

  beforeEach(async () => {
    usersServiceMock = {
      findAll: jest.fn(),
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
        AnalyticsCronService,
        { provide: UsersService, useValue: usersServiceMock },
        { provide: EmailService, useValue: emailServiceMock },
        { provide: PinoLogger, useValue: loggerMock },
      ],
    }).compile();

    service = module.get<AnalyticsCronService>(AnalyticsCronService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('sendWeeklyAnalytics()', () => {
    it('fetches every company administrator and emails them a weekly analytics link', async () => {
      usersServiceMock.findAll.mockResolvedValue([
        { email: 'admin1@test.com' },
        { email: 'admin2@test.com' },
      ] as any);
      emailServiceMock.sendEmail.mockResolvedValue(undefined as any);

      await service.sendWeeklyAnalytics();

      // pulls admins across all companies (no companyId, ADMINISTRADOR role)
      expect(usersServiceMock.findAll).toHaveBeenCalledWith(
        undefined,
        UserRole.ADMINISTRADOR,
      );

      // sends to the admin emails with the weekly analytics template
      expect(emailServiceMock.sendEmail).toHaveBeenCalledTimes(1);
      const [recipients, template, payload] =
        emailServiceMock.sendEmail.mock.calls[0];
      expect(recipients).toEqual(['admin1@test.com', 'admin2@test.com']);
      expect(template).toBe(EmailStructure.WEEKLY_ANALYTICS);
      expect(payload.link).toContain(
        'https://www.eventi-app.com/analytics?from=',
      );
      expect(payload.link).toContain('&to=');
      // dates are formatted as YYYY-MM-DD
      expect(payload.link).toMatch(
        /from=\d{4}-\d{2}-\d{2}&to=\d{4}-\d{2}-\d{2}/,
      );
    });

    it('sends an empty recipient list when there are no administrators', async () => {
      usersServiceMock.findAll.mockResolvedValue([] as any);
      emailServiceMock.sendEmail.mockResolvedValue(undefined as any);

      await service.sendWeeklyAnalytics();

      const [recipients] = emailServiceMock.sendEmail.mock.calls[0];
      expect(recipients).toEqual([]);
    });

    it('propagates errors from the users lookup', async () => {
      usersServiceMock.findAll.mockRejectedValue(new Error('db down'));

      await expect(service.sendWeeklyAnalytics()).rejects.toThrow('db down');
      expect(emailServiceMock.sendEmail).not.toHaveBeenCalled();
    });
  });
});
