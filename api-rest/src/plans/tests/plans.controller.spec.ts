import { Test, TestingModule } from '@nestjs/testing';
import { PinoLogger } from 'nestjs-pino';
import { PlansController } from '../plans.controller';
import { PlansService } from '../plans.service';

describe('PlansController', () => {
  let controller: PlansController;
  let serviceMock: jest.Mocked<PlansService>;
  let loggerMock: jest.Mocked<PinoLogger>;

  const user = { id: 10, company_id: 1 } as any;

  beforeEach(async () => {
    serviceMock = {
      confirmPlan: jest.fn(),
    } as any;

    loggerMock = {
      info: jest.fn(),
      error: jest.fn(),
      setContext: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PlansController],
      providers: [
        { provide: PlansService, useValue: serviceMock },
        { provide: PinoLogger, useValue: loggerMock },
      ],
    }).compile();

    controller = module.get<PlansController>(PlansController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('confirmPlan forwards the user company id to the service', () => {
    controller.confirmPlan(user);
    expect(serviceMock.confirmPlan).toHaveBeenCalledWith(user.company_id);
  });

  it('confirmPlan returns the service result', () => {
    const expected = { data: { id: 1 } } as any;
    serviceMock.confirmPlan.mockReturnValue(expected);

    expect(controller.confirmPlan(user)).toBe(expected);
  });
});
