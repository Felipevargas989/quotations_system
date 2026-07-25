import { Test, TestingModule } from '@nestjs/testing';
import { PinoLogger } from 'nestjs-pino';
import { ServiceGroupsController } from '../service-groups.controller';
import { ServiceGroupsService } from '../service-groups.service';

describe('ServiceGroupsController', () => {
  let controller: ServiceGroupsController;
  let serviceMock: jest.Mocked<ServiceGroupsService>;
  let loggerMock: jest.Mocked<PinoLogger>;

  const user = { id: 10, company_id: 1 } as any;

  beforeEach(async () => {
    serviceMock = {
      create: jest.fn(),
      findAll: jest.fn(),
      remove: jest.fn(),
    } as any;

    loggerMock = {
      info: jest.fn(),
      error: jest.fn(),
      setContext: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ServiceGroupsController],
      providers: [
        { provide: ServiceGroupsService, useValue: serviceMock },
        { provide: PinoLogger, useValue: loggerMock },
      ],
    }).compile();

    controller = module.get<ServiceGroupsController>(ServiceGroupsController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('create forwards the dto and the user company id', () => {
    const dto = { name: 'g', category: 'c', items: [] } as any;
    controller.create(dto, user);
    expect(serviceMock.create).toHaveBeenCalledWith(dto, user.company_id);
  });

  it('findAll forwards the user company id', () => {
    controller.findAll(user);
    expect(serviceMock.findAll).toHaveBeenCalledWith(user.company_id);
  });

  it('remove coerces the id to a number', () => {
    controller.remove('8' as any);
    expect(serviceMock.remove).toHaveBeenCalledWith(8);
  });
});
