import { Test, TestingModule } from '@nestjs/testing';
import { PinoLogger } from 'nestjs-pino';
import { QuotationsService } from 'src/quotations/quotations.service';
import { CalendarService } from '../calendar.service';

describe('CalendarService', () => {
  let service: CalendarService;
  let quotationsServiceMock: jest.Mocked<QuotationsService>;
  let loggerMock: jest.Mocked<PinoLogger>;

  const companyId = 1;

  beforeEach(async () => {
    quotationsServiceMock = {
      findAll: jest.fn(),
    } as any;

    loggerMock = {
      info: jest.fn(),
      error: jest.fn(),
      setContext: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CalendarService,
        { provide: QuotationsService, useValue: quotationsServiceMock },
        { provide: PinoLogger, useValue: loggerMock },
      ],
    }).compile();

    service = module.get<CalendarService>(CalendarService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAllEvents()', () => {
    it('scopes the quotations lookup to the company id', async () => {
      quotationsServiceMock.findAll.mockResolvedValue([] as any);

      await service.findAllEvents(companyId);

      expect(quotationsServiceMock.findAll).toHaveBeenCalledWith({ companyId });
    });

    it('aggregates the quotations into the events response', async () => {
      const quotations = [{ id: 1 }, { id: 2 }] as any;
      quotationsServiceMock.findAll.mockResolvedValue(quotations);

      const result = await service.findAllEvents(companyId);

      expect(result).toEqual({ quotations });
    });

    it('throws when the quotations lookup rejects', async () => {
      quotationsServiceMock.findAll.mockRejectedValue(new Error('boom'));

      await expect(service.findAllEvents(companyId)).rejects.toThrow('boom');
    });
  });
});
