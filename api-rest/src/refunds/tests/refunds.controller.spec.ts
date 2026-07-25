import { Test, TestingModule } from '@nestjs/testing';
import { PinoLogger } from 'nestjs-pino';
import { RefundsController } from '../refunds.controller';
import { RefundsService } from '../refunds.service';

describe('RefundsController', () => {
  let controller: RefundsController;
  let serviceMock: jest.Mocked<RefundsService>;
  let loggerMock: jest.Mocked<PinoLogger>;

  const user = { id: 10, company_id: 1 } as any;

  beforeEach(async () => {
    serviceMock = {
      create: jest.fn(),
      findAll: jest.fn(),
    } as any;

    loggerMock = {
      info: jest.fn(),
      error: jest.fn(),
      setContext: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [RefundsController],
      providers: [
        { provide: RefundsService, useValue: serviceMock },
        { provide: PinoLogger, useValue: loggerMock },
      ],
    }).compile();

    controller = module.get<RefundsController>(RefundsController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('findAll forwards the user company id to the service', () => {
    controller.findAll(user);
    expect(serviceMock.findAll).toHaveBeenCalledWith(user.company_id);
  });

  it('findAll returns whatever the service resolves', () => {
    const expected = [{ id: 1 }] as any;
    serviceMock.findAll.mockReturnValue(expected);

    const result = controller.findAll(user);

    expect(result).toBe(expected);
  });
});
