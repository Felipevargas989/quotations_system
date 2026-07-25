import { Test, TestingModule } from '@nestjs/testing';
import { PinoLogger } from 'nestjs-pino';
import { EmailService } from 'src/email/email.service';
import { EmailStructure } from 'src/email/types';
import { UserRole } from 'src/users/entities/user.entity';
import { UsersService } from 'src/users/users.service';
// QuotationsService is imported after UsersService/EmailService to avoid a
// circular-import ordering issue that would leave its token undefined.
import { QuotationsService } from 'src/quotations/quotations.service';
import { CUSTOMER_SATISFACTION_SURVEY_QUESTIONS } from '../constants/questions';
import { CustomerSatisfactionSurveyRepository } from '../repository';
import { CustomerSatisfactionSurveyService } from '../service';

describe('CustomerSatisfactionSurveyService', () => {
  let service: CustomerSatisfactionSurveyService;
  let repositoryMock: jest.Mocked<CustomerSatisfactionSurveyRepository>;
  let quotationsServiceMock: jest.Mocked<QuotationsService>;
  let usersServiceMock: jest.Mocked<UsersService>;
  let emailServiceMock: jest.Mocked<EmailService>;
  let loggerMock: jest.Mocked<PinoLogger>;

  const companyId = 1;

  beforeEach(async () => {
    repositoryMock = {
      createTemplate: jest.fn(),
      createAnswer: jest.fn(),
      getTemplate: jest.fn(),
      findAllAnswersFromCompany: jest.fn(),
    } as any;

    quotationsServiceMock = {
      findOne: jest.fn(),
    } as any;

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
        CustomerSatisfactionSurveyService,
        {
          provide: CustomerSatisfactionSurveyRepository,
          useValue: repositoryMock,
        },
        { provide: QuotationsService, useValue: quotationsServiceMock },
        { provide: UsersService, useValue: usersServiceMock },
        { provide: EmailService, useValue: emailServiceMock },
        { provide: PinoLogger, useValue: loggerMock },
      ],
    }).compile();

    service = module.get<CustomerSatisfactionSurveyService>(
      CustomerSatisfactionSurveyService,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createTemplate()', () => {
    it('creates a template with the default questions and returns the data', async () => {
      repositoryMock.createTemplate.mockResolvedValue({
        data: { id: 5 },
        error: null,
      } as any);

      const result = await service.createTemplate(companyId);

      expect(repositoryMock.createTemplate).toHaveBeenCalledWith(
        companyId,
        CUSTOMER_SATISFACTION_SURVEY_QUESTIONS,
      );
      expect(result).toEqual({ id: 5 });
    });

    it('throws when the repository returns an error', async () => {
      repositoryMock.createTemplate.mockResolvedValue({
        data: null,
        error: { message: 'boom' },
      } as any);

      await expect(service.createTemplate(companyId)).rejects.toThrow(
        'Failed to create template: boom',
      );
    });
  });

  describe('getTemplate()', () => {
    it('returns the template data from the repository', async () => {
      repositoryMock.getTemplate.mockResolvedValue({
        data: { id: 9 },
        error: null,
      } as any);

      const result = await service.getTemplate(companyId);

      expect(repositoryMock.getTemplate).toHaveBeenCalledWith(companyId);
      expect(result).toEqual({ id: 9 });
    });

    it('throws when the repository returns an error', async () => {
      repositoryMock.getTemplate.mockResolvedValue({
        data: null,
        error: { message: 'no template' },
      } as any);

      await expect(service.getTemplate(companyId)).rejects.toThrow(
        'Failed to get template: no template',
      );
    });
  });

  describe('findAllAnswersFromCompany()', () => {
    it('returns the answers data from the repository', async () => {
      repositoryMock.findAllAnswersFromCompany.mockResolvedValue({
        data: [{ id: 1 }],
        error: null,
      } as any);

      const result = await service.findAllAnswersFromCompany(companyId);

      expect(repositoryMock.findAllAnswersFromCompany).toHaveBeenCalledWith(
        companyId,
      );
      expect(result).toEqual([{ id: 1 }]);
    });

    it('throws when the repository returns an error', async () => {
      repositoryMock.findAllAnswersFromCompany.mockResolvedValue({
        data: null,
        error: { message: 'boom' },
      } as any);

      await expect(
        service.findAllAnswersFromCompany(companyId),
      ).rejects.toThrow('Failed to find all: boom');
    });
  });

  describe('createAnswer()', () => {
    const dto = {
      quotationId: 'quote-1',
      answers: [{ id: 1, answer: '5' }],
    } as any;

    it('resolves the company from the quotation, persists the answer and notifies admins', async () => {
      quotationsServiceMock.findOne.mockResolvedValue({
        data: { id: 42, company_id: companyId },
        error: null,
      } as any);
      repositoryMock.getTemplate.mockResolvedValue({
        data: { id: 7 },
        error: null,
      } as any);
      repositoryMock.createAnswer.mockResolvedValue({
        data: { id: 100 },
        error: null,
      } as any);
      usersServiceMock.findAll.mockResolvedValue([
        { email: 'admin@x.com' },
      ] as any);

      const result = await service.createAnswer(dto);

      expect(quotationsServiceMock.findOne).toHaveBeenCalledWith(
        dto.quotationId,
      );
      expect(repositoryMock.getTemplate).toHaveBeenCalledWith(companyId);
      expect(repositoryMock.createAnswer).toHaveBeenCalledWith(
        42,
        7,
        dto.answers,
      );
      expect(usersServiceMock.findAll).toHaveBeenCalledWith(
        companyId,
        UserRole.ADMINISTRADOR,
      );
      expect(emailServiceMock.sendEmail).toHaveBeenCalledWith(
        ['admin@x.com'],
        EmailStructure.NEW_ANSWER_CUSTOMER_SATISFACTION_SURVEY,
        { templateId: 7, answers: dto.answers },
      );
      expect(result).toEqual({ id: 100 });
    });

    it('throws when the quotation lookup returns an error', async () => {
      quotationsServiceMock.findOne.mockResolvedValue({
        data: null,
        error: { message: 'db error' },
      } as any);

      await expect(service.createAnswer(dto)).rejects.toThrow(
        'Failed to get quotation: db error',
      );
      expect(repositoryMock.createAnswer).not.toHaveBeenCalled();
    });

    it('throws when the quotation is not found', async () => {
      quotationsServiceMock.findOne.mockResolvedValue({
        data: null,
        error: null,
      } as any);

      await expect(service.createAnswer(dto)).rejects.toThrow(
        'Quotation not found',
      );
    });

    it('throws when the template lookup returns an error', async () => {
      quotationsServiceMock.findOne.mockResolvedValue({
        data: { id: 42, company_id: companyId },
        error: null,
      } as any);
      repositoryMock.getTemplate.mockResolvedValue({
        data: null,
        error: { message: 'no template' },
      } as any);

      await expect(service.createAnswer(dto)).rejects.toThrow(
        'Failed to get template: no template',
      );
    });

    it('throws when the template is not found', async () => {
      quotationsServiceMock.findOne.mockResolvedValue({
        data: { id: 42, company_id: companyId },
        error: null,
      } as any);
      repositoryMock.getTemplate.mockResolvedValue({
        data: null,
        error: null,
      } as any);

      await expect(service.createAnswer(dto)).rejects.toThrow(
        'Template not found',
      );
    });

    it('throws when persisting the answer returns an error', async () => {
      quotationsServiceMock.findOne.mockResolvedValue({
        data: { id: 42, company_id: companyId },
        error: null,
      } as any);
      repositoryMock.getTemplate.mockResolvedValue({
        data: { id: 7 },
        error: null,
      } as any);
      repositoryMock.createAnswer.mockResolvedValue({
        data: null,
        error: { message: 'insert failed' },
      } as any);

      await expect(service.createAnswer(dto)).rejects.toThrow(
        'Failed to create answer: insert failed',
      );
    });

    it('still returns the answer when the admin notification email fails', async () => {
      quotationsServiceMock.findOne.mockResolvedValue({
        data: { id: 42, company_id: companyId },
        error: null,
      } as any);
      repositoryMock.getTemplate.mockResolvedValue({
        data: { id: 7 },
        error: null,
      } as any);
      repositoryMock.createAnswer.mockResolvedValue({
        data: { id: 100 },
        error: null,
      } as any);
      usersServiceMock.findAll.mockRejectedValue(new Error('no admins'));

      const result = await service.createAnswer(dto);

      expect(result).toEqual({ id: 100 });
      expect(emailServiceMock.sendEmail).not.toHaveBeenCalled();
    });
  });
});
