import { Test, TestingModule } from '@nestjs/testing';
import { PinoLogger } from 'nestjs-pino';
import { CustomerSatisfactionSurveyController } from '../controller';
import { CustomerSatisfactionSurveyService } from '../service';

describe('CustomerSatisfactionSurveyController', () => {
  let controller: CustomerSatisfactionSurveyController;
  let serviceMock: jest.Mocked<CustomerSatisfactionSurveyService>;
  let loggerMock: jest.Mocked<PinoLogger>;

  const user = { id: 10, company_id: 1 } as any;

  beforeEach(async () => {
    serviceMock = {
      createTemplate: jest.fn(),
      getTemplate: jest.fn(),
      createAnswer: jest.fn(),
      findAllAnswersFromCompany: jest.fn(),
    } as any;

    loggerMock = {
      info: jest.fn(),
      error: jest.fn(),
      setContext: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CustomerSatisfactionSurveyController],
      providers: [
        { provide: CustomerSatisfactionSurveyService, useValue: serviceMock },
        { provide: PinoLogger, useValue: loggerMock },
      ],
    }).compile();

    controller = module.get<CustomerSatisfactionSurveyController>(
      CustomerSatisfactionSurveyController,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('createTemplate forwards the companyId query param', () => {
    controller.createTemplate(3 as any);
    expect(serviceMock.createTemplate).toHaveBeenCalledWith(3);
  });

  it('getTemplate forwards the companyId query param', () => {
    controller.getTemplate(4 as any);
    expect(serviceMock.getTemplate).toHaveBeenCalledWith(4);
  });

  it('createAnswer forwards the dto', () => {
    const dto = { quotationId: 'q1', answers: [] } as any;
    controller.createAnswer(dto);
    expect(serviceMock.createAnswer).toHaveBeenCalledWith(dto);
  });

  it('findAllAnswersFromCompany forwards the user company id', () => {
    controller.findAllAnswersFromCompany(user);
    expect(serviceMock.findAllAnswersFromCompany).toHaveBeenCalledWith(
      user.company_id,
    );
  });
});
