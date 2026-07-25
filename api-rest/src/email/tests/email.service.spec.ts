import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { PinoLogger } from 'nestjs-pino';
import { Resend } from 'resend';
import { CompaniesRepository } from 'src/companies/companies.repository';
import { EMAIL_FROM, EMAIL_SUBJECTS } from '../constants';
import { EmailService } from '../email.service';
import { EmailStructure } from '../types';

type SentPayload = {
  from: string;
  to: string[];
  subject: string;
  html: string;
};

// Mock the Resend client so no real network calls are made. Every `new Resend()`
// returns an object whose `emails.send` is the shared, typed jest.fn below.
const sendMock = jest.fn<Promise<unknown>, [SentPayload]>();
jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: { send: sendMock },
  })),
}));

const ResendMock = Resend as unknown as jest.Mock;

describe('EmailService', () => {
  let service: EmailService;
  let configServiceMock: jest.Mocked<ConfigService>;
  let companiesRepositoryMock: jest.Mocked<CompaniesRepository>;
  let loggerMock: jest.Mocked<PinoLogger>;

  beforeEach(async () => {
    configServiceMock = {
      get: jest.fn((key: string) =>
        key === 'RESEND_API_KEY' ? 'test-api-key' : undefined,
      ),
    } as any;

    companiesRepositoryMock = {
      findOne: jest.fn(),
    } as any;

    loggerMock = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      setContext: jest.fn(),
    } as any;

    sendMock.mockResolvedValue({ data: { id: 'email-1' }, error: null });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailService,
        { provide: ConfigService, useValue: configServiceMock },
        { provide: CompaniesRepository, useValue: companiesRepositoryMock },
        { provide: PinoLogger, useValue: loggerMock },
      ],
    }).compile();

    service = module.get<EmailService>(EmailService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('constructs Resend with the configured API key and sends the email', async () => {
    await service.sendEmail('user@x.com', EmailStructure.NEW_ACCOUNT);

    expect(configServiceMock.get).toHaveBeenCalledWith('RESEND_API_KEY');
    expect(ResendMock).toHaveBeenCalledWith('test-api-key');
    expect(sendMock).toHaveBeenCalledTimes(1);

    const payload = sendMock.mock.calls[0][0];
    expect(payload.from).toBe(EMAIL_FROM);
    expect(payload.to).toEqual(['user@x.com']);
    expect(payload.subject).toBe(EMAIL_SUBJECTS[EmailStructure.NEW_ACCOUNT]);
    expect(typeof payload.html).toBe('string');
  });

  it('does not send when no recipient is provided', async () => {
    await service.sendEmail(null, EmailStructure.NEW_ACCOUNT);

    expect(sendMock).not.toHaveBeenCalled();
    expect(loggerMock.warn).toHaveBeenCalledWith('No email provided');
  });

  it('sends to multiple recipients for admin notification templates', async () => {
    await service.sendEmail(
      ['a@x.com', 'b@x.com'],
      EmailStructure.SUPER_ADMIN_NOTIFICATION,
      { content: 'hello admins' },
    );

    const payload = sendMock.mock.calls[0][0];
    expect(payload.to).toEqual(['a@x.com', 'b@x.com']);
    expect(payload.subject).toBe(
      EMAIL_SUBJECTS[EmailStructure.SUPER_ADMIN_NOTIFICATION],
    );
  });

  it('throws when required params are missing for a parameterized template', async () => {
    await expect(
      service.sendEmail(
        ['a@x.com'],
        EmailStructure.SUPER_ADMIN_NOTIFICATION,
        {} as any,
      ),
    ).rejects.toThrow(
      'Content is required for SUPER_ADMIN_NOTIFICATION template',
    );
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('throws for an unknown email structure', async () => {
    await expect(
      service.sendEmail('a@x.com', 'notARealStructure' as any),
    ).rejects.toThrow('Unknown email structure: notARealStructure');
  });

  describe('client-facing emails gated by company notification settings', () => {
    it('skips sending when the email type is disabled for the company', async () => {
      companiesRepositoryMock.findOne.mockResolvedValue({
        data: {
          id: 1,
          notifications: {
            emails: { [EmailStructure.PAYMENT_RECEIVED]: false },
          },
        },
        error: null,
      } as any);

      await service.sendEmail(
        'client@x.com',
        EmailStructure.PAYMENT_RECEIVED,
        { amount: 100 } as any,
        1,
      );

      expect(companiesRepositoryMock.findOne).toHaveBeenCalledWith(1);
      expect(sendMock).not.toHaveBeenCalled();
    });

    it('skips sending when the company has no email notifications configured', async () => {
      companiesRepositoryMock.findOne.mockResolvedValue({
        data: { id: 1, notifications: null },
        error: null,
      } as any);

      await service.sendEmail(
        'client@x.com',
        EmailStructure.PAYMENT_RECEIVED,
        { amount: 100 } as any,
        1,
      );

      expect(sendMock).not.toHaveBeenCalled();
    });

    it('sends when the email type is enabled for the company', async () => {
      companiesRepositoryMock.findOne.mockResolvedValue({
        data: {
          id: 1,
          notifications: {
            emails: { [EmailStructure.NEW_PUBLIC_QUOTATION_CLIENT]: true },
          },
        },
        error: null,
      } as any);

      await service.sendEmail(
        'client@x.com',
        EmailStructure.NEW_PUBLIC_QUOTATION_CLIENT,
        1,
      );

      expect(sendMock).toHaveBeenCalledTimes(1);
      const payload = sendMock.mock.calls[0][0];
      expect(payload.to).toEqual(['client@x.com']);
    });

    it('skips sending when the company lookup returns an error', async () => {
      companiesRepositoryMock.findOne.mockResolvedValue({
        data: null,
        error: { message: 'db down' },
      } as any);

      await service.sendEmail(
        'client@x.com',
        EmailStructure.PAYMENT_RECEIVED,
        { amount: 100 } as any,
        1,
      );

      expect(sendMock).not.toHaveBeenCalled();
    });
  });

  it('propagates errors thrown by the Resend client', async () => {
    sendMock.mockRejectedValue(new Error('resend failure'));

    await expect(
      service.sendEmail('user@x.com', EmailStructure.NEW_ACCOUNT),
    ).rejects.toThrow('resend failure');
  });
});
