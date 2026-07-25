import { Test, TestingModule } from '@nestjs/testing';
import { PinoLogger } from 'nestjs-pino';
import { CalculationType } from '../constants';
import { ServicesController } from '../services.controller';
import { ServicesService } from '../services.service';

describe('ServicesController', () => {
  let controller: ServicesController;
  let serviceMock: jest.Mocked<ServicesService>;
  let loggerMock: jest.Mocked<PinoLogger>;

  const user = { id: 10, company_id: 1 } as any;

  beforeEach(async () => {
    serviceMock = {
      createServicesBulk: jest.fn(),
      findAll: jest.fn(),
      updateServiceCategory: jest.fn(),
      updateVariableService: jest.fn(),
      updateFixedService: jest.fn(),
      createVariableService: jest.fn(),
      createFixedService: jest.fn(),
      removeVariableService: jest.fn(),
      removeFixedService: jest.fn(),
    } as any;

    loggerMock = {
      info: jest.fn(),
      error: jest.fn(),
      setContext: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ServicesController],
      providers: [
        { provide: ServicesService, useValue: serviceMock },
        { provide: PinoLogger, useValue: loggerMock },
      ],
    }).compile();

    controller = module.get<ServicesController>(ServicesController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('createServicesBulk forwards the dto and the user company id', () => {
    const dto = { variable_services: [], fixed_services: [] } as any;
    controller.createServicesBulk(dto, user);
    expect(serviceMock.createServicesBulk).toHaveBeenCalledWith(
      dto,
      user.company_id,
    );
  });

  it('findAll forwards the user company id', () => {
    controller.findAll(user);
    expect(serviceMock.findAll).toHaveBeenCalledWith(user.company_id);
  });

  it('updateServiceCategory forwards the company id and dto', () => {
    const dto = { name: 'cat', is_active: true } as any;
    controller.updateServiceCategory(dto, user);
    expect(serviceMock.updateServiceCategory).toHaveBeenCalledWith(
      user.company_id,
      dto,
    );
  });

  it('updateVariableService forwards the id and dto', () => {
    const dto = { name: 'x' } as any;
    controller.updateVariableService(3, dto);
    expect(serviceMock.updateVariableService).toHaveBeenCalledWith(3, dto);
  });

  it('updateFixedService forwards the id and dto', () => {
    const dto = { name: 'x', calculation_type: CalculationType.FIJO } as any;
    controller.updateFixedService(4, dto);
    expect(serviceMock.updateFixedService).toHaveBeenCalledWith(4, dto);
  });

  it('createVariableService forwards the dto and user company id', () => {
    const dto = { name: 'v' } as any;
    controller.createVariableService(dto, user);
    expect(serviceMock.createVariableService).toHaveBeenCalledWith(
      dto,
      user.company_id,
    );
  });

  it('createFixedService forwards the dto and user company id', () => {
    const dto = { name: 'f', calculation_type: CalculationType.FIJO } as any;
    controller.createFixedService(dto, user);
    expect(serviceMock.createFixedService).toHaveBeenCalledWith(
      dto,
      user.company_id,
    );
  });

  it('removeVariableService coerces the id to a number', () => {
    controller.removeVariableService('8' as any);
    expect(serviceMock.removeVariableService).toHaveBeenCalledWith(8);
  });

  it('removeFixedService coerces the id to a number', () => {
    controller.removeFixedService('9' as any);
    expect(serviceMock.removeFixedService).toHaveBeenCalledWith(9);
  });
});
