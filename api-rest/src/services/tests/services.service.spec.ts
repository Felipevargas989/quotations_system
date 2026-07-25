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
      // services
      createVariableServices: jest.fn(),
      createFixedServices: jest.fn(),
      createVariableService: jest.fn(),
      createFixedService: jest.fn(),
      findAllVariableServices: jest.fn(),
      findAllFixedServices: jest.fn(),
      updateVariableService: jest.fn(),
      updateFixedService: jest.fn(),
      removeVariableService: jest.fn(),
      removeFixedService: jest.fn(),
      // categories (legacy activation)
      findAllServiceCategories: jest.fn(),
      upsertServiceCategory: jest.fn(),
      // multi-category links
      findAllServiceCategoryLinks: jest.fn(),
      getLinksForService: jest.fn(),
      getMaxServiceSortOrder: jest.fn(),
      insertServiceCategoryLink: jest.fn(),
      deleteServiceCategoryLink: jest.fn(),
      updateLinkSortOrder: jest.fn(),
      // category management
      findCategoryByName: jest.fn(),
      getMaxCategorySortOrder: jest.fn(),
      createCategory: jest.fn(),
      updateCategory: jest.fn(),
      deleteCategory: jest.fn(),
      getServicesOnlyInCategory: jest.fn(),
    } as any;

    // Sensible defaults so the link/category helpers don't blow up.
    repositoryMock.findAllServiceCategories.mockResolvedValue({
      data: [],
    } as any);
    repositoryMock.getLinksForService.mockResolvedValue({ data: [] } as any);
    repositoryMock.getMaxServiceSortOrder.mockResolvedValue(0 as any);
    repositoryMock.getMaxCategorySortOrder.mockResolvedValue(0 as any);
    repositoryMock.insertServiceCategoryLink.mockResolvedValue(
      undefined as any,
    );
    repositoryMock.deleteServiceCategoryLink.mockResolvedValue(
      undefined as any,
    );
    repositoryMock.updateLinkSortOrder.mockResolvedValue(undefined as any);
    repositoryMock.updateCategory.mockResolvedValue({ data: {} } as any);
    repositoryMock.createVariableService.mockResolvedValue({
      data: { id: 1 },
    } as any);

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
    it('returns variable/fixed services, categories AND the multi-category links', async () => {
      repositoryMock.findAllVariableServices.mockResolvedValue({
        data: [{ id: 1 }],
      } as any);
      repositoryMock.findAllFixedServices.mockResolvedValue({
        data: [{ id: 2 }],
      } as any);
      repositoryMock.findAllServiceCategories.mockResolvedValue({
        data: [{ id: 3 }],
      } as any);
      repositoryMock.findAllServiceCategoryLinks.mockResolvedValue({
        data: [{ variable_service_id: 1, category_id: 3 }],
      } as any);

      const result = await service.findAll(companyId);

      expect(result).toEqual({
        variableServices: [{ id: 1 }],
        fixedServices: [{ id: 2 }],
        categories: [{ id: 3 }],
        categoryLinks: [{ variable_service_id: 1, category_id: 3 }],
      });
      expect(repositoryMock.findAllServiceCategoryLinks).toHaveBeenCalledWith(
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
    it('links the given category_ids, populates the legacy category name and creates the service', async () => {
      const dto: CreateVariableServiceDto = {
        name: 'Var',
        price: 10,
        code: 'v1',
        category_ids: [10, 20],
      } as any;
      repositoryMock.findAllServiceCategories.mockResolvedValue({
        data: [
          { id: 10, name: 'Cat10' },
          { id: 20, name: 'Cat20' },
        ],
      } as any);
      repositoryMock.createVariableService.mockResolvedValue({
        data: { id: 99 },
      } as any);

      await service.createVariableService(dto, companyId);

      // legacy category text is the first resolved category name
      expect(repositoryMock.createVariableService).toHaveBeenCalledWith({
        name: 'Var',
        price: 10,
        code: 'v1',
        category: 'Cat10',
        company_id: companyId,
      });
      // both categories are linked to the new service
      expect(repositoryMock.insertServiceCategoryLink).toHaveBeenCalledWith(
        companyId,
        99,
        10,
        1,
      );
      expect(repositoryMock.insertServiceCategoryLink).toHaveBeenCalledWith(
        companyId,
        99,
        20,
        1,
      );
    });

    it('find-or-creates a category when only the legacy name is given', async () => {
      const dto: CreateVariableServiceDto = {
        name: 'Var',
        price: 10,
        category: 'Nueva',
      } as any;
      // no existing category with that name
      repositoryMock.findCategoryByName.mockResolvedValue({ data: [] } as any);
      repositoryMock.getMaxCategorySortOrder.mockResolvedValue(2 as any);
      repositoryMock.createCategory.mockResolvedValue({
        data: { id: 30, name: 'Nueva' },
      } as any);
      repositoryMock.findAllServiceCategories.mockResolvedValue({
        data: [{ id: 30, name: 'Nueva' }],
      } as any);
      repositoryMock.createVariableService.mockResolvedValue({
        data: { id: 77 },
      } as any);

      await service.createVariableService(dto, companyId);

      expect(repositoryMock.findCategoryByName).toHaveBeenCalledWith(
        companyId,
        'Nueva',
      );
      // created at the next sort order (max 2 -> 3)
      expect(repositoryMock.createCategory).toHaveBeenCalledWith(
        companyId,
        'Nueva',
        3,
      );
      expect(repositoryMock.insertServiceCategoryLink).toHaveBeenCalledWith(
        companyId,
        77,
        30,
        1,
      );
    });

    it('throws BAD_REQUEST when no category is provided at all', async () => {
      const dto: CreateVariableServiceDto = { name: 'Var', price: 10 } as any;

      await expect(
        service.createVariableService(dto, companyId),
      ).rejects.toBeInstanceOf(HttpException);
      expect(repositoryMock.createVariableService).not.toHaveBeenCalled();
    });
  });

  describe('updateVariableService()', () => {
    it('strips category_ids from the row update and syncs the category links', async () => {
      const dto = { name: 'New', category_ids: [10] } as any;
      repositoryMock.updateVariableService.mockResolvedValue({
        data: {},
      } as any);

      await service.updateVariableService(5, dto, companyId);

      // the links column must NOT be part of the row update
      expect(repositoryMock.updateVariableService).toHaveBeenCalledWith(5, {
        name: 'New',
      });
      // links are synced (service starts with no links -> one insert)
      expect(repositoryMock.insertServiceCategoryLink).toHaveBeenCalledWith(
        companyId,
        5,
        10,
        1,
      );
    });

    it('throws BAD_REQUEST when category_ids is provided but empty', async () => {
      const dto = { name: 'New', category_ids: [] } as any;
      repositoryMock.updateVariableService.mockResolvedValue({
        data: {},
      } as any);

      await expect(
        service.updateVariableService(5, dto, companyId),
      ).rejects.toBeInstanceOf(HttpException);
    });

    it('does not touch links when category_ids is omitted', async () => {
      const dto = { name: 'New' } as any;
      repositoryMock.updateVariableService.mockResolvedValue({
        data: {},
      } as any);

      await service.updateVariableService(5, dto, companyId);

      expect(repositoryMock.updateVariableService).toHaveBeenCalledWith(5, {
        name: 'New',
      });
      expect(repositoryMock.getLinksForService).not.toHaveBeenCalled();
      expect(repositoryMock.insertServiceCategoryLink).not.toHaveBeenCalled();
    });
  });

  describe('setServiceCategories()', () => {
    it('throws BAD_REQUEST when no categories are given', async () => {
      await expect(
        service.setServiceCategories(companyId, 5, []),
      ).rejects.toBeInstanceOf(HttpException);
    });

    it('syncs links (removing the ones no longer selected) and returns success', async () => {
      // service currently linked to categories 10 and 20; target is 10 and 30
      repositoryMock.getLinksForService.mockResolvedValue({
        data: [{ category_id: 10 }, { category_id: 20 }],
      } as any);

      const result = await service.setServiceCategories(companyId, 5, [10, 30]);

      // 20 removed, 30 added, 10 untouched
      expect(repositoryMock.deleteServiceCategoryLink).toHaveBeenCalledWith(
        5,
        20,
      );
      expect(repositoryMock.insertServiceCategoryLink).toHaveBeenCalledWith(
        companyId,
        5,
        30,
        1,
      );
      expect(result).toEqual({ success: true });
    });
  });

  describe('reorderServicesInCategory()', () => {
    it('assigns 1-based sort orders in the given order', async () => {
      await service.reorderServicesInCategory(companyId, 2, [7, 3, 9]);

      expect(repositoryMock.updateLinkSortOrder).toHaveBeenNthCalledWith(
        1,
        7,
        2,
        1,
      );
      expect(repositoryMock.updateLinkSortOrder).toHaveBeenNthCalledWith(
        2,
        3,
        2,
        2,
      );
      expect(repositoryMock.updateLinkSortOrder).toHaveBeenNthCalledWith(
        3,
        9,
        2,
        3,
      );
    });
  });

  describe('category management', () => {
    it('createCategoryForCompany returns an existing category without creating a new one', async () => {
      repositoryMock.findCategoryByName.mockResolvedValue({
        data: [{ id: 5, name: 'Cat' }],
      } as any);

      const result = await service.createCategoryForCompany(companyId, 'Cat');

      expect(result).toEqual({ id: 5, name: 'Cat' });
      expect(repositoryMock.createCategory).not.toHaveBeenCalled();
    });

    it('renameOrUpdateCategory trims the name and forwards only provided fields', async () => {
      repositoryMock.updateCategory.mockResolvedValue({
        data: { id: 3, name: 'New' },
      } as any);

      await service.renameOrUpdateCategory(companyId, 3, {
        name: '  New  ',
        is_active: false,
      });

      expect(repositoryMock.updateCategory).toHaveBeenCalledWith(companyId, 3, {
        name: 'New',
        is_active: false,
      });
    });

    it('deleteCategoryForCompany blocks deletion when services depend solely on the category', async () => {
      repositoryMock.getServicesOnlyInCategory.mockResolvedValue([1, 2] as any);

      await expect(
        service.deleteCategoryForCompany(companyId, 3),
      ).rejects.toBeInstanceOf(HttpException);
      expect(repositoryMock.deleteCategory).not.toHaveBeenCalled();
    });

    it('deleteCategoryForCompany deletes when no service is orphaned', async () => {
      repositoryMock.getServicesOnlyInCategory.mockResolvedValue([] as any);

      const result = await service.deleteCategoryForCompany(companyId, 3);

      expect(repositoryMock.deleteCategory).toHaveBeenCalledWith(companyId, 3);
      expect(result).toEqual({ success: true });
    });

    it('reorderCategories writes 1-based sort_order for each category', async () => {
      await service.reorderCategories(companyId, [8, 3]);

      expect(repositoryMock.updateCategory).toHaveBeenNthCalledWith(
        1,
        companyId,
        8,
        {
          sort_order: 1,
        },
      );
      expect(repositoryMock.updateCategory).toHaveBeenNthCalledWith(
        2,
        companyId,
        3,
        {
          sort_order: 2,
        },
      );
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
