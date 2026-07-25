import { Test, TestingModule } from '@nestjs/testing';
import { PinoLogger } from 'nestjs-pino';
import { CalendarController } from '../calendar.controller';
import { CalendarService } from '../calendar.service';

describe('CalendarController', () => {
  let controller: CalendarController;
  let serviceMock: jest.Mocked<CalendarService>;
  let loggerMock: jest.Mocked<PinoLogger>;

  const user = { id: 10, company_id: 1 } as any;

  beforeEach(async () => {
    serviceMock = {
      findAllEvents: jest.fn(),
    } as any;

    loggerMock = {
      info: jest.fn(),
      error: jest.fn(),
      setContext: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CalendarController],
      providers: [
        { provide: CalendarService, useValue: serviceMock },
        { provide: PinoLogger, useValue: loggerMock },
      ],
    }).compile();

    controller = module.get<CalendarController>(CalendarController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('findAllEvents forwards the user company id', () => {
    controller.findAllEvents(user);
    expect(serviceMock.findAllEvents).toHaveBeenCalledWith(user.company_id);
  });

  it('findAllEvents returns whatever the service resolves', async () => {
    const events = { quotations: [{ id: 1 }] } as any;
    serviceMock.findAllEvents.mockResolvedValue(events);

    await expect(controller.findAllEvents(user)).resolves.toEqual(events);
  });
});
