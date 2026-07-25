import { Test, TestingModule } from '@nestjs/testing';
import { PinoLogger } from 'nestjs-pino';
import { SupabaseService } from 'src/supabase/supabase.service';
import { ServicesRepository } from '../services.repository';

/**
 * Chainable Supabase query-builder mock. Every builder method returns the same
 * object so `.from().select().eq()` works and each call can be asserted. The
 * builder is also thenable — some repository methods `await` the query chain
 * internally — resolving to the next value queued via `setResults(...)` (or a
 * default `{ data: null }`).
 */
const createQueryBuilder = () => {
  const builder: any = {};
  for (const method of [
    'select',
    'insert',
    'upsert',
    'update',
    'delete',
    'eq',
    'in',
    'ilike',
    'order',
    'limit',
    'single',
  ]) {
    builder[method] = jest.fn(() => builder);
  }
  const queue: any[] = [];
  builder.setResults = (...vals: any[]) => queue.push(...vals);
  builder.then = (onFulfilled: any, onRejected: any) => {
    const value = queue.length ? queue.shift() : { data: null, error: null };
    return Promise.resolve(value).then(onFulfilled, onRejected);
  };
  return builder;
};

describe('ServicesRepository', () => {
  let repository: ServicesRepository;
  let builder: ReturnType<typeof createQueryBuilder>;
  let fromMock: jest.Mock;

  const companyId = 1;

  beforeEach(async () => {
    builder = createQueryBuilder();
    fromMock = jest.fn(() => builder);

    const supabaseMock = { client: { from: fromMock } } as any;
    const loggerMock = {
      info: jest.fn(),
      error: jest.fn(),
      setContext: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ServicesRepository,
        { provide: SupabaseService, useValue: supabaseMock },
        { provide: PinoLogger, useValue: loggerMock },
      ],
    }).compile();

    repository = module.get<ServicesRepository>(ServicesRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(repository).toBeDefined();
  });

  // ---- variable / fixed services ----

  it('createVariableServices upserts into variable_services ignoring duplicates', () => {
    const services = [{ name: 'v', company_id: companyId }] as any;
    repository.createVariableServices(services);

    expect(fromMock).toHaveBeenCalledWith('variable_services');
    expect(builder.upsert).toHaveBeenCalledWith(services, {
      ignoreDuplicates: true,
      onConflict: 'company_id,category,name',
    });
  });

  it('createFixedServices upserts into fixed_services ignoring duplicates', () => {
    const services = [{ name: 'f', company_id: companyId }] as any;
    repository.createFixedServices(services);

    expect(fromMock).toHaveBeenCalledWith('fixed_services');
    expect(builder.upsert).toHaveBeenCalledWith(services, {
      ignoreDuplicates: true,
      onConflict: 'company_id,name',
    });
  });

  it('createVariableService inserts and returns a single row', () => {
    const dto = { name: 'v' } as any;
    repository.createVariableService(dto);

    expect(fromMock).toHaveBeenCalledWith('variable_services');
    expect(builder.insert).toHaveBeenCalledWith(dto);
    expect(builder.select).toHaveBeenCalled();
    expect(builder.single).toHaveBeenCalled();
  });

  it('findAllVariableServices scopes the query by company_id', () => {
    repository.findAllVariableServices(companyId);

    expect(fromMock).toHaveBeenCalledWith('variable_services');
    expect(builder.select).toHaveBeenCalledWith('*');
    expect(builder.eq).toHaveBeenCalledWith('company_id', companyId);
  });

  it('updateVariableService updates the row matching the id', () => {
    const dto = { name: 'v2' } as any;
    repository.updateVariableService(3, dto);

    expect(fromMock).toHaveBeenCalledWith('variable_services');
    expect(builder.update).toHaveBeenCalledWith(dto);
    expect(builder.eq).toHaveBeenCalledWith('id', 3);
  });

  it('removeVariableService deletes the row matching the id', () => {
    repository.removeVariableService(5);

    expect(fromMock).toHaveBeenCalledWith('variable_services');
    expect(builder.delete).toHaveBeenCalled();
    expect(builder.eq).toHaveBeenCalledWith('id', 5);
  });

  it('upsertServiceCategory upserts on the company_id,name conflict target', () => {
    repository.upsertServiceCategory(companyId, 'cat', true);

    expect(fromMock).toHaveBeenCalledWith('service_categories');
    expect(builder.upsert).toHaveBeenCalledWith(
      { company_id: companyId, name: 'cat', is_active: true },
      { onConflict: 'company_id,name' },
    );
    expect(builder.single).toHaveBeenCalled();
  });

  // ---- multi-category: service <-> category links ----

  it('findAllServiceCategoryLinks reads the link table scoped by company_id', () => {
    repository.findAllServiceCategoryLinks(companyId);

    expect(fromMock).toHaveBeenCalledWith('variable_service_categories');
    expect(builder.select).toHaveBeenCalledWith('*');
    expect(builder.eq).toHaveBeenCalledWith('company_id', companyId);
  });

  it('getLinksForService filters links by the service id', () => {
    repository.getLinksForService(42);

    expect(fromMock).toHaveBeenCalledWith('variable_service_categories');
    expect(builder.eq).toHaveBeenCalledWith('variable_service_id', 42);
  });

  it('getMaxServiceSortOrder returns the highest sort order in a category', async () => {
    builder.setResults({ data: [{ sort_order: 7 }] });

    const result = await repository.getMaxServiceSortOrder(companyId, 3);

    expect(fromMock).toHaveBeenCalledWith('variable_service_categories');
    expect(builder.eq).toHaveBeenCalledWith('company_id', companyId);
    expect(builder.eq).toHaveBeenCalledWith('category_id', 3);
    expect(builder.order).toHaveBeenCalledWith('sort_order', {
      ascending: false,
    });
    expect(result).toBe(7);
  });

  it('getMaxServiceSortOrder returns 0 when there are no links', async () => {
    builder.setResults({ data: [] });
    expect(await repository.getMaxServiceSortOrder(companyId, 3)).toBe(0);
  });

  it('insertServiceCategoryLink inserts a fully-scoped link row', () => {
    repository.insertServiceCategoryLink(companyId, 5, 10, 2);

    expect(fromMock).toHaveBeenCalledWith('variable_service_categories');
    expect(builder.insert).toHaveBeenCalledWith({
      company_id: companyId,
      variable_service_id: 5,
      category_id: 10,
      sort_order: 2,
    });
  });

  it('deleteServiceCategoryLink deletes the matching service/category link', () => {
    repository.deleteServiceCategoryLink(5, 10);

    expect(fromMock).toHaveBeenCalledWith('variable_service_categories');
    expect(builder.delete).toHaveBeenCalled();
    expect(builder.eq).toHaveBeenCalledWith('variable_service_id', 5);
    expect(builder.eq).toHaveBeenCalledWith('category_id', 10);
  });

  it('updateLinkSortOrder updates the sort order of one link', () => {
    repository.updateLinkSortOrder(5, 10, 4);

    expect(fromMock).toHaveBeenCalledWith('variable_service_categories');
    expect(builder.update).toHaveBeenCalledWith({ sort_order: 4 });
    expect(builder.eq).toHaveBeenCalledWith('variable_service_id', 5);
    expect(builder.eq).toHaveBeenCalledWith('category_id', 10);
  });

  // ---- category management ----

  it('findCategoryByName does a case-insensitive lookup scoped by company_id', () => {
    repository.findCategoryByName(companyId, 'Bebidas');

    expect(fromMock).toHaveBeenCalledWith('service_categories');
    expect(builder.eq).toHaveBeenCalledWith('company_id', companyId);
    expect(builder.ilike).toHaveBeenCalledWith('name', 'Bebidas');
    expect(builder.limit).toHaveBeenCalledWith(1);
  });

  it('getMaxCategorySortOrder returns the highest category sort order', async () => {
    builder.setResults({ data: [{ sort_order: 4 }] });

    const result = await repository.getMaxCategorySortOrder(companyId);

    expect(fromMock).toHaveBeenCalledWith('service_categories');
    expect(builder.eq).toHaveBeenCalledWith('company_id', companyId);
    expect(result).toBe(4);
  });

  it('createCategory inserts an active category at the given sort order', () => {
    repository.createCategory(companyId, 'Nueva', 3);

    expect(fromMock).toHaveBeenCalledWith('service_categories');
    expect(builder.insert).toHaveBeenCalledWith({
      company_id: companyId,
      name: 'Nueva',
      is_active: true,
      sort_order: 3,
    });
    expect(builder.single).toHaveBeenCalled();
  });

  it('updateCategory updates the fields scoped by company_id and id', () => {
    repository.updateCategory(companyId, 9, { name: 'X' });

    expect(fromMock).toHaveBeenCalledWith('service_categories');
    expect(builder.update).toHaveBeenCalledWith({ name: 'X' });
    expect(builder.eq).toHaveBeenCalledWith('company_id', companyId);
    expect(builder.eq).toHaveBeenCalledWith('id', 9);
    expect(builder.single).toHaveBeenCalled();
  });

  it('deleteCategory deletes the category scoped by company_id and id', () => {
    repository.deleteCategory(companyId, 9);

    expect(fromMock).toHaveBeenCalledWith('service_categories');
    expect(builder.delete).toHaveBeenCalled();
    expect(builder.eq).toHaveBeenCalledWith('company_id', companyId);
    expect(builder.eq).toHaveBeenCalledWith('id', 9);
  });

  describe('getServicesOnlyInCategory', () => {
    it('returns services whose only link is the given category', async () => {
      // 1st query: services linked to category 3
      builder.setResults({
        data: [{ variable_service_id: 1 }, { variable_service_id: 2 }],
      });
      // 2nd query: all links for those services (service 1 only in cat 3;
      // service 2 also in cat 4 -> not orphaned)
      builder.setResults({
        data: [
          { variable_service_id: 1, category_id: 3 },
          { variable_service_id: 2, category_id: 3 },
          { variable_service_id: 2, category_id: 4 },
        ],
      });

      const result = await repository.getServicesOnlyInCategory(companyId, 3);

      expect(fromMock).toHaveBeenCalledWith('variable_service_categories');
      expect(builder.in).toHaveBeenCalledWith('variable_service_id', [1, 2]);
      expect(result).toEqual([1]);
    });

    it('short-circuits to an empty array when no service is in the category', async () => {
      builder.setResults({ data: [] });

      const result = await repository.getServicesOnlyInCategory(companyId, 3);

      expect(result).toEqual([]);
      // second query never runs
      expect(builder.in).not.toHaveBeenCalled();
    });
  });
});
