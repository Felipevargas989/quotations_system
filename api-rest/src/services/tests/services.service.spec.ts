import { HttpException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PinoLogger } from 'nestjs-pino';
import { CalculationType } from '../constants';
import { CreateFixedServiceDto } from '../dto/create-fixed-service.dto';
import { CreateServicesBulkDto } from '../dto/create-services-bulk.dto';
import { CreateVariableServiceDto } from '../dto/create-variable-service.dto';
import { ServicesRepository } from '../services.repository';
import { ServicesService } from '../services.service';

describe('ServicesService', () => {
  let service: ServicesService;
  let repositoryMock: jest.Mocked<ServicesRepository>;
  let loggerMock: jest.Mocked<PinoLogger>;

  const companyId = 1;

  beforeEach(async () => {
    repositoryMock = {
      createVariableServices: jest.fn(),
      createFixedServices: jest.fn(),
      createVariableService: jest.fn(),
      createFixedService: jest.fn(),
      findAllVariableServices: jest.fn(),
      findAllFixedServices: jest.fn(),
      findAllServiceCategories: jest.fn(),
      updateVariableService: jest.fn(),
      updateFixedService: jest.fn(),
      upsertServiceCategory: jest.fn(),
      removeVariableService: jest.fn(),
      removeFixedService: jest.fn(),
    } as any;

    loggerMock = {
      info: jest.fn(),
      error: jest.fn(),
      setContext: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ServicesService,
        { provide: ServicesRepository, useValue: repositoryMock },
        { provide: PinoLogger, useValue: loggerMock },
      ],
    }).compile();

    service = module.get<ServicesService>(ServicesService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createServicesBulk()', () => {
    it('scopes services to the company and persists both variable and fixed services', async () => {
      const dto: CreateServicesBulkDto = {
        variable_services: [
          { name: 'Var', price: 10, category: 'cat', code: 'v1' } as any,
        ],
        fixed_services: [
          {
            name: 'Fixed',
            calculation_type: CalculationType.FIJO,
            price: 20,
            code: 'f1',
          } as any,
        ],
      };

      const result = await service.createServicesBulk(dto, companyId);

      expect(repositoryMock.createVariableServices).toHaveBeenCalledWith([
        { ...dto.variable_services[0], company_id: companyId },
      ]);
      expect(repositoryMock.createFixedServices).toHaveBeenCalledWith([
        { ...dto.fixed_services[0], company_id: companyId },
      ]);
      expect(result.variableServices[0].company_id).toBe(companyId);
      expect(result.fixedServices[0].company_id).toBe(companyId);
    });

    it('throws when a fixed service fails validation (FIJO without price)', async () => {
      const dto: CreateServicesBulkDto = {
        variable_services: [],
        fixed_services: [
          {
            name: 'Bad',
            calculation_type: CalculationType.FIJO,
            price: null,
          } as any,
        ],
      };

      await expect(
        service.createServicesBulk(dto, companyId),
      ).rejects.toThrow();
      expect(repositoryMock.createFixedServices).not.toHaveBeenCalled();
    });
  });

  describe('findAll()', () => {
    it('returns the data arrays from every repository lookup', async () => {
      repositoryMock.findAllVariableServices.mockResolvedValue({
        data: [{ id: 1 }],
      } as any);
      repositoryMock.findAllFixedServices.mockResolvedValue({
        data: [{ id: 2 }],
      } as any);
      repositoryMock.findAllServiceCategories.mockResolvedValue({
        data: [{ id: 3 }],
      } as any);

      const result = await service.findAll(companyId);

      expect(result).toEqual({
        variableServices: [{ id: 1 }],
        fixedServices: [{ id: 2 }],
        categories: [{ id: 3 }],
      });
      expect(repositoryMock.findAllVariableServices).toHaveBeenCalledWith(
        companyId,
      );
    });

    it('throws when a repository lookup rejects', async () => {
      repositoryMock.findAllVariableServices.mockRejectedValue(
        new Error('boom'),
      );

      await expect(service.findAll(companyId)).rejects.toThrow();
    });
  });

  describe('createVariableService()', () => {
    it('adds the company_id before delegating to the repository', async () => {
      const dto: CreateVariableServiceDto = {
        name: 'Var',
        price: 10,
        category: 'cat',
        code: 'v1',
      } as any;
      repositoryMock.createVariableService.mockResolvedValue({
        data: { id: 1 },
      } as any);

      await service.createVariableService(dto, companyId);

      expect(repositoryMock.createVariableService).toHaveBeenCalledWith({
        ...dto,
        company_id: companyId,
      });
    });
  });

  describe('createFixedService()', () => {
    it('validates, scopes to company and delegates to the repository', async () => {
      const dto: CreateFixedServiceDto = {
        name: 'Fixed',
        calculation_type: CalculationType.FIJO,
        price: 20,
        code: 'f1',
      } as any;
      repositoryMock.createFixedService.mockResolvedValue({
        data: { id: 1 },
      } as any);

      await service.createFixedService(dto, companyId);

      expect(repositoryMock.createFixedService).toHaveBeenCalledWith({
        ...dto,
        company_id: companyId,
      });
    });

    it('throws an HttpException when validation fails', async () => {
      const dto: CreateFixedServiceDto = {
        name: 'Bad',
        calculation_type: CalculationType.VARIABLE_CON_LIMITES,
        min_price: 50,
        max_price: 10,
      } as any;

      await expect(
        service.createFixedService(dto, companyId),
      ).rejects.toBeInstanceOf(HttpException);
      expect(repositoryMock.createFixedService).not.toHaveBeenCalled();
    });
  });

  describe('updateServiceCategory()', () => {
    it('upserts the category using the dto name and activation flag', async () => {
      repositoryMock.upsertServiceCategory.mockResolvedValue({
        data: { id: 1 },
      } as any);

      await service.updateServiceCategory(companyId, {
        name: 'cat',
        is_active: false,
      });

      expect(repositoryMock.upsertServiceCategory).toHaveBeenCalledWith(
        companyId,
        'cat',
        false,
      );
    });
  });

  describe('remove methods', () => {
    it('removeVariableService delegates to the repository', async () => {
      await service.removeVariableService(5);
      expect(repositoryMock.removeVariableService).toHaveBeenCalledWith(5);
    });

    it('removeFixedService delegates to the repository', async () => {
      await service.removeFixedService(7);
      expect(repositoryMock.removeFixedService).toHaveBeenCalledWith(7);
    });
  });
});
