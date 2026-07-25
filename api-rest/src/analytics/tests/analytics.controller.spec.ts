import { Test, TestingModule } from '@nestjs/testing';
import { PinoLogger } from 'nestjs-pino';
import { AnalyticsController } from '../analytics.controller';
import { AnalyticsService } from '../analytics.service';

describe('AnalyticsController', () => {
  let controller: AnalyticsController;
  let serviceMock: jest.Mocked<AnalyticsService>;
  let loggerMock: jest.Mocked<PinoLogger>;

  const user = { id: 10, company_id: 1 } as any;

  beforeEach(async () => {
    serviceMock = {
      getDashboardStats: jest.fn(),
      getCompleteStats: jest.fn(),
    } as any;

    loggerMock = {
      info: jest.fn(),
      error: jest.fn(),
      setContext: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AnalyticsController],
      providers: [
        { provide: AnalyticsService, useValue: serviceMock },
        { provide: PinoLogger, useValue: loggerMock },
      ],
    }).compile();

    controller = module.get<AnalyticsController>(AnalyticsController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('getDashboardStats forwards the user company id and the date range', () => {
    const dto = {
      start_date: new Date('2025-01-01'),
      end_date: new Date('2025-02-01'),
    } as any;

    controller.getDashboardStats(user, dto);

    expect(serviceMock.getDashboardStats).toHaveBeenCalledWith(
      user.company_id,
      {
        start_date: dto.start_date,
        end_date: dto.end_date,
      },
    );
  });

  it('getCompleteStats forwards the user company id and the dto', () => {
    const dto = { start_date: new Date('2025-01-01') } as any;

    controller.getCompleteStats(user, dto);

    expect(serviceMock.getCompleteStats).toHaveBeenCalledWith(
      user.company_id,
      dto,
    );
  });
});
