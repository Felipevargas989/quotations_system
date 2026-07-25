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
      reorderServicesInCategory: jest.fn(),
      reorderCategories: jest.fn(),
      createCategoryForCompany: jest.fn(),
      renameOrUpdateCategory: jest.fn(),
      deleteCategoryForCompany: jest.fn(),
      setServiceCategories: jest.fn(),
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

  it('reorderServicesInCategory forwards company id, category id and service ids', () => {
    const dto = { category_id: 2, service_ids: [3, 1] } as any;
    controller.reorderServicesInCategory(dto, user);
    expect(serviceMock.reorderServicesInCategory).toHaveBeenCalledWith(
      user.company_id,
      2,
      [3, 1],
    );
  });

  it('reorderCategories forwards company id and category ids', () => {
    const dto = { category_ids: [5, 2] } as any;
    controller.reorderCategories(dto, user);
    expect(serviceMock.reorderCategories).toHaveBeenCalledWith(
      user.company_id,
      [5, 2],
    );
  });

  it('createCategory forwards company id and the category name', () => {
    controller.createCategory({ name: 'Nueva' } as any, user);
    expect(serviceMock.createCategoryForCompany).toHaveBeenCalledWith(
      user.company_id,
      'Nueva',
    );
  });

  it('updateCategoryById coerces the id and forwards the dto', () => {
    const dto = { name: 'X', is_active: false } as any;
    controller.updateCategoryById('7', dto, user);
    expect(serviceMock.renameOrUpdateCategory).toHaveBeenCalledWith(
      user.company_id,
      7,
      dto,
    );
  });

  it('deleteCategoryById coerces the id and forwards the company id', () => {
    controller.deleteCategoryById('8', user);
    expect(serviceMock.deleteCategoryForCompany).toHaveBeenCalledWith(
      user.company_id,
      8,
    );
  });

  it('setServiceCategories coerces the id and forwards the category ids', () => {
    controller.setServiceCategories('4' as any, { category_ids: [1, 2] }, user);
    expect(serviceMock.setServiceCategories).toHaveBeenCalledWith(
      user.company_id,
      4,
      [1, 2],
    );
  });

  it('updateVariableService forwards the id, dto and user company id', () => {
    const dto = { name: 'x', category_ids: [1] } as any;
    controller.updateVariableService(3, dto, user);
    expect(serviceMock.updateVariableService).toHaveBeenCalledWith(
      3,
      dto,
      user.company_id,
    );
  });

  it('updateFixedService forwards the id and dto', () => {
    const dto = { name: 'x', calculation_type: CalculationType.FIJO } as any;
    controller.updateFixedService(4, dto);
    expect(serviceMock.updateFixedService).toHaveBeenCalledWith(4, dto);
  });

  it('createVariableService forwards the dto and user company id', () => {
    const dto = { name: 'v', category_ids: [1] } as any;
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
